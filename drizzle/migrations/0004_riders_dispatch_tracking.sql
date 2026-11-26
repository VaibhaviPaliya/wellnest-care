-- WellNest · Store/kitchen delivery partners, Uber-style dispatch and live tracking.
-- Run AFTER 0003_partners_and_pincodes.sql. Safe to run more than once.
--
--  1. 'delivery' role. A store or kitchen lists its riders (name, mobile, vehicle). A rider who registers with that
--     mobile number is linked automatically, uploads a MASKED Aadhaar, and the admin approves them.
--     The document lives in rider_private, readable only by that rider and admins (never by customers or stores).
--  2. Riders go online from their phone; their latest location is kept in live_presence (one row per person).
--  3. Dispatch: a new meal/medicine order with a store that has its own riders is offered to the least-busy online
--     rider of that store, nearest the pickup point. Declined or ignored for 60 s → next rider. The store can reassign.
--  4. Tracking: the customer (and linked family), the store and admins can see the assigned rider's live location;
--     for home-visit fitness, the coach's. Customer address/phone go only to the assigned rider, store or coach
--     while the job is active.
--  5. Only these server functions can assign riders or move a booking to preparing / out for delivery / completed;
--     a customer's own update may only cancel.

-- 1. Role, columns, tables ------------------------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'delivery';

CREATE OR REPLACE FUNCTION public.choose_role(_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _role::text NOT IN ('senior', 'family', 'partner', 'delivery') THEN RAISE EXCEPTION 'This role cannot be chosen at registration'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Role already set'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _role);
END $$;

CREATE OR REPLACE FUNCTION public.has_role_text(_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = _role)
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_lat double precision, ADD COLUMN IF NOT EXISTS home_lng double precision;

CREATE TABLE IF NOT EXISTS public.rider_private (
  delivery_id text PRIMARY KEY,
  owner_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_partner_id text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  rider_user uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  aadhaar_name text,
  aadhaar_doc text CHECK (aadhaar_doc IS NULL OR length(aadhaar_doc) <= 1500000),
  doc_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_partner_id, phone)
);
ALTER TABLE public.rider_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_private FROM anon, authenticated;
GRANT SELECT (delivery_id, owner_user, owner_partner_id, phone, rider_user, aadhaar_name, doc_uploaded_at, created_at) ON public.rider_private TO authenticated;
GRANT ALL ON public.rider_private TO service_role;
DROP POLICY IF EXISTS "Rider, their store and admins" ON public.rider_private;
CREATE POLICY "Rider, their store and admins" ON public.rider_private FOR SELECT TO authenticated
  USING (public.is_admin() OR owner_user = auth.uid() OR rider_user = auth.uid());

CREATE TABLE IF NOT EXISTS public.live_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  online boolean NOT NULL DEFAULT false,
  lat double precision, lng double precision, accuracy double precision,
  located_at timestamptz
);
ALTER TABLE public.live_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_presence FROM anon, authenticated;
GRANT SELECT ON public.live_presence TO authenticated;
GRANT ALL ON public.live_presence TO service_role;
DROP POLICY IF EXISTS "Own presence" ON public.live_presence;
CREATE POLICY "Own presence" ON public.live_presence FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 2. Helpers ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.km(_lat1 double precision, _lng1 double precision, _lat2 double precision, _lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(power(sin(radians(_lat2 - _lat1) / 2), 2)
         + cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)))
$$;

