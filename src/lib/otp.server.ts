/**
 * Mobile OTP by SMS through Twilio Verify (server only).
 *
 * Twilio Verify generates, sends and checks the code itself, limits attempts per number, and uses
 * pre-registered templates that meet India's DLT rules for SMS. Nothing about the code is stored here.
 *
 * Credentials are read, in order, from:
 *   1. environment secrets: TWILIO_ACCOUNT_SID, TWILIO_VERIFY_SERVICE_SID and either
 *      TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN
 *   2. the locked app_secrets table (rows twilio_account_sid, twilio_verify_service_sid,
 *      twilio_api_key_sid + twilio_api_key_secret, or twilio_auth_token) — see migration 0005.
 * Without them the app stays in demo mode (code 123456), so it keeps working before SMS is set up.
 */
import { DEMO_OTP, seedUsers } from "./seed";

export interface TwilioConfig { accountSid: string; serviceSid: string; user: string; pass: string; }

const env = (k: string) => (typeof process !== "undefined" ? process.env[k]?.trim() : undefined) || undefined;

let cached: { at: number; cfg: TwilioConfig | null } | null = null;

export async function twilioConfig(): Promise<TwilioConfig | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.cfg;
  const pick = (get: (k: string) => string | undefined): TwilioConfig | null => {
    const accountSid = get("account_sid"), serviceSid = get("verify_service_sid");
    const keySid = get("api_key_sid"), keySecret = get("api_key_secret"), token = get("auth_token");
    if (!accountSid?.startsWith("AC") || !serviceSid?.startsWith("VA")) return null;
    if (keySid?.startsWith("SK") && keySecret) return { accountSid, serviceSid, user: keySid, pass: keySecret };
    if (token) return { accountSid, serviceSid, user: accountSid, pass: token };
    return null;
  };
  let cfg = pick((k) => env(`TWILIO_${k.toUpperCase()}`));
  if (!cfg) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // app_secrets is deliberately absent from the generated (browser) types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabaseAdmin as any).from("app_secrets").select("name,value").like("name", "twilio_%");
      const rows = new Map<string, string>(((data ?? []) as { name: string; value: string }[]).map((r) => [r.name.replace(/^twilio_/, ""), String(r.value).trim()]));
      cfg = pick((k) => rows.get(k) || undefined);
    } catch { cfg = null; }
  }
  cached = { at: Date.now(), cfg };
  return cfg;
}

/** Indian mobile numbers: 10 digits starting 6–9. */
export const isIndianMobile = (p: string) => /^[6-9]\d{9}$/.test(p);
/** The shared demo accounts keep using the demo code even when real SMS is on (they are not real phones). */
export const isDemoNumber = (p: string) => seedUsers.some((u) => u.phone === p);

const MESSAGES: Record<number, string> = {
  60200: "That mobile number doesn't look right.",
  60202: "Too many wrong codes. Request a new one.",
  60203: "Too many codes sent to this number. Please wait 10 minutes and try again.",
  60205: "This number can't receive SMS. Please use another number.",
  60212: "Too many attempts. Please wait a few minutes.",
  60410: "SMS to this number is temporarily blocked. Please try again later or use email.",
  60605: "SMS to this country isn't enabled for WellNest.",
  21608: "This Twilio trial account can only text numbers verified in the Twilio console.",
  20003: "SMS isn't set up correctly (Twilio rejected the credentials).",
  20404: "SMS isn't set up correctly (Verify service not found).",
};

async function twilio(cfg: TwilioConfig, path: string, form: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${cfg.serviceSid}/${path}`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${cfg.user}:${cfg.pass}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  if (!res.ok) {
    // A finished or expired verification returns 404 on check.
    if (path === "VerificationCheck" && res.status === 404) return { status: "expired" };
    throw new Error(MESSAGES[body.code ?? 0] ?? "Couldn't send the SMS right now. Please try again in a minute.");
  }
  return body;
}

/** Sends a code. Returns "sms" when Twilio sent it, or "demo" when SMS isn't configured / demo account. */
export async function startPhoneVerification(phone: string): Promise<"sms" | "demo"> {
  if (!isIndianMobile(phone)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  const cfg = await twilioConfig();
  if (!cfg || isDemoNumber(phone)) return "demo";
  await twilio(cfg, "Verifications", { To: `+91${phone}`, Channel: "sms", Locale: "en" });
  return "sms";
}

/** True when the code is right. Each wrong attempt counts towards Twilio's limit for that code. */
export async function checkPhoneCode(phone: string, code: string): Promise<boolean> {
  if (!isIndianMobile(phone) || !/^\d{4,10}$/.test(code)) return false;
  const cfg = await twilioConfig();
  if (!cfg || isDemoNumber(phone)) return code === DEMO_OTP;
  const r = await twilio(cfg, "VerificationCheck", { To: `+91${phone}`, Code: code });
  return r.status === "approved";
}
