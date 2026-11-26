/**
 * Mobile OTP by SMS (server only). Providers, in order of preference:
 *
 *  1. Message Central VerifyNow — sends a 6-digit code on Message Central's pre-approved Indian template
 *     (sender UTOMOB, DLT handled by them) and checks it. Settings: customer ID + password (+ signup email).
 *  2. Twilio Verify — account SID, Verify service SID, and an API key (or auth token).
 *  3. Demo mode — code 123456, only while neither is set up. Once real SMS is on, every number needs a real code
 *     (the old shared demo accounts included), so the public demo code can no longer open any account.
 *
 * Settings come from environment secrets (MESSAGECENTRAL_CUSTOMER_ID, MESSAGECENTRAL_PASSWORD,
 * MESSAGECENTRAL_EMAIL / TWILIO_*) or from the locked app_secrets table (rows messagecentral_* / twilio_*),
 * which only the server can read. Codes are never stored by WellNest; the provider checks them and limits attempts.
 */
import { DEMO_OTP } from "./seed";

type Provider =
  | { kind: "messagecentral"; customerId: string; password: string; email?: string }
  | { kind: "twilio"; accountSid: string; serviceSid: string; user: string; pass: string };

export type SendResult = { mode: "sms" | "demo"; ref?: string; resendAfter: number };

const env = (k: string) => (typeof process !== "undefined" ? process.env[k]?.trim() : undefined) || undefined;
let cached: { at: number; p: Provider | null } | null = null;

async function secretRows(): Promise<Map<string, string>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // app_secrets is deliberately absent from the generated (browser) types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any).from("app_secrets").select("name,value").or("name.like.twilio_%,name.like.messagecentral_%");
    return new Map(((data ?? []) as { name: string; value: string }[]).map((r) => [r.name, String(r.value).trim()]));
  } catch { return new Map(); }
}

export async function smsProvider(): Promise<Provider | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.p;
  const rows = await secretRows();
  const get = (envKey: string, row: string) => env(envKey) || rows.get(row) || undefined;
  let p: Provider | null = null;
  const mcId = get("MESSAGECENTRAL_CUSTOMER_ID", "messagecentral_customer_id"), mcPass = get("MESSAGECENTRAL_PASSWORD", "messagecentral_password");
  if (mcId && mcPass) p = { kind: "messagecentral", customerId: mcId, password: mcPass, email: get("MESSAGECENTRAL_EMAIL", "messagecentral_email") };
  if (!p) {
    const accountSid = get("TWILIO_ACCOUNT_SID", "twilio_account_sid"), serviceSid = get("TWILIO_VERIFY_SERVICE_SID", "twilio_verify_service_sid");
    const keySid = get("TWILIO_API_KEY_SID", "twilio_api_key_sid"), keySecret = get("TWILIO_API_KEY_SECRET", "twilio_api_key_secret"), token = get("TWILIO_AUTH_TOKEN", "twilio_auth_token");
    if (accountSid?.startsWith("AC") && serviceSid?.startsWith("VA")) {
      if (keySid?.startsWith("SK") && keySecret) p = { kind: "twilio", accountSid, serviceSid, user: keySid, pass: keySecret };
      else if (token) p = { kind: "twilio", accountSid, serviceSid, user: accountSid, pass: token };
    }
  }
  cached = { at: Date.now(), p };
  return p;
}
/** Kept for callers that only need to know whether real SMS is on. */
export const twilioConfig = smsProvider;

/** Indian mobile numbers: 10 digits starting 6–9. */
export const isIndianMobile = (p: string) => /^[6-9]\d{9}$/.test(p);

