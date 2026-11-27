-- WellNest · Batch 3: coach-priced monthly packs, paid once through Razorpay; renewal is manual.
-- Run after 0007. Safe to run more than once.
--
--  * An approved coach publishes up to 5 packs (sessions, validity, price).
--  * Only the server creates a pack purchase, after checking the Razorpay payment amount (src/lib/packs.functions.ts).
--    Customers can no longer insert or delete subscriptions themselves.
--  * Customers may only use or return one credit at a time, or cancel; nothing else about a pack can be changed.
--  * A booking paid with a credit must use a valid pack for that coach and cost ₹0.

CREATE OR REPLACE FUNCTION public.coach_save_packs(_packs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  coach text := public.my_coach_listing();
  p jsonb;
  out jsonb := '[]'::jsonb;
BEGIN
  IF coach IS NULL THEN RAISE EXCEPTION 'Only an approved fitness coach can sell packs'; END IF;
  IF jsonb_typeof(_packs) IS DISTINCT FROM 'array' OR jsonb_array_length(_packs) > 5 THEN RAISE EXCEPTION 'You can offer up to 5 packs'; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(_packs) LOOP
    IF coalesce(length(btrim(p->>'title')), 0) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Give each pack a short name'; END IF;
    IF jsonb_typeof(p->'sessions') IS DISTINCT FROM 'number' OR (p->>'sessions')::numeric NOT BETWEEN 1 AND 30 OR (p->>'sessions')::numeric % 1 <> 0 THEN RAISE EXCEPTION 'Sessions must be 1–30'; END IF;
    IF jsonb_typeof(p->'days') IS DISTINCT FROM 'number' OR (p->>'days')::numeric NOT BETWEEN 7 AND 90 OR (p->>'days')::numeric % 1 <> 0 THEN RAISE EXCEPTION 'Validity must be 7–90 days'; END IF;
    IF jsonb_typeof(p->'price') IS DISTINCT FROM 'number' OR (p->>'price')::numeric NOT BETWEEN 1 AND 100000 OR (p->>'price')::numeric % 1 <> 0 THEN RAISE EXCEPTION 'Price must be ₹1–₹1,00,000'; END IF;
    out := out || jsonb_build_array(jsonb_build_object(
      'id', CASE WHEN coalesce(p->>'id', '') ~ '^pk-[a-z0-9]{6,40}$' THEN p->>'id' ELSE 'pk-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) END,
      'title', btrim(p->>'title'), 'sessions', (p->>'sessions')::int, 'days', (p->>'days')::int, 'price', (p->>'price')::int));
  END LOOP;
  UPDATE public.catalog SET data = CASE WHEN jsonb_array_length(out) > 0 THEN data || jsonb_build_object('packs', out) ELSE data - 'packs' END, updated_at = now()
  WHERE kind = 'coach' AND id = coach;
  RETURN out;
END $$;

-- Subscriptions are created only by the server (after payment); customers cannot add or delete them.
DROP POLICY IF EXISTS "Add care items for self or linked senior" ON public.care_items;
CREATE POLICY "Add care items for self or linked senior" ON public.care_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_senior(senior_id) AND kind <> 'subscription');
DROP POLICY IF EXISTS "Remove care items for self or linked senior" ON public.care_items;
CREATE POLICY "Remove care items for self or linked senior" ON public.care_items FOR DELETE TO authenticated
  USING (public.can_manage_senior(senior_id) AND kind <> 'subscription');

CREATE OR REPLACE FUNCTION public.guard_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o int := coalesce((OLD.data->>'remaining')::int, 0);
  n int := coalesce((NEW.data->>'remaining')::int, -1);
  cap int := coalesce((OLD.data->>'sessions')::int, 8);
BEGIN
  IF auth.uid() IS NULL OR NEW.kind <> 'subscription' OR coalesce(current_setting('wellnest.trusted', true), '') = 'on' THEN RETURN NEW; END IF;
  IF (NEW.data - 'remaining' - 'cancelled') IS DISTINCT FROM (OLD.data - 'remaining' - 'cancelled') OR NEW.senior_id <> OLD.senior_id OR NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'Pack details cannot be changed';
  END IF;
  IF abs(n - o) > 1 OR n < 0 OR n > cap THEN RAISE EXCEPTION 'Credits change one session at a time'; END IF;
  IF coalesce((OLD.data->>'cancelled')::boolean, false) AND NOT coalesce((NEW.data->>'cancelled')::boolean, false) THEN
    RAISE EXCEPTION 'A cancelled pack cannot be reactivated';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS care_items_subscription_guard ON public.care_items;
CREATE TRIGGER care_items_subscription_guard BEFORE UPDATE ON public.care_items FOR EACH ROW EXECUTE FUNCTION public.guard_subscription();

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
  -- Pack credits: the subscription must belong to this senior, cover this coach, be active with credits left.
  IF NEW.data ? 'subscriptionId' AND coalesce(NEW.data->>'subscriptionId', '') <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.care_items s
      WHERE s.kind = 'subscription' AND s.id = NEW.data->>'subscriptionId' AND s.senior_id = NEW.senior_id
        AND NOT coalesce((s.data->>'cancelled')::boolean, false) AND (s.data->>'remaining')::int > 0
        AND (s.data->>'starts')::timestamptz <= now() AND (s.data->>'ends')::timestamptz > (NEW.data->>'when')::timestamptz
        AND coalesce(s.data->>'coachId', (SELECT p.data->>'coachId' FROM public.catalog p WHERE p.kind = 'plan' AND p.id = s.data->>'planId')) = NEW.data->>'partnerId'
    ) THEN RAISE EXCEPTION 'No valid pack credit for this session'; END IF;
    IF coalesce((NEW.data->>'amount')::numeric, 0) <> 0 THEN RAISE EXCEPTION 'A session paid with a pack credit costs nothing extra'; END IF;
  END IF;
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


DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.coach_save_packs(jsonb) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.coach_save_packs(jsonb) TO authenticated;
END $$;
