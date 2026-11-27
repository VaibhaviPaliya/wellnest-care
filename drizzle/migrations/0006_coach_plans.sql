-- WellNest · Batch 1: coaches create weekly exercise plans with YouTube videos; reports and admin moderation.
-- Run after 0005. Safe to run more than once.
--
--  * An approved coach saves up to 10 plans. They go live straight away (post-publication moderation).
--  * Seniors and family can report a plan once each; two different reporters hide it until an admin reviews it.
--  * Admins hide or restore any plan; restoring clears its reports. Hidden plans are invisible to customers.

-- Plans the caller owns (approved coach listing).
CREATE OR REPLACE FUNCTION public.my_coach_listing()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.catalog c
  WHERE c.kind = 'coach' AND c.data->>'ownerId' = auth.uid()::text AND coalesce((c.data->>'verified')::boolean, false)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.coach_save_plan(_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  coach text := public.my_coach_listing();
  old jsonb;
  pid text;
  d jsonb;
  i int := 0;
  days text[] := ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  yt text := '^https?://((www|m|music)\.)?(youtube\.com/(watch\?v=|shorts/|embed/|live/)|youtu\.be/|youtube-nocookie\.com/embed/)[A-Za-z0-9_-]{11}';
BEGIN
  IF coach IS NULL THEN RAISE EXCEPTION 'Only an approved fitness coach can publish plans'; END IF;
  IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR length(_data::text) > 20000 THEN RAISE EXCEPTION 'The plan is too large'; END IF;
  IF coalesce(btrim(_data->>'name'), '') = '' OR length(_data->>'name') > 80 THEN RAISE EXCEPTION 'Give the plan a name (up to 80 characters)'; END IF;
  IF length(coalesce(_data->>'description', '')) > 300 THEN RAISE EXCEPTION 'Keep the description under 300 characters'; END IF;
  IF coalesce(_data->>'intensity', '') NOT IN ('gentle', 'moderate') THEN RAISE EXCEPTION 'Choose gentle or moderate intensity'; END IF;
  IF jsonb_typeof(_data->'mobility') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'mobility') = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(_data->'mobility') m WHERE m NOT IN ('independent', 'assisted', 'limited')) THEN
    RAISE EXCEPTION 'Choose who can follow this plan (mobility)';
  END IF;
  IF jsonb_typeof(coalesce(_data->'notFor', '[]'::jsonb)) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(_data->'notFor', '[]'::jsonb)) c WHERE c NOT IN ('diabetes', 'high_bp', 'heart', 'chewing')) THEN
    RAISE EXCEPTION 'Unknown health condition in "not suitable for"';
  END IF;
  IF jsonb_typeof(_data->'days') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'days') <> 7 THEN RAISE EXCEPTION 'A plan has one entry for each day, Monday to Sunday'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(_data->'days') LOOP
    i := i + 1;
    IF d->>'day' IS DISTINCT FROM days[i] THEN RAISE EXCEPTION 'Days must run Monday to Sunday'; END IF;
    IF jsonb_typeof(d->'minutes') IS DISTINCT FROM 'number' OR (d->>'minutes')::numeric NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION '%: minutes must be 0–60', days[i]; END IF;
    IF (d->>'minutes')::numeric > 0 AND (coalesce(btrim(d->>'title'), '') = '' OR length(d->>'title') > 80) THEN RAISE EXCEPTION '%: describe the exercise', days[i]; END IF;
    IF coalesce(d->>'videoUrl', '') <> '' AND d->>'videoUrl' !~ yt THEN RAISE EXCEPTION '%: use a YouTube link', days[i]; END IF;
  END LOOP;

  SELECT p.data INTO old FROM public.catalog p WHERE p.kind = 'plan' AND p.id = _data->>'id' AND p.data->>'ownerId' = auth.uid()::text;
  IF old IS NULL AND (SELECT count(*) FROM public.catalog p WHERE p.kind = 'plan' AND p.data->>'ownerId' = auth.uid()::text) >= 10 THEN
    RAISE EXCEPTION 'You can publish up to 10 plans. Delete one first.';
  END IF;
  pid := CASE WHEN old IS NULL THEN 'pl-' || replace(gen_random_uuid()::text, '-', '') ELSE _data->>'id' END;
  INSERT INTO public.catalog (kind, id, ord, data) VALUES ('plan', pid, 1000, jsonb_build_object(
      'id', pid, 'coachId', coach, 'ownerId', auth.uid()::text, 'name', btrim(_data->>'name'),
      'description', coalesce(btrim(_data->>'description'), ''), 'intensity', _data->>'intensity',
      'mobility', _data->'mobility', 'notFor', coalesce(_data->'notFor', '[]'::jsonb),
      'days', (SELECT jsonb_agg(jsonb_build_object('day', x->>'day', 'title', btrim(coalesce(x->>'title', '')), 'minutes', (x->>'minutes')::int)
                                || CASE WHEN coalesce(x->>'videoUrl', '') <> '' THEN jsonb_build_object('videoUrl', x->>'videoUrl') ELSE '{}'::jsonb END)
               FROM jsonb_array_elements(_data->'days') x),
      'published', true, 'updatedAt', now())
    -- Editing never un-hides a plan an admin or reports have hidden.
    || CASE WHEN coalesce((old->>'hidden')::boolean, false) THEN jsonb_build_object('hidden', true, 'hiddenReason', old->'hiddenReason') ELSE '{}'::jsonb END)
  ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.coach_delete_plan(_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.catalog WHERE kind = 'plan' AND id = _id AND data->>'ownerId' = auth.uid()::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only delete your own plans'; END IF;
END $$;

-- Reports
CREATE TABLE IF NOT EXISTS public.plan_reports (
  plan_id text NOT NULL,
  reporter uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, reporter)
);
ALTER TABLE public.plan_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_reports FROM anon, authenticated;
GRANT SELECT ON public.plan_reports TO authenticated;
GRANT ALL ON public.plan_reports TO service_role;
DROP POLICY IF EXISTS "Admins read reports" ON public.plan_reports;
CREATE POLICY "Admins read reports" ON public.plan_reports FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.report_plan(_id text, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT (public.has_role_text('senior') OR public.has_role_text('family')) THEN RAISE EXCEPTION 'Only seniors and family members can report a plan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog WHERE kind = 'plan' AND id = _id) THEN RAISE EXCEPTION 'Plan not found'; END IF;
  IF coalesce(length(btrim(_reason)), 0) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Tell us briefly what is wrong (3–300 characters)'; END IF;
  INSERT INTO public.plan_reports (plan_id, reporter, reason) VALUES (_id, auth.uid(), btrim(_reason))
  ON CONFLICT (plan_id, reporter) DO NOTHING;
  SELECT count(*) INTO n FROM public.plan_reports WHERE plan_id = _id;
  IF n >= 2 THEN
    UPDATE public.catalog SET data = data || '{"hidden": true, "hiddenReason": "reports"}'::jsonb, updated_at = now()
    WHERE kind = 'plan' AND id = _id AND NOT coalesce((data->>'hidden')::boolean, false);
    RETURN true;
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_plan_hidden(_id text, _hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can moderate plans'; END IF;
  UPDATE public.catalog SET updated_at = now(), data = CASE WHEN _hidden
      THEN data || '{"hidden": true, "hiddenReason": "admin"}'::jsonb
      ELSE (data - 'hidden' - 'hiddenReason') END
  WHERE kind = 'plan' AND id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  IF NOT _hidden THEN DELETE FROM public.plan_reports WHERE plan_id = _id; END IF;
END $$;

-- Hidden plans are invisible to customers (owner coach and admins still see them).
DROP POLICY IF EXISTS "Read approved partners and own listing" ON public.catalog;
CREATE POLICY "Read approved partners and own listing" ON public.catalog FOR SELECT TO authenticated USING (
  public.is_admin() OR (kind <> 'meta' AND (
    (kind NOT IN ('coach', 'kitchen', 'pharmacy', 'delivery', 'plan'))
    OR (kind = 'plan' AND (NOT coalesce((data->>'hidden')::boolean, false) OR data->>'ownerId' = auth.uid()::text))
    OR (kind IN ('coach', 'kitchen', 'pharmacy', 'delivery') AND coalesce((data->>'verified')::boolean, false))
    OR data->>'ownerId' = auth.uid()::text
    OR (kind = 'delivery' AND (data->>'ownerPartnerId' IN (SELECT id FROM public.my_store()) OR id IN (SELECT public.my_rider_ids())))
  ))
);

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.my_coach_listing()', 'public.coach_save_plan(jsonb)', 'public.coach_delete_plan(text)',
                           'public.report_plan(text, text)', 'public.admin_set_plan_hidden(text, boolean)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
