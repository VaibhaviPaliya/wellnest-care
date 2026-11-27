-- WellNest · Batch 5: family alerts for home visits (on the way, arrived, completed). Run after 0009. Safe to run more than once.
--
--  * "Start trip" on the coach / therapist dashboard calls partner_start_trip: it records the time once and alerts the
--    senior and every linked family member that the partner is on the way (live map under Bookings).
--  * partner_update_status now alerts them when the partner arrives (session started) and when the session is completed.
--  * Only these server functions may set tripStartedAt.
--  * The "missed 2 exercise days" alert is raised by the senior's or family's app (src/lib/progress.ts).

-- Alert the senior and their linked family (server use only).
CREATE OR REPLACE FUNCTION public.notify_senior_circle(_senior uuid, _title text, _body text, _who jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notices (id, user_id, senior_id, data)
  SELECT 'n-' || replace(gen_random_uuid()::text, '-', ''), x.u, _senior,
         jsonb_build_object('title', left(_title, 160), 'body', left(_body, 500), 'at', now(), 'read', false)
         || CASE WHEN _who IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('who', _who) END
  FROM (SELECT _senior AS u UNION SELECT f.family_id FROM public.family_links f WHERE f.senior_id = _senior) x
$$;
REVOKE EXECUTE ON FUNCTION public.notify_senior_circle(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_start_trip(_booking text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings;
  t text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR public.owner_of_partner(b.data->>'partnerId') IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  t := b.data->>'type';
  IF t NOT IN ('fitness', 'therapy') OR b.data->>'videoUrl' IS NOT NULL THEN RAISE EXCEPTION 'Only home visits have a trip'; END IF;
  IF b.data->>'status' <> 'confirmed' THEN RAISE EXCEPTION 'This visit has already started or is closed'; END IF;
  IF (b.data->>'when')::timestamptz > now() + interval '3 hours' THEN RAISE EXCEPTION 'You can start the trip from 3 hours before the visit'; END IF;
  IF b.data ? 'tripStartedAt' THEN RETURN; END IF; -- already on the way: no second alert
  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = data || jsonb_build_object('tripStartedAt', now()) WHERE id = _booking;
  PERFORM public.notify_senior_circle(b.senior_id, coalesce(b.data->>'partnerName', 'Your partner') || ' is on the way',
    coalesce(b.data->>'title', 'Home visit') || ' · open Bookings to follow them live on the map.',
    jsonb_build_object('kind', CASE t WHEN 'therapy' THEN 'therapist' ELSE 'coach' END, 'id', b.data->>'partnerId', 'name', b.data->>'partnerName'));
END $$;

CREATE OR REPLACE FUNCTION public.check_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  partner_kind text;
  partner jsonb;
  senior_pin text;
  service jsonb;
  health jsonb;
  trusted boolean := coalesce(current_setting('wellnest.trusted', true), '') = 'on';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.senior_id <> OLD.senior_id OR NEW.data->>'partnerId' <> OLD.data->>'partnerId' OR NEW.data->>'when' <> OLD.data->>'when' THEN
      RAISE EXCEPTION 'A booking''s senior, partner and time cannot be changed';
    END IF;
    IF NOT trusted AND NOT public.is_admin() THEN
      IF NEW.data->'deliveryId' IS DISTINCT FROM OLD.data->'deliveryId' OR NEW.data->'deliveryName' IS DISTINCT FROM OLD.data->'deliveryName'
         OR NEW.data->'offer' IS DISTINCT FROM OLD.data->'offer' OR NEW.data->'assignedAt' IS DISTINCT FROM OLD.data->'assignedAt'
         OR NEW.data->'tripStartedAt' IS DISTINCT FROM OLD.data->'tripStartedAt' THEN
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
  partner_kind := CASE NEW.data->>'type' WHEN 'fitness' THEN 'coach' WHEN 'meal' THEN 'kitchen' WHEN 'medicine' THEN 'pharmacy' WHEN 'therapy' THEN 'therapist' END;
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
  -- Therapy: a real service of this therapist at its listed price, and a doctor's OK for heart, high BP or limited mobility.
  IF NEW.data->>'type' = 'therapy' THEN
    SELECT s INTO service FROM jsonb_array_elements(coalesce(partner->'services', '[]'::jsonb)) s WHERE s->>'id' = NEW.data->>'serviceId' LIMIT 1;
    IF service IS NULL THEN RAISE EXCEPTION 'Choose one of the therapist''s services'; END IF;
    IF coalesce((NEW.data->>'amount')::numeric, -1) <> (service->>'price')::numeric THEN RAISE EXCEPTION 'The price doesn''t match the therapist''s service'; END IF;
    IF NOT (coalesce(partner->'slots', '[]'::jsonb) ? to_char((NEW.data->>'when')::timestamptz AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')) THEN
      RAISE EXCEPTION 'Choose one of the therapist''s time slots';
    END IF;
    SELECT p.health INTO health FROM public.profiles p WHERE p.id = NEW.senior_id;
    IF coalesce(health->'conditions' ? 'heart' OR health->'conditions' ? 'high_bp' OR health->>'mobility' = 'limited', false)
       AND NOT coalesce((NEW.data->>'doctorApproved')::boolean, false) THEN
      RAISE EXCEPTION 'Please confirm a doctor has approved massage for this senior';
    END IF;
    IF NEW.data ? 'subscriptionId' THEN RAISE EXCEPTION 'Pack credits are for coach sessions only'; END IF;
  END IF;
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
  IF NEW.data->>'type' IN ('fitness', 'therapy') AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.data->>'type' = NEW.data->>'type' AND b.data->>'partnerId' = NEW.data->>'partnerId'
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

CREATE OR REPLACE FUNCTION public.partner_update_status(_booking text, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  cur text;
  t text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  IF NOT FOUND OR public.owner_of_partner(b.data->>'partnerId') IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your order'; END IF;
  cur := b.data->>'status'; t := b.data->>'type';
  IF NOT ((t = 'medicine' AND cur = 'pending_review' AND _status = 'confirmed')
       OR (t = 'meal' AND cur = 'confirmed' AND _status = 'in_progress')
       OR (t = 'fitness' AND cur = 'confirmed' AND _status = 'in_progress')
       OR (t = 'fitness' AND cur = 'in_progress' AND _status = 'completed')
       OR (t = 'therapy' AND cur = 'confirmed' AND _status = 'in_progress')
       OR (t = 'therapy' AND cur = 'in_progress' AND _status = 'completed')) THEN
    RAISE EXCEPTION 'That step isn''t allowed now';
  END IF;
  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = data || jsonb_build_object('status', _status) WHERE id = _booking;
  -- Tell the senior and family when a coach or therapist arrives (or an online class starts) and when it is done.
  IF t IN ('fitness', 'therapy') THEN
    PERFORM public.notify_senior_circle(b.senior_id,
      CASE WHEN _status = 'in_progress' AND b.data->>'videoUrl' IS NULL THEN coalesce(b.data->>'partnerName', 'Your partner') || ' has arrived'
           WHEN _status = 'in_progress' THEN 'Class started: ' || coalesce(b.data->>'title', 'online class')
           ELSE 'Session completed: ' || coalesce(b.data->>'title', 'session') END,
      CASE WHEN _status = 'in_progress' AND b.data->>'videoUrl' IS NULL THEN coalesce(b.data->>'title', 'Session') || ' is starting now at home.'
           WHEN _status = 'in_progress' THEN 'Join from Bookings.'
           ELSE coalesce(b.data->>'partnerName', 'The partner') || ' marked the session as done. You can leave a review under Bookings.' END,
      jsonb_build_object('kind', CASE t WHEN 'therapy' THEN 'therapist' ELSE 'coach' END, 'id', b.data->>'partnerId', 'name', b.data->>'partnerName'));
  END IF;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.partner_start_trip(text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.partner_start_trip(text) TO authenticated;
END $$;