-- The store/kitchen listing owned by the caller (approved or not).
CREATE OR REPLACE FUNCTION public.my_store()
RETURNS TABLE (kind text, id text, verified boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.kind, c.id, coalesce((c.data->>'verified')::boolean, false) FROM public.catalog c
  WHERE c.kind IN ('pharmacy', 'kitchen') AND c.data->>'ownerId' = auth.uid()::text LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.owner_of_partner(_partner text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(c.data->>'ownerId', '')::uuid FROM public.catalog c
  WHERE c.kind IN ('pharmacy', 'kitchen', 'coach') AND c.id = _partner LIMIT 1
$$;

-- Riders (catalog delivery ids) linked to the caller's account.
CREATE OR REPLACE FUNCTION public.my_rider_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rp.delivery_id FROM public.rider_private rp WHERE auth.uid() IS NOT NULL AND rp.rider_user = auth.uid()
$$;

-- Marks the current transaction as a trusted server update (lets dispatch functions change rider and status).
CREATE OR REPLACE FUNCTION public.trust_this_update()
RETURNS void LANGUAGE sql AS $$ SELECT set_config('wellnest.trusted', 'on', true) $$;
REVOKE EXECUTE ON FUNCTION public.trust_this_update() FROM PUBLIC, anon, authenticated;

-- 3. Booking guard: customers may only cancel; rider and dispatch fields change only through server functions ----
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

-- 4. Dispatch -------------------------------------------------------------------------------------------------------
-- Offers an unassigned order to the next rider. Safe to call repeatedly (it only acts on missing or expired offers).
CREATE OR REPLACE FUNCTION public.dispatch_booking(_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  offer jsonb;
  declined jsonb;
  store jsonb;
  pick record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR b.data->>'type' NOT IN ('meal', 'medicine') OR b.data ? 'deliveryId'
     OR b.data->>'status' IN ('completed', 'cancelled', 'out_for_delivery') THEN RETURN; END IF;
  SELECT c.data INTO store FROM public.catalog c WHERE c.kind IN ('pharmacy', 'kitchen') AND c.id = b.data->>'partnerId';
  IF store IS NULL THEN RETURN; END IF;
  offer := b.data->'offer';
  declined := coalesce(b.data->'declined', '[]'::jsonb);
  IF offer IS NOT NULL AND (offer->>'offeredAt')::timestamptz > now() - interval '60 seconds' THEN RETURN; END IF;
  IF offer IS NOT NULL THEN declined := declined || jsonb_build_array(offer->>'riderId'); END IF;  -- ignored = declined

  SELECT d.id, d.data->>'name' AS name INTO pick
  FROM public.catalog d
  JOIN public.rider_private rp ON rp.delivery_id = d.id AND rp.rider_user IS NOT NULL
  JOIN public.live_presence lp ON lp.user_id = rp.rider_user AND lp.online AND lp.located_at > now() - interval '3 minutes'
  WHERE d.kind = 'delivery' AND d.data->>'ownerPartnerId' = b.data->>'partnerId' AND (d.data->>'verified')::boolean
    AND NOT declined ? d.id
  ORDER BY (SELECT count(*) FROM public.bookings x WHERE x.data->>'deliveryId' = d.id
              AND x.data->>'status' NOT IN ('completed', 'cancelled')),
           CASE WHEN store ? 'pickupLat' THEN public.km((store->>'pickupLat')::float8, (store->>'pickupLng')::float8, lp.lat, lp.lng) END NULLS LAST,
           d.id
  LIMIT 1;

  IF pick.id IS NULL AND jsonb_array_length(declined) > 0 THEN
    -- Everyone has passed: start a fresh round.
    declined := '[]'::jsonb;
    SELECT d.id, d.data->>'name' AS name INTO pick
    FROM public.catalog d
    JOIN public.rider_private rp ON rp.delivery_id = d.id AND rp.rider_user IS NOT NULL
    JOIN public.live_presence lp ON lp.user_id = rp.rider_user AND lp.online AND lp.located_at > now() - interval '3 minutes'
    WHERE d.kind = 'delivery' AND d.data->>'ownerPartnerId' = b.data->>'partnerId' AND (d.data->>'verified')::boolean
      AND d.id IS DISTINCT FROM offer->>'riderId'
    ORDER BY d.id LIMIT 1;
  END IF;

  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = (data - 'offer') || jsonb_build_object('declined', declined)
    || CASE WHEN pick.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('offer', jsonb_build_object('riderId', pick.id, 'riderName', pick.name, 'offeredAt', now())) END
  WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data->>'type' IN ('meal', 'medicine') AND NOT NEW.data ? 'deliveryId' THEN PERFORM public.dispatch_booking(NEW.id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bookings_dispatch ON public.bookings;
CREATE TRIGGER bookings_dispatch AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.dispatch_after_insert();

-- Re-checks open orders of the given stores (expired offers move on; newly online riders get waiting orders).
CREATE OR REPLACE FUNCTION public.redispatch_for(_partners text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.bookings
           WHERE data->>'partnerId' = ANY(_partners) AND data->>'type' IN ('meal', 'medicine') AND NOT data ? 'deliveryId'
             AND data->>'status' NOT IN ('completed', 'cancelled', 'out_for_delivery')
             AND (data->'offer' IS NULL OR (data->'offer'->>'offeredAt')::timestamptz <= now() - interval '60 seconds')
  LOOP PERFORM public.dispatch_booking(r.id); END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.dispatch_booking(text), public.redispatch_for(text[]) FROM PUBLIC, anon, authenticated;

-- 5. Store: list riders, set pickup point, manage orders ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_save_rider(_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st record;
  rid text;
  old record;
  ph text := btrim(coalesce(_data->>'phone', ''));
BEGIN
  SELECT * INTO st FROM public.my_store();
  IF st.id IS NULL THEN RAISE EXCEPTION 'Only a medical store or kitchen can add delivery partners'; END IF;
  IF coalesce(btrim(_data->>'name'), '') = '' OR length(_data->>'name') > 80 THEN RAISE EXCEPTION 'Enter the delivery partner''s name'; END IF;
  IF ph !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Enter a 10-digit Indian mobile number'; END IF;
  IF coalesce(_data->>'vehicle', '') NOT IN ('Motorbike', 'Scooter', 'Bicycle', 'On foot', 'Car') THEN RAISE EXCEPTION 'Choose a vehicle'; END IF;
  SELECT rp.* INTO old FROM public.rider_private rp WHERE rp.delivery_id = _data->>'id' AND rp.owner_user = auth.uid();
  rid := coalesce(old.delivery_id, 'dl-' || replace(gen_random_uuid()::text, '-', ''));
  IF EXISTS (SELECT 1 FROM public.rider_private x WHERE x.owner_partner_id = st.id AND x.phone = ph AND x.delivery_id <> rid) THEN
    RAISE EXCEPTION 'You have already listed this mobile number';
  END IF;
  INSERT INTO public.catalog (kind, id, ord, data) VALUES ('delivery', rid, 1000, jsonb_build_object(
    'id', rid, 'name', btrim(_data->>'name'), 'vehicle', _data->>'vehicle',
    'area', coalesce((SELECT c.data->'address'->>'city' FROM public.catalog c WHERE c.kind = st.kind AND c.id = st.id), ''),
    'verified', false, 'status', 'pending', 'ownerPartnerId', st.id, 'ownerKind', st.kind))
  ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data
    || jsonb_strip_nulls(jsonb_build_object('photo', public.catalog.data->'photo')), updated_at = now();
  INSERT INTO public.rider_private (delivery_id, owner_user, owner_partner_id, phone, aadhaar_name)
  VALUES (rid, auth.uid(), st.id, ph, left(btrim(coalesce(_data->>'aadhaarName', '')), 80))
  ON CONFLICT (delivery_id) DO UPDATE SET
    phone = EXCLUDED.phone, aadhaar_name = EXCLUDED.aadhaar_name,
    -- A new number means a different person: unlink the old account and drop the old document.
    rider_user = CASE WHEN public.rider_private.phone = EXCLUDED.phone THEN public.rider_private.rider_user END,
    aadhaar_doc = CASE WHEN public.rider_private.phone = EXCLUDED.phone THEN public.rider_private.aadhaar_doc END,
    doc_uploaded_at = CASE WHEN public.rider_private.phone = EXCLUDED.phone THEN public.rider_private.doc_uploaded_at END;
  -- Link immediately if that person already has a delivery account.
  UPDATE public.rider_private rp SET rider_user = p.id
  FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id AND r.role::text = 'delivery'
  WHERE rp.delivery_id = rid AND rp.rider_user IS NULL AND p.phone = rp.phone;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.partner_remove_rider(_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rider_private WHERE delivery_id = _id AND owner_user = auth.uid()) THEN
    RAISE EXCEPTION 'You can only remove your own delivery partners';
  END IF;
  PERFORM public.trust_this_update();
  FOR r IN SELECT id FROM public.bookings WHERE data->>'deliveryId' = _id AND data->>'status' NOT IN ('completed', 'cancelled') LOOP
    UPDATE public.bookings SET data = data - 'deliveryId' - 'deliveryName' - 'assignedAt' WHERE id = r.id;
    PERFORM public.dispatch_booking(r.id);
  END LOOP;
  DELETE FROM public.rider_private WHERE delivery_id = _id;
  DELETE FROM public.catalog WHERE kind = 'delivery' AND id = _id;
END $$;

-- Pickup point used to find the nearest rider (stores and kitchens set it from their own phone).
CREATE OR REPLACE FUNCTION public.partner_set_pickup(_lat double precision, _lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record;
BEGIN
  SELECT * INTO st FROM public.my_store();
  IF st.id IS NULL THEN RAISE EXCEPTION 'Only a medical store or kitchen sets a pickup point'; END IF;
  IF NOT (_lat BETWEEN 6 AND 38 AND _lng BETWEEN 68 AND 98) THEN RAISE EXCEPTION 'That location is outside India'; END IF;
  UPDATE public.catalog SET data = data || jsonb_build_object('pickupLat', _lat, 'pickupLng', _lng), updated_at = now()
  WHERE kind = st.kind AND id = st.id;
END $$;

CREATE OR REPLACE FUNCTION public.partner_assign_rider(_booking text, _rider text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  rname text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR public.owner_of_partner(b.data->>'partnerId') IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your order'; END IF;
  IF b.data->>'status' IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'This order is closed'; END IF;
  SELECT d.data->>'name' INTO rname FROM public.catalog d
  WHERE d.kind = 'delivery' AND d.id = _rider AND d.data->>'ownerPartnerId' = b.data->>'partnerId' AND (d.data->>'verified')::boolean;
  IF rname IS NULL THEN RAISE EXCEPTION 'Choose one of your verified delivery partners'; END IF;
  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = (data - 'offer') || jsonb_build_object('deliveryId', _rider, 'deliveryName', rname, 'assignedAt', now())
  WHERE id = _booking;
END $$;

-- Store / kitchen / coach progress: confirm prescription, preparing, (coach) visit started and completed.
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
       OR (t = 'fitness' AND cur = 'in_progress' AND _status = 'completed')) THEN
    RAISE EXCEPTION 'That step isn''t allowed now';
  END IF;
  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = data || jsonb_build_object('status', _status) WHERE id = _booking;
END $$;

-- 6. Rider: link account, upload masked Aadhaar, go online, take orders -----------------------------------------
CREATE OR REPLACE FUNCTION public.claim_rider()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_role_text('delivery') THEN RETURN 0; END IF;
  UPDATE public.rider_private rp SET rider_user = auth.uid()
  FROM public.profiles p WHERE p.id = auth.uid() AND rp.phone = p.phone AND rp.rider_user IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.rider_upload_aadhaar(_doc text, _name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rider_private WHERE rider_user = auth.uid()) THEN RAISE EXCEPTION 'Your store hasn''t listed this mobile number yet'; END IF;
  IF _doc !~ '^data:(image/(jpeg|png|webp)|application/pdf);base64,[A-Za-z0-9+/=]+$' OR length(_doc) > 1500000 THEN
    RAISE EXCEPTION 'Upload a JPG, PNG, WebP or PDF up to 1 MB';
  END IF;
  IF coalesce(btrim(_name), '') = '' OR length(_name) > 80 THEN RAISE EXCEPTION 'Enter your name exactly as on Aadhaar'; END IF;
  UPDATE public.rider_private SET aadhaar_doc = _doc, aadhaar_name = btrim(_name), doc_uploaded_at = now() WHERE rider_user = auth.uid();
  -- A new document always goes back to the admin.
  UPDATE public.catalog SET data = data || '{"verified": false, "status": "pending"}'::jsonb - 'reviewNote', updated_at = now()
  WHERE kind = 'delivery' AND id IN (SELECT public.my_rider_ids());
END $$;

-- Admins view the masked document on demand (it is never included in normal data loads).
CREATE OR REPLACE FUNCTION public.rider_document(_delivery_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE doc text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can view identity documents'; END IF;
  SELECT aadhaar_doc INTO doc FROM public.rider_private WHERE delivery_id = _delivery_id;
  RETURN doc;
END $$;

-- Riders (and coaches on a home visit) share their position while their app is open.
CREATE OR REPLACE FUNCTION public.set_presence(_online boolean, _lat double precision, _lng double precision, _accuracy double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role_text('delivery') OR public.has_role_text('partner')) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _online AND (_lat IS NULL OR _lng IS NULL OR NOT (_lat BETWEEN -90 AND 90) OR NOT (_lng BETWEEN -180 AND 180) OR coalesce(_accuracy, 0) NOT BETWEEN 0 AND 100000) THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;
  INSERT INTO public.live_presence (user_id, online, lat, lng, accuracy, located_at)
  VALUES (auth.uid(), _online, CASE WHEN _online THEN _lat END, CASE WHEN _online THEN _lng END, CASE WHEN _online THEN _accuracy END, CASE WHEN _online THEN now() END)
  ON CONFLICT (user_id) DO UPDATE SET online = EXCLUDED.online, lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy = EXCLUDED.accuracy, located_at = EXCLUDED.located_at;
  -- Going offline erases the stored location. Coming online picks up any waiting orders.
  IF _online THEN
    PERFORM public.redispatch_for(ARRAY(SELECT DISTINCT d.data->>'ownerPartnerId' FROM public.catalog d WHERE d.kind = 'delivery' AND d.id IN (SELECT public.my_rider_ids())));
  END IF;
END $$;

-- Offers waiting for me and my active jobs (moves expired offers on first).
CREATE OR REPLACE FUNCTION public.rider_feed()
RETURNS TABLE (booking_id text, kind text, data jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.redispatch_for(ARRAY(SELECT DISTINCT d.data->>'ownerPartnerId' FROM public.catalog d WHERE d.kind = 'delivery' AND d.id IN (SELECT public.my_rider_ids())));
  RETURN QUERY
    SELECT b.id, CASE WHEN b.data->>'deliveryId' IN (SELECT public.my_rider_ids()) THEN 'job' ELSE 'offer' END,
           -- Offers show only what a rider needs to decide (no customer address until accepted).
           CASE WHEN b.data->>'deliveryId' IN (SELECT public.my_rider_ids()) THEN b.data
                ELSE jsonb_build_object('id', b.id, 'type', b.data->'type', 'title', b.data->'title', 'partnerId', b.data->'partnerId',
                       'partnerName', b.data->'partnerName', 'when', b.data->'when', 'amount', b.data->'amount', 'offer', b.data->'offer',
                       'pincode', (SELECT p.pincode FROM public.profiles p WHERE p.id = b.senior_id)) END
    FROM public.bookings b
    WHERE b.data->>'status' NOT IN ('completed', 'cancelled')
      AND (b.data->>'deliveryId' IN (SELECT public.my_rider_ids())
           OR (b.data->'offer'->>'riderId' IN (SELECT public.my_rider_ids()) AND (b.data->'offer'->>'offeredAt')::timestamptz > now() - interval '60 seconds'))
    ORDER BY (b.data->>'when');
END $$;

CREATE OR REPLACE FUNCTION public.rider_respond(_booking text, _accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  rid text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  rid := b.data->'offer'->>'riderId';
  IF NOT FOUND OR rid IS NULL OR NOT coalesce(rid IN (SELECT public.my_rider_ids()), false) THEN RAISE EXCEPTION 'This order is no longer offered to you'; END IF;
  IF (b.data->'offer'->>'offeredAt')::timestamptz <= now() - interval '75 seconds' THEN RAISE EXCEPTION 'This offer has expired'; END IF;
  IF b.data ? 'deliveryId' OR b.data->>'status' IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'This order is no longer available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog d WHERE d.kind = 'delivery' AND d.id = rid AND (d.data->>'verified')::boolean) THEN
    RAISE EXCEPTION 'Your account must be verified first';
  END IF;
  PERFORM public.trust_this_update();
  IF _accept THEN
    UPDATE public.bookings SET data = (data - 'offer') || jsonb_build_object('deliveryId', rid, 'deliveryName', b.data->'offer'->>'riderName', 'assignedAt', now())
    WHERE id = _booking;
  ELSE
    UPDATE public.bookings SET data = (data - 'offer') || jsonb_build_object('declined', coalesce(data->'declined', '[]'::jsonb) || jsonb_build_array(rid))
    WHERE id = _booking;
    PERFORM public.dispatch_booking(_booking);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rider_update_status(_booking text, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(b.data->>'deliveryId' IN (SELECT public.my_rider_ids()), false) THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF NOT ((b.data->>'status' IN ('confirmed', 'in_progress') AND _status = 'out_for_delivery')
       OR (b.data->>'status' = 'out_for_delivery' AND _status = 'completed')) THEN
    RAISE EXCEPTION '%', CASE WHEN b.data->>'status' = 'pending_review' THEN 'Wait for the pharmacist to confirm the prescription' ELSE 'That step isn''t allowed now' END;
  END IF;
  PERFORM public.trust_this_update();
  UPDATE public.bookings SET data = data || jsonb_build_object('status', _status) WHERE id = _booking;
END $$;

-- 7. Customer details for the person doing the job, and live tracking --------------------------------------------
CREATE OR REPLACE FUNCTION public.can_work_booking(_b public.bookings)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- coalesce: an unassigned order (no deliveryId) must give false, never NULL.
  SELECT coalesce(_b.data->>'status' NOT IN ('completed', 'cancelled') AND (
    coalesce(_b.data->>'deliveryId' IN (SELECT public.my_rider_ids()), false)
    OR (coalesce(public.owner_of_partner(_b.data->>'partnerId') = auth.uid(), false)
        AND NOT (_b.data->>'type' = 'fitness' AND _b.data->>'videoUrl' IS NOT NULL))
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.job_details(_booking text)
RETURNS TABLE (name text, phone text, address text, city text, pincode text, state text, home_lat double precision, home_lng double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking;
  IF NOT FOUND OR NOT coalesce(public.can_work_booking(b) OR public.is_admin(), false) THEN RAISE EXCEPTION 'Customer details are shown only for your active jobs'; END IF;
  RETURN QUERY SELECT p.name, p.phone, p.address, p.city, p.pincode, p.state, p.home_lat, p.home_lng FROM public.profiles p WHERE p.id = b.senior_id;
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
  SELECT c.data INTO store FROM public.catalog c WHERE c.kind IN ('pharmacy', 'kitchen', 'coach') AND c.id = b.data->>'partnerId';
  IF b.data->>'type' = 'fitness' THEN
    IF b.data->>'videoUrl' IS NOT NULL THEN RETURN; END IF;
    person := public.owner_of_partner(b.data->>'partnerId'); label := b.data->>'partnerName'; r := 'coach';
    -- A coach's location is shared only from 3 hours before the visit.
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

-- Home pin for the senior (helps riders and coaches find the door).
CREATE OR REPLACE FUNCTION public.save_senior_pin(_senior uuid, _lat double precision, _lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_senior(_senior) THEN RAISE EXCEPTION 'You can only edit seniors you are linked to'; END IF;
  IF _lat IS NOT NULL AND NOT (_lat BETWEEN 6 AND 38 AND _lng BETWEEN 68 AND 98) THEN RAISE EXCEPTION 'That location is outside India'; END IF;
  UPDATE public.profiles SET home_lat = _lat, home_lng = CASE WHEN _lat IS NULL THEN NULL ELSE _lng END WHERE id = _senior;
END $$;

-- People list again, now with the home pin for the senior and their family.
DROP FUNCTION IF EXISTS public.visible_people();
CREATE FUNCTION public.visible_people()
RETURNS TABLE (id uuid, name text, username text, phone text, email text, age integer, city text, address text,
               consent_at timestamptz, health jsonb, role public.app_role, linked_senior_ids uuid[], pincode text, state text,
               home_lat double precision, home_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.username,
         CASE WHEN NOT public.partner_serves_senior(p.id, false) OR public.partner_serves_senior(p.id, true) OR p.id = auth.uid() OR public.is_admin() OR public.can_view_senior(p.id) THEN p.phone END,
         CASE WHEN p.id = auth.uid() OR public.is_admin() THEN u.email::text END,
         p.age, p.city,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) OR public.partner_serves_senior(p.id, true) THEN p.address END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.consent_at END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.health END,
         (SELECT r.role FROM public.user_roles r WHERE r.user_id = p.id ORDER BY (r.role::text = 'admin') DESC LIMIT 1),
         ARRAY(SELECT l.senior_id FROM public.family_links l WHERE l.family_id = p.id
               AND (p.id = auth.uid() OR l.senior_id = auth.uid() OR public.is_admin() OR public.can_manage_senior(l.senior_id))),
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) OR public.partner_serves_senior(p.id, true) THEN p.pincode END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) OR public.partner_serves_senior(p.id, true) THEN p.state END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.home_lat END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.home_lng END
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE auth.uid() IS NOT NULL AND (
    p.id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.family_links l WHERE l.family_id = auth.uid() AND l.senior_id = p.id)
    OR EXISTS (SELECT 1 FROM public.family_links l WHERE l.senior_id = auth.uid() AND l.family_id = p.id)
    OR EXISTS (SELECT 1 FROM public.family_links mine JOIN public.family_links theirs ON theirs.senior_id = mine.senior_id
               WHERE mine.family_id = auth.uid() AND theirs.family_id = p.id)
    OR public.partner_serves_senior(p.id, false)
  )
$$;

-- 8. Visibility: riders' rows, orders for riders ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Read approved partners and own listing" ON public.catalog;
CREATE POLICY "Read approved partners and own listing" ON public.catalog FOR SELECT TO authenticated USING (
  public.is_admin() OR (kind <> 'meta' AND (
    kind NOT IN ('coach', 'kitchen', 'pharmacy', 'delivery')
    OR coalesce((data->>'verified')::boolean, false)
    OR data->>'ownerId' = auth.uid()::text
    OR (kind = 'delivery' AND (data->>'ownerPartnerId' IN (SELECT id FROM public.my_store()) OR id IN (SELECT public.my_rider_ids())))
  ))
);

DROP POLICY IF EXISTS "Riders see their deliveries" ON public.bookings;
CREATE POLICY "Riders see their deliveries" ON public.bookings FOR SELECT TO authenticated
  USING (data->>'deliveryId' IN (SELECT public.my_rider_ids()));

-- Permissions
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.has_role_text(text)', 'public.my_store()', 'public.owner_of_partner(text)', 'public.my_rider_ids()',
    'public.partner_save_rider(jsonb)', 'public.partner_remove_rider(text)',
    'public.partner_set_pickup(double precision, double precision)', 'public.partner_assign_rider(text, text)',
    'public.partner_update_status(text, text)', 'public.claim_rider()', 'public.rider_upload_aadhaar(text, text)',
    'public.rider_document(text)', 'public.set_presence(boolean, double precision, double precision, double precision)',
    'public.rider_feed()', 'public.rider_respond(text, boolean)', 'public.rider_update_status(text, text)',
    'public.can_work_booking(public.bookings)', 'public.job_details(text)', 'public.track_booking(text)',
    'public.save_senior_pin(uuid, double precision, double precision)', 'public.visible_people()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- rider_private is deliberately NOT added to realtime: change events carry whole rows, including the document.
-- Screens refresh from catalog changes (published already) and by polling.
