import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Continue with Google" through Lovable Cloud's managed Google sign-in (no Google Cloud setup needed).
 * On the published site the browser goes to Google and comes back signed in; inside the Lovable editor
 * preview it opens a pop-up and hands the session back here. New Google users then finish the normal
 * registration (name, role, consent, health profile).
 * Returns an error message, or null when sign-in started or finished.
 */
export async function continueWithGoogle(): Promise<string | null> {
  try {
    const result = await createLovableAuth().signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.redirected) return null;
    if (result.error) return /popup was blocked/i.test(result.error.message)
      ? "Your browser blocked the Google window. Allow pop-ups for this site and try again."
      : result.error.message;
    const { error } = await supabase.auth.setSession(result.tokens);
    return error ? "Could not finish Google sign-in. Please try again." : null;
  } catch {
    return "Google sign-in is not available right now. Please use your mobile number or email.";
  }
}
