import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const mobile = (v: unknown) => {
  const p = String(v ?? "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(p)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  return p;
};

/** Whether real SMS is set up (the sign-in page shows a demo note when it isn't). */
export const otpMode = createServerFn({ method: "GET" }).handler(async () => {
  const { twilioConfig } = await import("./otp.server");
  return { sms: !!(await twilioConfig()) };
});

/** Texts a one-time code to an Indian mobile number (Twilio Verify), or reports demo mode. */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((input: { phone: string }) => ({ phone: mobile(input?.phone) }))
  .handler(async ({ data }) => {
    const { startPhoneVerification } = await import("./otp.server");
    return { mode: await startPhoneVerification(data.phone) };
  });

/**
 * Adds or changes the signed-in user's mobile number after checking the SMS code.
 * This is the only way a number gets onto a profile (the database refuses other changes — migration 0005),
 * because family links and delivery-partner links trust that number.
 */
export const verifyMyMobile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone: string; code: string }) => ({ phone: mobile(input?.phone), code: String(input?.code ?? "").replace(/\D/g, "") }))
  .handler(async ({ data, context }) => {
    const { checkPhoneCode } = await import("./otp.server");
    if (!(await checkPhoneCode(data.phone, data.code))) throw new Error("That code is not correct or has expired.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("phone", data.phone).neq("id", context.userId).maybeSingle();
    if (taken) throw new Error("This mobile number is already used by another WellNest account.");
    const { error } = await supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", context.userId);
    if (error) throw new Error("Couldn't save your mobile number. Please try again.");
    // A delivery-partner account listed by a store with this number is linked straight away.
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if ((roles ?? []).some((r) => String(r.role) === "delivery")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from("rider_private").update({ rider_user: context.userId }).eq("phone", data.phone).is("rider_user", null)
        .then(() => undefined, () => undefined);
    }
    return { phone: data.phone };
  });
