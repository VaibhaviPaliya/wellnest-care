-- WellNest · Real SMS sign-in codes (Twilio Verify) and verified mobile numbers.
-- Run AFTER 0004. Safe to run more than once.
--
--  1. A locked app_secrets table (also used for the Razorpay secret). Row-level security is on with no policies,
--     so only the app's server can read it — never the browser.
--  2. A mobile number can only be added or changed on a profile through the server after an SMS code check.
--     Family links and delivery-partner links trust that number, so it must be proven.

CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() is set for requests from the app in a user's browser; the server's verified path has none.
  IF auth.uid() IS NOT NULL AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'Verify the new mobile number with the SMS code first';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_phone_guard ON public.profiles;
CREATE TRIGGER profiles_phone_guard BEFORE UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_phone();
