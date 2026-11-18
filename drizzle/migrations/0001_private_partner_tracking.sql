CREATE TABLE public.tracking_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 booking_id text NOT NULL,
 service text NOT NULL CHECK (service IN ('medicine','meal','fitness')),
 partner_email text NOT NULL,
 viewer_email text,
 partner_id uuid,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
 stopped boolean NOT NULL DEFAULT false,
 latitude double precision CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision CHECK (longitude BETWEEN -180 AND 180),
 accuracy double precision CHECK (accuracy >= 0 AND accuracy <= 100000),
 located_at timestamptz,
 UNIQUE(owner_id, booking_id)
);
GRANT SELECT ON public.tracking_sessions TO authenticated;
GRANT ALL ON public.tracking_sessions TO service_role;
ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Private tracking participants" ON public.tracking_sessions FOR SELECT TO authenticated USING (
 owner_id = auth.uid() OR (expires_at > now() AND NOT stopped AND (partner_id = auth.uid() OR partner_email = lower(auth.jwt()->>'email') OR viewer_email = lower(auth.jwt()->>'email')))
);
CREATE OR REPLACE FUNCTION public.create_tracking(_booking text, _service text, _partner text, _viewer text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'senior') OR public.has_role(auth.uid(), 'family')) THEN RAISE EXCEPTION 'Sign in with a senior or family email account'; END IF;
 IF length(_booking) NOT BETWEEN 1 AND 100 OR _service NOT IN ('medicine','meal','fitness') OR length(_partner) > 254 OR _partner !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR (_viewer IS NOT NULL AND (length(_viewer) > 254 OR _viewer !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) THEN RAISE EXCEPTION 'Invalid tracking invitation'; END IF;
 INSERT INTO public.tracking_sessions(owner_id, booking_id, service, partner_email, viewer_email) VALUES (auth.uid(), _booking, _service, lower(_partner), lower(_viewer))
 ON CONFLICT(owner_id, booking_id) DO UPDATE SET partner_email = EXCLUDED.partner_email, viewer_email = EXCLUDED.viewer_email, partner_id = NULL, stopped = false, latitude = NULL, longitude = NULL, accuracy = NULL, located_at = NULL, expires_at = now() + interval '12 hours'
 RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.share_tracking(_id uuid, _lat double precision, _lng double precision, _accuracy double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR _lat IS NULL OR _lng IS NULL OR _accuracy IS NULL OR NOT (_lat BETWEEN -90 AND 90) OR NOT (_lng BETWEEN -180 AND 180) OR NOT (_accuracy BETWEEN 0 AND 100000) THEN RAISE EXCEPTION 'Invalid phone location'; END IF;
 UPDATE public.tracking_sessions SET partner_id = auth.uid(), latitude = _lat, longitude = _lng, accuracy = _accuracy, located_at = now()
 WHERE id = _id AND NOT stopped AND expires_at > now() AND partner_email = lower(auth.jwt()->>'email') AND (partner_id IS NULL OR partner_id = auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the invited partner can share during an active session'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.stop_tracking(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.tracking_sessions SET stopped = true, latitude = NULL, longitude = NULL, accuracy = NULL, located_at = NULL WHERE id = _id AND auth.uid() IS NOT NULL AND (owner_id = auth.uid() OR partner_email = lower(auth.jwt()->>'email'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the organizer or partner can stop tracking'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.create_tracking(text,text,text,text), public.share_tracking(uuid,double precision,double precision,double precision), public.stop_tracking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tracking(text,text,text,text), public.share_tracking(uuid,double precision,double precision,double precision), public.stop_tracking(uuid) TO authenticated;