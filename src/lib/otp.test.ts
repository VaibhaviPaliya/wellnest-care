import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets: { name: string; value: string }[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ like: async () => ({ data: secrets }) }) }) },
}));

const load = async () => { vi.resetModules(); return import("./otp.server"); };
const KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_VERIFY_SERVICE_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_AUTH_TOKEN"];

describe("SMS codes via Twilio Verify", () => {
  let calls: { url: string; init: RequestInit }[] = [];
  let reply: { status: number; body: unknown } = { status: 201, body: { status: "pending" } };
  beforeEach(() => {
    calls = []; secrets.length = 0; KEYS.forEach((k) => delete process.env[k]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(reply.body), { status: reply.status }); }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stays in demo mode until Twilio is set up", async () => {
    const otp = await load();
    expect(await otp.startPhoneVerification("9876500002")).toBe("demo");
    expect(await otp.checkPhoneCode("9876500002", "123456")).toBe(true);
    expect(await otp.checkPhoneCode("9876500002", "111111")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("sends through Twilio Verify with the API key from environment secrets", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_VERIFY_SERVICE_SID: "VA456", TWILIO_API_KEY_SID: "SK789", TWILIO_API_KEY_SECRET: "s3cret" });
    const otp = await load();
    expect(await otp.startPhoneVerification("9876500002")).toBe("sms");
    expect(calls[0].url).toBe("https://verify.twilio.com/v2/Services/VA456/Verifications");
    expect(String(calls[0].init.body)).toBe("To=%2B919876500002&Channel=sms&Locale=en");
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe("Basic " + btoa("SK789:s3cret"));
  });

  it("reads the details from the locked app_secrets table too", async () => {
    secrets.push({ name: "twilio_account_sid", value: "AC1" }, { name: "twilio_verify_service_sid", value: "VA2" }, { name: "twilio_auth_token", value: "tok" });
    const otp = await load();
    expect(await otp.startPhoneVerification("9876500002")).toBe("sms");
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe("Basic " + btoa("AC1:tok"));
  });

  it("accepts only codes Twilio approves", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_VERIFY_SERVICE_SID: "VA2", TWILIO_AUTH_TOKEN: "tok" });
    let otp = await load();
    reply = { status: 200, body: { status: "approved" } };
    expect(await otp.checkPhoneCode("9876500002", "482913")).toBe(true);
    expect(calls[0].url).toMatch(/VerificationCheck$/);
    reply = { status: 200, body: { status: "pending" } };
    expect(await otp.checkPhoneCode("9876500002", "000000")).toBe(false);
    reply = { status: 404, body: { code: 20404 } };
    expect(await otp.checkPhoneCode("9876500002", "482913")).toBe(false); // expired or already used
    otp = await load();
    expect(await otp.checkPhoneCode("9876500002", "123456")).toBe(false); // demo code no longer works for real numbers
  });

  it("keeps the shared demo accounts on the demo code even with SMS on", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_VERIFY_SERVICE_SID: "VA2", TWILIO_AUTH_TOKEN: "tok" });
    const otp = await load();
    expect(await otp.startPhoneVerification("9876543210")).toBe("demo");
    expect(await otp.checkPhoneCode("9876543210", "123456")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("explains Twilio's limits in plain words", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_VERIFY_SERVICE_SID: "VA2", TWILIO_AUTH_TOKEN: "tok" });
    const otp = await load();
    reply = { status: 429, body: { code: 60203 } };
    await expect(otp.startPhoneVerification("9876500002")).rejects.toThrow(/wait 10 minutes/);
    await expect(otp.startPhoneVerification("1234567890")).rejects.toThrow(/valid 10-digit Indian/);
  });
});
