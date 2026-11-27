-- WellNest · Batch 2: verified detailed reviews, partner rating summaries, and certificates checked by the admin.
-- Run after 0006. Safe to run more than once.
--
--  * A review is accepted only once per booking, only after it is completed, only from the senior or linked family.
--    Coach sessions (and therapy, batch 4) carry three extra scores: punctuality, safety & gentleness, explanation.
--  * Each partner listing keeps a ratingSummary (average, count, sub-scores) that the server recalculates,
--    so every customer sees the same numbers. Admins can hide an abusive review.
--  * Coaches upload certificates (PDF/photo). Only the coach and admins can see the file; once approved, the
--    certificate name appears on the coach's profile as a "Certified" badge.
--  * Resubmitting partner details no longer drops server-managed listing fields (certificates, ratings, packs, pickup).

CREATE OR REPLACE FUNCTION public.valid_review(_r jsonb, _type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  -- coalesce: a missing score must give false, never NULL (NULL would slip past "IF NOT ...").
  SELECT coalesce(jsonb_typeof(_r) = 'object'
    AND jsonb_typeof(_r->'rating') = 'number' AND (_r->>'rating')::numeric IN (1, 2, 3, 4, 5)
    AND length(coalesce(_r->>'text', '')) <= 500
    AND (_type NOT IN ('fitness', 'therapy') OR (
      jsonb_typeof(_r->'punctuality') = 'number' AND (_r->>'punctuality')::numeric IN (1, 2, 3, 4, 5)
      AND jsonb_typeof(_r->'safety') = 'number' AND (_r->>'safety')::numeric IN (1, 2, 3, 4, 5)
      AND jsonb_typeof(_r->'explanation') = 'number' AND (_r->>'explanation')::numeric IN (1, 2, 3, 4, 5))), false)
$$;

CREATE OR REPLACE FUNCTION public.check_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  partner_kind text;
  partner jsonb;
  senior_pin text;
  trusted boolean := coalesce(current_setting('wellnest.trusted', true), '') = 'on';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.senior_id <> OLD.senior_id OR NEW.data->>'partnerId' <> OLD.data->>'partnerId' OR NEW.data->>'when' <> OLD.data->>'when' THEN
      RAISE EXCEPTION 'A booking''s senior, partner and time cannot be changed';
    END IF;
    IF NOT trusted AND NOT public.is_admin() THEN
      IF NEW.data->'deliveryId' IS DISTINCT FROM OLD.data->'deliveryId' OR NEW.data->'deliveryName' IS DISTINCT FROM OLD.data->'deliveryName'
         OR NEW.data->'offer' IS DISTINCT FROM OLD.data->'offer' OR NEW.data->'assignedAt' IS DISTINCT FROM OLD.data->'assignedAt' THEN
        RAISE EXCEPTION 'Delivery partners are assigned by WellNest dispatch';
      END IF;
      IF NEW.data->>'status' IS DISTINCT FROM OLD.data->>'status' AND NEW.data->>'status' <> 'cancelled' THEN
        RAISE EXCEPTION 'Only the partner can update this order''s progress';
      END IF;
    END IF;
    -- Reviews: once, after completion, by the senior or their linked family; scores 1–5. Admins may hide one.
    IF NEW.data->'review' IS DISTINCT FROM OLD.data->'review' AND NOT trusted AND NOT public.is_admin() THEN
      IF OLD.data->'review' IS NOT NULL AND jsonb_typeof(OLD.data->'review') = 'object' THEN RAISE EXCEPTION 'This booking has already been reviewed'; END IF;
      IF OLD.data->>'status' <> 'completed' THEN RAISE EXCEPTION 'You can review only after the session or order is completed'; END IF;
      IF NOT public.can_manage_senior(NEW.senior_id) THEN RAISE EXCEPTION 'Only the senior or their family can review this booking'; END IF;
      IF NOT public.valid_review(NEW.data->'review', NEW.data->>'type') THEN RAISE EXCEPTION 'Give each score from 1 to 5 (text up to 500 characters)'; END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.booked_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Bookings must be made by the signed-in user'; END IF;
  partner_kind := CASE NEW.data->>'type' WHEN 'fitness' THEN 'coach' WHEN 'meal' THEN 'kitchen' WHEN 'medicine' THEN 'pharmacy' END;
  SELECT c.data INTO partner FROM public.catalog c
  WHERE c.kind = partner_kind AND c.id = NEW.data->>'partnerId' AND (c.data->>'verified')::boolean;
  IF partner_kind IS NULL OR partner IS NULL THEN RAISE EXCEPTION 'This partner is not available'; END IF;
  IF NOT (NEW.data->>'type' = 'fitness' AND NEW.data->>'videoUrl' IS NOT NULL) THEN
    SELECT p.pincode INTO senior_pin FROM public.profiles p WHERE p.id = NEW.senior_id;
    IF senior_pin IS NULL THEN RAISE EXCEPTION 'Add the senior''s pincode to their address first'; END IF;
    IF NOT coalesce(partner->'servicePincodes' ? senior_pin, false) THEN
      RAISE EXCEPTION 'This partner does not serve pincode %', senior_pin;
    END IF;
  END IF;
  IF (NEW.data->>'when')::timestamptz <= now() THEN RAISE EXCEPTION 'Please select a future time'; END IF;
  IF NEW.data->>'type' = 'fitness' AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.data->>'type' = 'fitness' AND b.data->>'partnerId' = NEW.data->>'partnerId'
      AND (b.data->>'when')::timestamptz = (NEW.data->>'when')::timestamptz AND b.data->>'status' <> 'cancelled'
  ) THEN RAISE EXCEPTION 'This slot has already been booked'; END IF;
  -- Orders from a store with its own riders are dispatched by the server, not assigned by the browser.
  IF NEW.data->>'type' IN ('meal', 'medicine') AND EXISTS (
    SELECT 1 FROM public.catalog d WHERE d.kind = 'delivery' AND d.data->>'ownerPartnerId' = NEW.data->>'partnerId' AND (d.data->>'verified')::boolean
  ) THEN
    NEW.data := NEW.data - 'deliveryId' - 'deliveryName' - 'offer' - 'assignedAt';
  END IF;
  RETURN NEW;
