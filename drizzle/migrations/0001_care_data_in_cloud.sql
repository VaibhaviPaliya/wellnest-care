-- WellNest: move bookings, orders, alerts, partners and care data from the browser into Lovable Cloud.
-- Every table has row-level security: a senior sees their own data, a linked family member sees their
-- senior's data, an admin sees bookings and partners. Health details are only returned to the senior and
-- linked family (never to admins or partners).

-- 1. Profiles: address, consent and health profile (health can only exist after consent - BR3)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS health jsonb;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_health_needs_consent CHECK (health IS NULL OR consent_at IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';

-- 2. Family links (created only through link_senior, which checks the caller is a family member)
CREATE TABLE public.family_links (
  family_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  senior_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, senior_id)
);

-- 3. Access helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin')
$$;

CREATE OR REPLACE FUNCTION public.can_manage_senior(_senior uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (auth.uid() = _senior AND public.has_role(auth.uid(), 'senior'))
    OR EXISTS (SELECT 1 FROM public.family_links l WHERE l.family_id = auth.uid() AND l.senior_id = _senior)
  )
$$;

-- Is this user a family member linked to this senior? (security definer: the caller cannot see other people's links)
CREATE OR REPLACE FUNCTION public.is_family_of(_user uuid, _senior uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_links l WHERE l.family_id = _user AND l.senior_id = _senior)
$$;

CREATE OR REPLACE FUNCTION public.can_view_senior(_senior uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_senior(_senior) OR public.is_admin()
$$;

-- 4. Partner catalogue: coaches, kitchens, dishes, pharmacies, delivery partners, exercise plans
CREATE TABLE public.catalog (
  kind text NOT NULL CHECK (kind IN ('coach', 'kitchen', 'dish', 'pharmacy', 'delivery', 'plan', 'meta')),
  id text NOT NULL,
  ord integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);

-- 5. Bookings and orders (one row per fitness session, meal order or medicine order)
CREATE TABLE public.bookings (
  id text PRIMARY KEY,
  senior_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_senior_idx ON public.bookings (senior_id);

-- 6. Alerts (one row per recipient)
CREATE TABLE public.notices (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  senior_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notices_user_idx ON public.notices (user_id);

-- 7. Care items: reminders, exercise subscriptions, professional review requests, completed exercises,
--    and "starting soon" markers so a booking is only alerted once
CREATE TABLE public.care_items (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('reminder', 'subscription', 'request', 'completion', 'booking_alert')),
  senior_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_items_senior_idx ON public.care_items (senior_id);

-- 8. Server-side business rules for bookings made by signed-in users (BR1 verified partner, BR5 future slot,
--    no double booking). Seeding by the service role (no signed-in user) is not checked.
CREATE OR REPLACE FUNCTION public.check_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- Security definer so the double-booking check sees every booking of that coach, not only the caller's own.
DECLARE
  partner_kind text;
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
  IF partner_kind IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalog c WHERE c.kind = partner_kind AND c.id = NEW.data->>'partnerId' AND (c.data->>'verified')::boolean
  ) THEN RAISE EXCEPTION 'This partner is not available'; END IF;
  IF (NEW.data->>'when')::timestamptz <= now() THEN RAISE EXCEPTION 'Please select a future time'; END IF;
  IF NEW.data->>'type' = 'fitness' AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.data->>'type' = 'fitness' AND b.data->>'partnerId' = NEW.data->>'partnerId'
      AND (b.data->>'when')::timestamptz = (NEW.data->>'when')::timestamptz AND b.data->>'status' <> 'cancelled'
  ) THEN RAISE EXCEPTION 'This slot has already been booked'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_rules BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.check_booking();

-- 9. Row-level security
ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON public.family_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog, public.bookings, public.notices, public.care_items TO authenticated;
GRANT ALL ON public.family_links, public.catalog, public.bookings, public.notices, public.care_items TO service_role;

CREATE POLICY "See own links" ON public.family_links FOR SELECT TO authenticated
  USING (family_id = auth.uid() OR senior_id = auth.uid() OR public.is_admin());
CREATE POLICY "Remove own links" ON public.family_links FOR DELETE TO authenticated
  USING (family_id = auth.uid() OR senior_id = auth.uid());

CREATE POLICY "Anyone signed in reads partners" ON public.catalog FOR SELECT TO authenticated
  USING (kind <> 'meta' OR public.is_admin());
CREATE POLICY "Admins add partners" ON public.catalog FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins edit partners" ON public.catalog FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins remove partners" ON public.catalog FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "See own or linked bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.can_view_senior(senior_id));
CREATE POLICY "Book for self or linked senior" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_senior(senior_id) AND booked_by = auth.uid());
CREATE POLICY "Update own, linked or as admin" ON public.bookings FOR UPDATE TO authenticated
  USING (public.can_view_senior(senior_id)) WITH CHECK (public.can_view_senior(senior_id));

CREATE POLICY "Read own alerts" ON public.notices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Alert the senior and their family" ON public.notices FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (senior_id IS NOT NULL AND public.can_view_senior(senior_id) AND (
      user_id = senior_id OR public.is_family_of(user_id, senior_id)
    ))
  );