// ---------- binding a provider verification ID to the phone (stateless, tamper-proof) ----------

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
async function sign(text: string): Promise<string> {
  // Server-only key. The service-role key never leaves the server, so nobody else can mint a valid reference.
  const secret = env("SUPABASE_SERVICE_ROLE_KEY") || env("OTP_SIGNING_KEY") || "wellnest-dev-only";
  const key = await crypto.subtle.importKey("raw", enc.encode(`otp-ref:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
export async function makeRef(phone: string, id: string, ttlMs = 10 * 60_000): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${id}.${exp}.${await sign(`${phone}|${id}|${exp}`)}`;
}
export async function readRef(phone: string, ref: string | undefined): Promise<string | null> {
  const m = /^([A-Za-z0-9_-]{1,64})\.(\d{10,16})\.([a-f0-9]{64})$/.exec(ref ?? "");
  if (!m || Number(m[2]) < Date.now()) return null;
  const expected = await sign(`${phone}|${m[1]}|${m[2]}`);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ m[3].charCodeAt(i);
  return diff === 0 ? m[1] : null;
}

// ---------- Message Central VerifyNow ----------

const MC = "https://cpaas.messagecentral.com";
const MC_MESSAGES: Record<number, string> = {
  501: "SMS isn't set up correctly (Message Central rejected the customer ID).",
  506: "A code was just sent. Please wait a minute before asking for another.",
  511: "SMS to this country isn't supported.",
  700: "Verification failed. Please request a new code.",
  702: "That code is not correct.",
  703: "This code was already used. Please request a new one.",
  705: "That code has expired. Please request a new one.",
  800: "Too many attempts for this number. Please try again later.",
};
let mcToken: { value: string; at: number } | null = null;

async function mcAuth(p: Extract<Provider, { kind: "messagecentral" }>, fresh = false): Promise<string> {
  if (!fresh && mcToken && Date.now() - mcToken.at < 20 * 60_000) return mcToken.value;
  const q = new URLSearchParams({ customerId: p.customerId, key: btoa(p.password), scope: "NEW", country: "91", ...(p.email ? { email: p.email } : {}) });
  const res = await fetch(`${MC}/auth/v1/authentication/token?${q}`, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as { token?: string; authToken?: string; data?: { authToken?: string; token?: string } };
  const token = body.token ?? body.authToken ?? body.data?.authToken ?? body.data?.token;
  if (!res.ok || !token) throw new Error("SMS isn't set up correctly (Message Central login failed — check the customer ID and password).");
  mcToken = { value: token, at: Date.now() };
  return token;
}

type McBody = { responseCode?: number | string; message?: string; data?: { verificationId?: string | number; verificationStatus?: string; responseCode?: string | number; timeout?: string } };
async function mcCall(p: Extract<Provider, { kind: "messagecentral" }>, method: "GET" | "POST", path: string, q: Record<string, string>): Promise<McBody> {
  const go = async (fresh: boolean) => {
    const res = await fetch(`${MC}${path}?${new URLSearchParams(q)}`, { method, headers: { authToken: await mcAuth(p, fresh), accept: "*/*" }, signal: AbortSignal.timeout(10_000) });
    return { res, body: (await res.json().catch(() => ({}))) as McBody };
  };
  let { res, body } = await go(false);
  if (res.status === 401 || res.status === 403) ({ res, body } = await go(true)); // token expired
  return body;
}
const mcCode = (b: McBody) => Number(b.data?.responseCode ?? b.responseCode ?? 0);

// ---------- Twilio Verify ----------

const TWILIO_MESSAGES: Record<number, string> = {
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
async function twilio(p: Extract<Provider, { kind: "twilio" }>, path: string, form: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${p.serviceSid}/${path}`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${p.user}:${p.pass}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: number };
  if (!res.ok) {
    if (path === "VerificationCheck" && res.status === 404) return { status: "expired" };
    throw new Error(TWILIO_MESSAGES[body.code ?? 0] ?? "Couldn't send the SMS right now. Please try again in a minute.");
  }
  return body;
}

// ---------- public API ----------

/** Sends a code. `ref` must be passed back with the code (Message Central needs its verification ID). */
export async function startPhoneVerification(phone: string): Promise<SendResult> {
  if (!isIndianMobile(phone)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  const p = await smsProvider();
  if (!p) return { mode: "demo", resendAfter: 30 };
  if (p.kind === "twilio") {
    await twilio(p, "Verifications", { To: `+91${phone}`, Channel: "sms", Locale: "en" });
    return { mode: "sms", resendAfter: 30 };
  }
  const body = await mcCall(p, "POST", "/verification/v3/send", { countryCode: "91", customerId: p.customerId, flowType: "SMS", mobileNumber: phone, otpLength: "6" });
  const id = body.data?.verificationId;
  if (mcCode(body) !== 200 || id == null) throw new Error(MC_MESSAGES[mcCode(body)] ?? "Couldn't send the SMS right now. Please try again in a minute.");
  const wait = Math.min(120, Math.max(30, Math.round(Number(body.data?.timeout ?? 60)) || 60));
  return { mode: "sms", ref: await makeRef(phone, String(id)), resendAfter: wait };
}

/** True when the code is right. Wrong codes count towards the provider's attempt limit; clear errors are thrown for limits. */
export async function checkPhoneCode(phone: string, code: string, ref?: string): Promise<boolean> {
  if (!isIndianMobile(phone) || !/^\d{4,10}$/.test(code)) return false;
  const p = await smsProvider();
  if (!p) return code === DEMO_OTP;
  if (p.kind === "twilio") return (await twilio(p, "VerificationCheck", { To: `+91${phone}`, Code: code })).status === "approved";
  const id = await readRef(phone, ref);
  if (!id) throw new Error("This code request has expired. Please request a new code.");
  const body = await mcCall(p, "GET", "/verification/v3/validateOtp", { countryCode: "91", mobileNumber: phone, verificationId: id, customerId: p.customerId, code });
  if (body.data?.verificationStatus === "VERIFICATION_COMPLETED" && mcCode(body) === 200) return true;
  const c = mcCode(body);
  if (c === 702 || c === 700) return false;
  throw new Error(MC_MESSAGES[c] ?? "Couldn't check the code right now. Please try again.");
}