END $$;


-- Rating summary kept on the partner listing (recalculated whenever a review is added or hidden).
CREATE OR REPLACE FUNCTION public.refresh_partner_rating(_type text, _partner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text := CASE _type WHEN 'fitness' THEN 'coach' WHEN 'meal' THEN 'kitchen' WHEN 'medicine' THEN 'pharmacy' WHEN 'therapy' THEN 'therapist' END;
  s jsonb;
BEGIN
  IF k IS NULL THEN RETURN; END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object(
      'avg', round(avg((data->'review'->>'rating')::numeric), 1),
      'count', count(*),
      'punctuality', round(avg((data->'review'->>'punctuality')::numeric), 1),
      'safety', round(avg((data->'review'->>'safety')::numeric), 1),
      'explanation', round(avg((data->'review'->>'explanation')::numeric), 1)))
    INTO s
  FROM public.bookings
  WHERE data->>'partnerId' = _partner AND data->>'type' = _type AND data->>'status' = 'completed'
    AND jsonb_typeof(data->'review') = 'object' AND NOT coalesce((data->'review'->>'hidden')::boolean, false);
  UPDATE public.catalog SET data = CASE WHEN (s->>'count')::int > 0 THEN data || jsonb_build_object('ratingSummary', s) ELSE data - 'ratingSummary' END,
                            updated_at = now()
  WHERE kind = k AND id = _partner;
END $$;

CREATE OR REPLACE FUNCTION public.review_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data->'review' IS DISTINCT FROM OLD.data->'review' THEN
    PERFORM public.refresh_partner_rating(NEW.data->>'type', NEW.data->>'partnerId');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bookings_review_summary ON public.bookings;
CREATE TRIGGER bookings_review_summary AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.review_changed();

