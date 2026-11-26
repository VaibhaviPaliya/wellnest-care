-- WellNest · Partner self-registration with admin verification, and pincode-based partner filtering.
-- Safe to run more than once. Paste the whole file into Lovable Cloud's SQL editor and run it.
--
-- What it does
--  1. Adds a 'partner' role that pharmacies, kitchens and coaches can choose when they register.
--  2. Adds pincode and state to profiles (the senior's delivery / visit address).
--  3. Lets a partner submit or update their own listing; it is always saved as pending and unverified.
--     Only an admin can approve it (existing admin catalogue rights).
--  4. Hides pending or rejected listings from customers; a partner sees their own and the orders placed with it.
--  5. Server rule: a meal, medicine or home-visit booking is refused unless the partner serves the senior's pincode.
--  6. Back-fills service pincodes on the sample partners and pincodes on the sample seniors.
-- Note: the new role value is only referenced as text below, so the script also works when the editor runs it
-- as one transaction.

-- 1. Partner role ------------------------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';

CREATE OR REPLACE FUNCTION public.choose_role(_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _role::text NOT IN ('senior', 'family', 'partner') THEN RAISE EXCEPTION 'This role cannot be chosen at registration'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Role already set'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _role);
END $$;

CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'partner')
$$;

-- 2. Address fields -------------------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pincode text, ADD COLUMN IF NOT EXISTS state text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pincode_format') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_pincode_format CHECK (pincode IS NULL OR pincode ~ '^[1-8][0-9]{5}$');
  END IF;
END $$;

-- A linked family member updates the senior's pincode, city and state (address line uses save_senior_profile).
CREATE OR REPLACE FUNCTION public.save_senior_location(_senior uuid, _pincode text, _city text, _state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_senior(_senior) THEN RAISE EXCEPTION 'You can only edit seniors you are linked to'; END IF;
  IF _pincode IS NOT NULL AND _pincode !~ '^[1-8][0-9]{5}$' THEN RAISE EXCEPTION 'Enter a valid 6-digit Indian pincode'; END IF;
  UPDATE public.profiles SET pincode = _pincode, city = left(_city, 80), state = left(_state, 60) WHERE id = _senior;
END $$;

-- 3. Partner listings -------------------------------------------------------------------------------------
-- Listings owned by the signed-in partner.
CREATE OR REPLACE FUNCTION public.my_listing_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.catalog c
  WHERE c.kind IN ('coach', 'kitchen', 'pharmacy') AND auth.uid() IS NOT NULL AND c.data->>'ownerId' = auth.uid()::text
$$;

-- A partner may see a senior who booked them (name only), and the address for an active home visit.
CREATE OR REPLACE FUNCTION public.partner_serves_senior(_senior uuid, _visit_only boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.senior_id = _senior AND b.data->>'partnerId' IN (SELECT public.my_listing_ids())
      AND (NOT _visit_only OR (b.data->>'type' = 'fitness' AND b.data->>'videoUrl' IS NULL
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
    SET data = EXCLUDED.data || jsonb_strip_nulls(jsonb_build_object('photo', public.catalog.data->'photo')), updated_at = now();
  RETURN new_id;
END $$;

-- An approved kitchen manages its own dishes. Health tags and nutrition stay admin-managed.
CREATE OR REPLACE FUNCTION public.partner_save_dish(_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  kitchen text;
  old jsonb;
  dish_id text;
BEGIN
  SELECT c.id INTO kitchen FROM public.catalog c
  WHERE c.kind = 'kitchen' AND c.data->>'ownerId' = auth.uid()::text AND (c.data->>'verified')::boolean;
  IF kitchen IS NULL THEN RAISE EXCEPTION 'Only an approved kitchen can manage dishes'; END IF;
  IF coalesce(btrim(_data->>'name'), '') = '' OR length(_data->>'name') > 120 OR length(coalesce(_data->>'desc', '')) > 300 THEN
    RAISE EXCEPTION 'Enter a dish name (up to 120 characters) and a short description';
  END IF;
  IF jsonb_typeof(_data->'price') IS DISTINCT FROM 'number' OR (_data->>'price')::numeric NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Enter a price between ₹1 and ₹10,000';
  END IF;
  IF coalesce(_data->>'diet', '') NOT IN ('veg', 'non_veg', 'egg') THEN RAISE EXCEPTION 'Choose veg, egg or non-veg'; END IF;
  SELECT d.data INTO old FROM public.catalog d WHERE d.kind = 'dish' AND d.id = _data->>'id' AND d.data->>'kitchenId' = kitchen;
  dish_id := CASE WHEN old IS NULL THEN 'di-' || replace(gen_random_uuid()::text, '-', '') ELSE _data->>'id' END;
  INSERT INTO public.catalog (kind, id, ord, data) VALUES ('dish', dish_id, 1000, jsonb_build_object(
    'id', dish_id, 'kitchenId', kitchen, 'name', btrim(_data->>'name'), 'price', (_data->>'price')::numeric,
    'diet', _data->>'diet', 'jain', coalesce((_data->>'jain')::boolean, false), 'desc', coalesce(_data->>'desc', ''),
    'tags', coalesce(old->'tags', '[]'::jsonb)) || jsonb_strip_nulls(jsonb_build_object('nutrition', old->'nutrition')))
  ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
  RETURN dish_id;
END $$;

CREATE OR REPLACE FUNCTION public.partner_delete_dish(_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.catalog d WHERE d.kind = 'dish' AND d.id = _id
    AND d.data->>'kitchenId' IN (SELECT public.my_listing_ids());
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only remove your own dishes'; END IF;
END $$;

-- 4. Who sees what ------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone signed in reads partners" ON public.catalog;
DROP POLICY IF EXISTS "Read approved partners and own listing" ON public.catalog;
CREATE POLICY "Read approved partners and own listing" ON public.catalog FOR SELECT TO authenticated USING (
  public.is_admin() OR (kind <> 'meta' AND (
    kind NOT IN ('coach', 'kitchen', 'pharmacy')
    OR coalesce((data->>'verified')::boolean, false)
    OR data->>'ownerId' = auth.uid()::text
  ))
);

DROP POLICY IF EXISTS "Partners see orders placed with them" ON public.bookings;
CREATE POLICY "Partners see orders placed with them" ON public.bookings FOR SELECT TO authenticated
  USING (data->>'partnerId' IN (SELECT public.my_listing_ids()));

-- People list: adds pincode and state, and the customers who booked a partner (address only for an active home visit).
DROP FUNCTION IF EXISTS public.visible_people();
CREATE FUNCTION public.visible_people()
RETURNS TABLE (id uuid, name text, username text, phone text, email text, age integer, city text, address text,
               consent_at timestamptz, health jsonb, role public.app_role, linked_senior_ids uuid[], pincode text, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.username,
         -- Phone as before, except a partner only sees it during an active home visit.
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
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) OR public.partner_serves_senior(p.id, true) THEN p.state END
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

-- 5. Bookings: the partner must serve the senior's pincode (meal, medicine and home-visit fitness) -----------
CREATE OR REPLACE FUNCTION public.check_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- Security definer so the double-booking check sees every booking of that coach, not only the caller's own.
DECLARE
  partner_kind text;
  partner jsonb;
  senior_pin text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.senior_id <> OLD.senior_id OR NEW.data->>'partnerId' <> OLD.data->>'partnerId' OR NEW.data->>'when' <> OLD.data->>'when' THEN
      RAISE EXCEPTION 'A booking''s senior, partner and time cannot be changed';
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
  RETURN NEW;
END $$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.is_partner(), public.my_listing_ids(), public.partner_serves_senior(uuid, boolean),
  public.submit_partner(text, jsonb), public.partner_save_dish(jsonb), public.partner_delete_dish(text),
  public.save_senior_location(uuid, text, text, text), public.visible_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_partner(), public.my_listing_ids(), public.partner_serves_senior(uuid, boolean),
  public.submit_partner(text, jsonb), public.partner_save_dish(jsonb), public.partner_delete_dish(text),
  public.save_senior_location(uuid, text, text, text), public.visible_people() TO authenticated;

-- 6. Sample data back-fill ----------------------------------------------------------------------------------
UPDATE public.catalog c SET data = c.data || jsonb_build_object('servicePincodes', v.pins), updated_at = now()
FROM (VALUES
  ('coach', 'c1', '["560011","560041","560069","560070","560004"]'::jsonb),
  ('coach', 'c2', '["560034","560095","560076","560068","560011"]'),
  ('coach', 'c3', '[]'), ('coach', 'c4', '["560038","560008","560001","560034"]'), ('coach', 'c5', '[]'),
  ('kitchen', 'k1', '["560011","560041","560069","560070","560004","560076"]'),
  ('kitchen', 'k2', '["560038","560008","560001","560034","560095"]'),
  ('kitchen', 'k3', '["560034","560095","560068","560076","560029","560011"]'), ('kitchen', 'k4', '[]'),
  ('pharmacy', 'p1', '["560011","560041","560069","560070"]'), ('pharmacy', 'p2', '["560076","560068","560029","560034"]'),
  ('pharmacy', 'p3', '["560004","560011","560019","560050"]'), ('pharmacy', 'p4', '[]')
) AS v(kind, id, pins)
WHERE c.kind = v.kind AND c.id = v.id AND NOT (c.data ? 'servicePincodes');

INSERT INTO public.catalog (kind, id, ord, data) VALUES ('pharmacy', 'p5', 4, jsonb_build_object(
  'id', 'p5', 'name', 'Chandigarh Wellness Chemist', 'area', 'Sector 22', 'verified', true, 'eta', '40 min',
  'servicePincodes', '["160022","160017","160020","160023"]'::jsonb))
ON CONFLICT (kind, id) DO NOTHING;

UPDATE public.profiles SET pincode = '560011', city = 'Bengaluru', state = 'Karnataka',
  address = CASE WHEN address = '12, 4th Cross, Jayanagar, Bengaluru' THEN '12, 4th Cross, Jayanagar' ELSE address END
WHERE username = 'demo_kamala' AND pincode IS NULL;
UPDATE public.profiles SET pincode = '160022', city = 'Chandigarh', state = 'Chandigarh',
  address = CASE WHEN address = 'Sector 21, Chandigarh' THEN 'House 1021, Sector 21' ELSE address END
WHERE username = 'demo_harbhajan' AND pincode IS NULL;
