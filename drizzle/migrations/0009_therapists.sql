-- WellNest · Batch 4: massage therapists as a new partner type, with home-visit booking, a doctor's-OK check and live tracking.
-- Run after 0008. Safe to run more than once.
--
--  * Therapists register like coaches (licence, service pincodes, 1–6 services with minutes and price, time slots).
--    An admin checks the licence and certificate before they appear to customers.
--  * A therapy booking must use one of the therapist's services at its listed price and one of their slots.
--  * Seniors whose health profile lists heart disease, high BP or limited mobility can be booked only after the
--    booker confirms a doctor approved massage.
--  * The therapist's location is shared with the senior and family from 3 hours before the visit, like a coach's.
--  * No sample therapists are added: real therapists register from the Partner page.

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.catalog'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%'
  LOOP EXECUTE format('ALTER TABLE public.catalog DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE public.catalog ADD CONSTRAINT catalog_kind_check
  CHECK (kind IN ('coach', 'kitchen', 'dish', 'pharmacy', 'delivery', 'plan', 'meta', 'therapist'));

CREATE OR REPLACE FUNCTION public.my_listing_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.catalog c
  WHERE c.kind IN ('coach', 'kitchen', 'pharmacy', 'therapist') AND auth.uid() IS NOT NULL AND c.data->>'ownerId' = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION public.owner_of_partner(_partner text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(c.data->>'ownerId', '')::uuid FROM public.catalog c
  WHERE c.kind IN ('pharmacy', 'kitchen', 'coach', 'therapist') AND c.id = _partner LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.partner_serves_senior(_senior uuid, _visit_only boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.senior_id = _senior AND b.data->>'partnerId' IN (SELECT public.my_listing_ids())
      AND (NOT _visit_only OR (b.data->>'type' IN ('fitness', 'therapy') AND b.data->>'videoUrl' IS NULL
                               AND b.data->>'status' NOT IN ('completed', 'cancelled')))
  )
$$;

CREATE OR REPLACE FUNCTION public.submit_partner(_kind text, _data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mine record;
  new_id text;
  clean jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_partner() THEN RAISE EXCEPTION 'Only partner accounts can apply'; END IF;
  IF _kind NOT IN ('coach', 'kitchen', 'pharmacy', 'therapist') THEN RAISE EXCEPTION 'Choose pharmacy, kitchen, fitness coach or massage therapist'; END IF;
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
  IF _kind = 'therapist' THEN
    IF jsonb_typeof(_data->'services') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'services') NOT BETWEEN 1 AND 6 THEN
      RAISE EXCEPTION 'Add between 1 and 6 services';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_data->'services') s
               WHERE jsonb_typeof(s) <> 'object' OR coalesce(s->>'id', '') !~ '^sv-[A-Za-z0-9-]{1,60}$'
                  OR coalesce(btrim(s->>'name'), '') = '' OR length(s->>'name') > 80
                  OR jsonb_typeof(s->'minutes') IS DISTINCT FROM 'number' OR (s->>'minutes')::numeric NOT BETWEEN 15 AND 120
                  OR jsonb_typeof(s->'price') IS DISTINCT FROM 'number' OR (s->>'price')::numeric NOT BETWEEN 1 AND 100000) THEN
      RAISE EXCEPTION 'Each service needs a name, 15–120 minutes and a price between ₹1 and ₹1,00,000';
    END IF;
    IF (SELECT count(DISTINCT s->>'id') FROM jsonb_array_elements(_data->'services') s) <> jsonb_array_length(_data->'services') THEN
      RAISE EXCEPTION 'Each service needs its own id';
    END IF;
    IF jsonb_typeof(_data->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'slots') NOT BETWEEN 1 AND 12
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(_data->'slots') t WHERE jsonb_typeof(t) <> 'string' OR t #>> '{}' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
      RAISE EXCEPTION 'Add between 1 and 12 time slots like 10:00';
    END IF;
    IF _data ? 'gender' AND coalesce(_data->>'gender', '') NOT IN ('female', 'male') THEN RAISE EXCEPTION 'Choose female or male, or leave it blank'; END IF;
  END IF;

  SELECT c.kind, c.id INTO mine FROM public.catalog c
  WHERE c.kind IN ('coach', 'kitchen', 'pharmacy', 'therapist') AND c.data->>'ownerId' = auth.uid()::text LIMIT 1;
  IF FOUND AND mine.kind <> _kind THEN RAISE EXCEPTION 'Your account already has a % listing', mine.kind; END IF;
  new_id := coalesce(mine.id, left(_kind, 2) || '-' || replace(gen_random_uuid()::text, '-', ''));

  -- Whatever the browser sends, a submission is always pending and unverified until an admin approves it.
  clean := (_data - 'id' - 'ownerId' - 'verified' - 'status' - 'reviewNote' - 'appliedAt' - 'rating' - 'photo')
           || jsonb_build_object('id', new_id, 'ownerId', auth.uid()::text, 'verified', false, 'status', 'pending', 'appliedAt', now());
  IF _kind IN ('coach', 'therapist') THEN clean := clean || jsonb_build_object('rating', 0); END IF;

  INSERT INTO public.catalog (kind, id, ord, data) VALUES (_kind, new_id, 1000, clean)
  ON CONFLICT (kind, id) DO UPDATE
    -- Keep what WellNest manages on the listing (photo, verified certificates, rating summary, packs, pickup point).
    SET data = EXCLUDED.data || jsonb_strip_nulls(jsonb_build_object(
      'photo', public.catalog.data->'photo', 'certifications', public.catalog.data->'certifications',
      'ratingSummary', public.catalog.data->'ratingSummary', 'packs', public.catalog.data->'packs',
      'pickupLat', public.catalog.data->'pickupLat', 'pickupLng', public.catalog.data->'pickupLng')), updated_at = now();
  RETURN new_id;
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
END $$;