-- Public, verified reviews for a partner (first name only, no booking details).
CREATE OR REPLACE FUNCTION public.partner_reviews(_partner text)
RETURNS TABLE (booking_id text, rating int, punctuality int, safety int, explanation int, text text, at timestamptz, reviewer text, hidden boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, (b.data->'review'->>'rating')::int, (b.data->'review'->>'punctuality')::int, (b.data->'review'->>'safety')::int,
         (b.data->'review'->>'explanation')::int, nullif(b.data->'review'->>'text', ''),
         coalesce((b.data->'review'->>'at')::timestamptz, b.updated_at), split_part(coalesce(p.name, 'WellNest user'), ' ', 1),
         coalesce((b.data->'review'->>'hidden')::boolean, false)
  FROM public.bookings b LEFT JOIN public.profiles p ON p.id = b.senior_id
  WHERE auth.uid() IS NOT NULL AND b.data->>'partnerId' = _partner AND b.data->>'status' = 'completed'
    AND jsonb_typeof(b.data->'review') = 'object'
    AND (NOT coalesce((b.data->'review'->>'hidden')::boolean, false) OR public.is_admin())
  ORDER BY 7 DESC
  LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.admin_hide_review(_booking text, _hidden boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can moderate reviews'; END IF;
  UPDATE public.bookings SET data = jsonb_set(data, '{review,hidden}', to_jsonb(_hidden))
  WHERE id = _booking AND jsonb_typeof(data->'review') = 'object';
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
END $$;

-- Certificates -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_certificates (
  id text PRIMARY KEY,
  owner_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 2 AND 120),
  doc text NOT NULL CHECK (length(doc) <= 1500000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.partner_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_certificates FROM anon, authenticated;
GRANT SELECT (id, owner_user, partner_id, name, issuer, status, note, uploaded_at, reviewed_at) ON public.partner_certificates TO authenticated;
GRANT ALL ON public.partner_certificates TO service_role;
DROP POLICY IF EXISTS "Owner and admins" ON public.partner_certificates;
CREATE POLICY "Owner and admins" ON public.partner_certificates FOR SELECT TO authenticated USING (owner_user = auth.uid() OR public.is_admin());

-- The approved certificate names shown on the listing (never the file).
CREATE OR REPLACE FUNCTION public.refresh_certifications(_partner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE certs jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'issuer', issuer) ORDER BY reviewed_at), '[]'::jsonb) INTO certs
  FROM public.partner_certificates WHERE partner_id = _partner AND status = 'approved';
  UPDATE public.catalog SET data = CASE WHEN jsonb_array_length(certs) > 0 THEN data || jsonb_build_object('certifications', certs) ELSE data - 'certifications' END,
                            updated_at = now()
  WHERE kind IN ('coach', 'therapist') AND id = _partner;
END $$;

CREATE OR REPLACE FUNCTION public.partner_upload_certificate(_name text, _issuer text, _doc text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  listing text;
  cid text := 'ce-' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT c.id INTO listing FROM public.catalog c WHERE c.kind IN ('coach', 'therapist') AND c.data->>'ownerId' = auth.uid()::text LIMIT 1;
  IF listing IS NULL THEN RAISE EXCEPTION 'Only coaches and therapists can add certificates'; END IF;
  IF coalesce(length(btrim(_name)), 0) NOT BETWEEN 2 AND 120 OR coalesce(length(btrim(_issuer)), 0) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Enter the certificate name and who issued it';
  END IF;
  IF _doc !~ '^data:(image/(jpeg|png|webp)|application/pdf);base64,[A-Za-z0-9+/=]+$' OR length(_doc) > 1500000 THEN
    RAISE EXCEPTION 'Upload a JPG, PNG, WebP or PDF up to 1 MB';
  END IF;
  IF (SELECT count(*) FROM public.partner_certificates WHERE owner_user = auth.uid()) >= 10 THEN RAISE EXCEPTION 'You can keep up to 10 certificates'; END IF;
  INSERT INTO public.partner_certificates (id, owner_user, partner_id, name, issuer, doc) VALUES (cid, auth.uid(), listing, btrim(_name), btrim(_issuer), _doc);
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.partner_delete_certificate(_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text;
BEGIN
  DELETE FROM public.partner_certificates WHERE id = _id AND owner_user = auth.uid() RETURNING partner_id INTO p;
  IF p IS NULL THEN RAISE EXCEPTION 'You can only delete your own certificates'; END IF;
  PERFORM public.refresh_certifications(p);
END $$;

CREATE OR REPLACE FUNCTION public.certificate_document(_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can open certificates'; END IF;
  SELECT doc INTO d FROM public.partner_certificates WHERE id = _id;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.review_certificate(_id text, _approve boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can verify certificates'; END IF;
  IF NOT _approve AND coalesce(length(btrim(_note)), 0) < 3 THEN RAISE EXCEPTION 'Give a reason so they can fix it'; END IF;
  UPDATE public.partner_certificates SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         note = nullif(btrim(coalesce(_note, '')), ''), reviewed_at = now()
  WHERE id = _id RETURNING partner_id INTO p;
  IF p IS NULL THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  PERFORM public.refresh_certifications(p);
END $$;

-- Partner details resubmission keeps server-managed fields.
CREATE OR REPLACE FUNCTION public.submit_partner(_kind text, _data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mine record;
  new_id text;
  clean jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner() THEN RAISE EXCEPTION 'Only partner accounts can apply'; END IF;
  IF _kind NOT IN ('coach', 'kitchen', 'pharmacy') THEN RAISE EXCEPTION 'Choose pharmacy, kitchen or fitness coach'; END IF;
  IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR length(_data::text) > 20000 THEN RAISE EXCEPTION 'The application is too large'; END IF;
  IF coalesce(btrim(_data->>'name'), '') = '' OR length(_data->>'name') > 120 THEN RAISE EXCEPTION 'Enter the business or coach name'; END IF;
  IF coalesce(btrim(_data->>'licence'), '') = '' OR length(_data->>'licence') > 80 THEN RAISE EXCEPTION 'Enter the licence or registration number'; END IF;
  IF jsonb_typeof(_data->'servicePincodes') IS DISTINCT FROM 'array'
     OR jsonb_array_length(_data->'servicePincodes') NOT BETWEEN 1 AND 50
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_data->'servicePincodes') p
                WHERE jsonb_typeof(p) <> 'string' OR p #>> '{}' !~ '^[1-8][0-9]{5}$')
  THEN RAISE EXCEPTION 'Add between 1 and 50 valid service pincodes'; END IF;
  IF _kind = 'coach' AND (jsonb_typeof(_data->'price') IS DISTINCT FROM 'number' OR (_data->>'price')::numeric NOT BETWEEN 1 AND 100000) THEN
    RAISE EXCEPTION 'Enter a session price between ₹1 and ₹1,00,000';
  END IF;

  SELECT c.kind, c.id INTO mine FROM public.catalog c
  WHERE c.kind IN ('coach', 'kitchen', 'pharmacy') AND c.data->>'ownerId' = auth.uid()::text LIMIT 1;
  IF FOUND AND mine.kind <> _kind THEN RAISE EXCEPTION 'Your account already has a % listing', mine.kind; END IF;
  new_id := coalesce(mine.id, left(_kind, 2) || '-' || replace(gen_random_uuid()::text, '-', ''));

  -- Whatever the browser sends, a submission is always pending and unverified until an admin approves it.
  clean := (_data - 'id' - 'ownerId' - 'verified' - 'status' - 'reviewNote' - 'appliedAt' - 'rating' - 'photo')
           || jsonb_build_object('id', new_id, 'ownerId', auth.uid()::text, 'verified', false, 'status', 'pending', 'appliedAt', now());
  IF _kind = 'coach' THEN clean := clean || jsonb_build_object('rating', 0); END IF;

  INSERT INTO public.catalog (kind, id, ord, data) VALUES (_kind, new_id, 1000, clean)
  ON CONFLICT (kind, id) DO UPDATE
    -- Keep what WellNest manages on the listing (photo, verified certificates, rating summary, packs, pickup point).
    SET data = EXCLUDED.data || jsonb_strip_nulls(jsonb_build_object(
      'photo', public.catalog.data->'photo', 'certifications', public.catalog.data->'certifications',
      'ratingSummary', public.catalog.data->'ratingSummary', 'packs', public.catalog.data->'packs',
      'pickupLat', public.catalog.data->'pickupLat', 'pickupLng', public.catalog.data->'pickupLng')), updated_at = now();
  RETURN new_id;
END $$;


DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.refresh_partner_rating(text, text)', 'public.refresh_certifications(text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.partner_reviews(text)', 'public.admin_hide_review(text, boolean)', 'public.partner_upload_certificate(text, text, text)',
                           'public.partner_delete_certificate(text)', 'public.certificate_document(text)', 'public.review_certificate(text, boolean, text)',
                           'public.submit_partner(text, jsonb)', 'public.valid_review(jsonb, text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Ratings that already exist get a summary straight away.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT data->>'type' AS t, data->>'partnerId' AS p FROM public.bookings WHERE jsonb_typeof(data->'review') = 'object' LOOP
    PERFORM public.refresh_partner_rating(r.t, r.p);
  END LOOP;
END $$;