CREATE POLICY "Mark own alerts read" ON public.notices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own alerts" ON public.notices FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "See own or linked care items" ON public.care_items FOR SELECT TO authenticated
  USING (public.can_view_senior(senior_id));
CREATE POLICY "Add care items for self or linked senior" ON public.care_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_senior(senior_id));
CREATE POLICY "Edit care items; admins record review decisions" ON public.care_items FOR UPDATE TO authenticated
  USING (public.can_manage_senior(senior_id) OR (public.is_admin() AND kind = 'request'))
  WITH CHECK (public.can_manage_senior(senior_id) OR (public.is_admin() AND kind = 'request'));
CREATE POLICY "Remove care items for self or linked senior" ON public.care_items FOR DELETE TO authenticated
  USING (public.can_manage_senior(senior_id));

-- 10. People the signed-in user may see. Health, consent and address only for self and linked seniors.
CREATE OR REPLACE FUNCTION public.visible_people()
RETURNS TABLE (id uuid, name text, username text, phone text, email text, age integer, city text, address text,
               consent_at timestamptz, health jsonb, role public.app_role, linked_senior_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.username, p.phone,
         CASE WHEN p.id = auth.uid() OR public.is_admin() THEN u.email::text END,
         p.age, p.city,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.address END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.consent_at END,
         CASE WHEN p.id = auth.uid() OR public.can_manage_senior(p.id) THEN p.health END,
         (SELECT r.role FROM public.user_roles r WHERE r.user_id = p.id ORDER BY (r.role = 'admin') DESC LIMIT 1),
         ARRAY(SELECT l.senior_id FROM public.family_links l WHERE l.family_id = p.id
               AND (p.id = auth.uid() OR l.senior_id = auth.uid() OR public.is_admin() OR public.can_manage_senior(l.senior_id)))
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE auth.uid() IS NOT NULL AND (
    p.id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.family_links l WHERE l.family_id = auth.uid() AND l.senior_id = p.id)
    OR EXISTS (SELECT 1 FROM public.family_links l WHERE l.senior_id = auth.uid() AND l.family_id = p.id)
    -- other family members of a senior I look after (so they get alerts too)
    OR EXISTS (SELECT 1 FROM public.family_links mine JOIN public.family_links theirs ON theirs.senior_id = mine.senior_id
               WHERE mine.family_id = auth.uid() AND theirs.family_id = p.id)
  )
$$;

-- 11. A linked family member edits the senior's health profile (only after the senior consented)
CREATE OR REPLACE FUNCTION public.save_senior_profile(_senior uuid, _health jsonb, _address text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_senior(_senior) THEN RAISE EXCEPTION 'You can only edit seniors you are linked to'; END IF;
  IF _health IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _senior AND consent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The senior must give consent first';
  END IF;
  UPDATE public.profiles SET health = _health, address = _address WHERE id = _senior;
END $$;

-- 12. A family member links to a senior by mobile number (the approval code is checked in the app)
CREATE OR REPLACE FUNCTION public.link_senior(_phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid;
  fname text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'family') THEN RAISE EXCEPTION 'Only family accounts can link a senior'; END IF;
  SELECT p.id INTO sid FROM public.profiles p WHERE p.phone = _phone AND public.has_role(p.id, 'senior');
  IF sid IS NULL THEN RAISE EXCEPTION 'No senior account found with that number'; END IF;
  IF EXISTS (SELECT 1 FROM public.family_links WHERE family_id = auth.uid() AND senior_id = sid) THEN RAISE EXCEPTION 'Already linked'; END IF;
  INSERT INTO public.family_links (family_id, senior_id) VALUES (auth.uid(), sid);
  SELECT name INTO fname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notices (id, user_id, senior_id, data) VALUES (
    'n-' || replace(gen_random_uuid()::text, '-', ''), sid, sid,
    jsonb_build_object('title', 'Family member linked', 'body', coalesce(fname, 'A family member') || ' can now see your bookings and receive alerts.', 'at', now(), 'read', false)
  );
  RETURN sid;
END $$;

REVOKE EXECUTE ON FUNCTION public.visible_people(), public.save_senior_profile(uuid, jsonb, text), public.link_senior(text),
  public.is_admin(), public.can_manage_senior(uuid), public.can_view_senior(uuid), public.is_family_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_people(), public.save_senior_profile(uuid, jsonb, text), public.link_senior(text),
  public.is_admin(), public.can_manage_senior(uuid), public.can_view_senior(uuid), public.is_family_of(uuid, uuid) TO authenticated;

-- 13. Live updates (a family member's phone refreshes when the senior books, and the other way round)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings, public.notices, public.care_items, public.catalog, public.family_links;
  END IF;
END $$;