CREATE OR REPLACE FUNCTION public.track_booking(_booking text)
RETURNS TABLE (who text, role text, vehicle text, lat double precision, lng double precision, accuracy double precision,
               located_at timestamptz, status text, home_lat double precision, home_lng double precision,
               pickup_lat double precision, pickup_lng double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings;
  person uuid;
  label text;
  veh text;
  r text := 'rider';
  store jsonb;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking;
  IF NOT FOUND OR NOT coalesce(public.can_view_senior(b.senior_id) OR public.is_admin() OR public.can_work_booking(b), false) THEN
    RAISE EXCEPTION 'Tracking is available only for your own bookings';
  END IF;
  IF b.data->>'status' IN ('completed', 'cancelled') THEN RETURN; END IF;
  SELECT c.data INTO store FROM public.catalog c WHERE c.kind IN ('pharmacy', 'kitchen', 'coach', 'therapist') AND c.id = b.data->>'partnerId';
  IF b.data->>'type' IN ('fitness', 'therapy') THEN
    IF b.data->>'videoUrl' IS NOT NULL THEN RETURN; END IF;
    person := public.owner_of_partner(b.data->>'partnerId'); label := b.data->>'partnerName';
    r := CASE b.data->>'type' WHEN 'therapy' THEN 'therapist' ELSE 'coach' END;
    -- A coach's or therapist's location is shared only from 3 hours before the visit.
    IF (b.data->>'when')::timestamptz > now() + interval '3 hours' THEN person := NULL; END IF;
  ELSE
    SELECT rp.rider_user, d.data->>'name', d.data->>'vehicle' INTO person, label, veh
    FROM public.catalog d JOIN public.rider_private rp ON rp.delivery_id = d.id
    WHERE d.kind = 'delivery' AND d.id = b.data->>'deliveryId';
    label := coalesce(label, b.data->>'deliveryName');
  END IF;
  RETURN QUERY
    SELECT label, r, veh,
           lp.lat, lp.lng, lp.accuracy, lp.located_at, b.data->>'status',
           p.home_lat, p.home_lng, (store->>'pickupLat')::float8, (store->>'pickupLng')::float8
    FROM public.profiles p
    LEFT JOIN public.live_presence lp ON lp.user_id = person AND lp.online
    WHERE p.id = b.senior_id;
END $$;

-- Approved therapists are visible to customers, like the other partner types.
DROP POLICY IF EXISTS "Read approved partners and own listing" ON public.catalog;
CREATE POLICY "Read approved partners and own listing" ON public.catalog FOR SELECT TO authenticated USING (
  public.is_admin() OR (kind <> 'meta' AND (
    (kind NOT IN ('coach', 'kitchen', 'pharmacy', 'delivery', 'plan', 'therapist'))
    OR (kind = 'plan' AND (NOT coalesce((data->>'hidden')::boolean, false) OR data->>'ownerId' = auth.uid()::text))
    OR (kind IN ('coach', 'kitchen', 'pharmacy', 'delivery', 'therapist') AND coalesce((data->>'verified')::boolean, false))
    OR data->>'ownerId' = auth.uid()::text
    OR (kind = 'delivery' AND (data->>'ownerPartnerId' IN (SELECT id FROM public.my_store()) OR id IN (SELECT public.my_rider_ids())))
  ))
);
