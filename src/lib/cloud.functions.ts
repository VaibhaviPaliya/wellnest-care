import { createServerFn } from "@tanstack/react-start";
import { phoneEmail, isPhoneEmail } from "./cloud";

/**
 * Mobile sign-in. The code is checked by Twilio Verify when SMS is set up (otp.server.ts); before that, and for the
 * shared demo accounts, the demo code 123456 works. Every phone
 * user becomes a real Lovable Cloud account so their data is protected by row-level security.
 * The server checks the demo code, finds or creates the account for that number, makes sure the shared
 * demo data exists, and returns a one-time sign-in token that the browser exchanges for a session.
 */
export const demoPhoneSignIn = createServerFn({ method: "POST" })
  .validator((input: { phone: string; code: string }) => {
    if (!input || !/^\d{10}$/.test(String(input.phone))) throw new Error("Please enter a 10-digit mobile number.");
    if (!/^[6-9]\d{9}$/.test(String(input.phone))) throw new Error("Please enter a valid Indian mobile number.");
    if (!/^\d{6}$/.test(String(input.code))) throw new Error("Enter the 6-digit code.");
    return { phone: String(input.phone), code: String(input.code) };
  })
  .handler(async ({ data }) => {
    // Real SMS (Twilio Verify) when configured; otherwise, and for the shared demo accounts, the demo code.
    const { checkPhoneCode } = await import("./otp.server");
    if (!(await checkPhoneCode(data.phone, data.code))) throw new Error("That code is not correct or has expired. Request a new one if needed.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureDemoData } = await import("./cloud.server");
    await ensureDemoData(supabaseAdmin);

    const email = phoneEmail(data.phone);
    const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("phone", data.phone).maybeSingle();
    let isNew = false;
    if (existing) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(existing.id);
      // A number saved on an email account must not open that account with the demo code.
      if (!u.user?.email || !isPhoneEmail(u.user.email)) throw new Error("This number belongs to an email account. Please sign in with email.");
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { phone: data.phone } });
      if (error || !created.user) throw new Error("Could not create your account. Please try again.");
      await supabaseAdmin.from("profiles").upsert({ id: created.user.id, phone: data.phone });
      isNew = true;
    }
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) throw new Error("Could not sign you in. Please try again.");
    return { tokenHash: link.properties.hashed_token, isNew };
  });
