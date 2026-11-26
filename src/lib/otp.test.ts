import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets: { name: string; value: string }[] = [];
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ or: async () => ({ data: secrets }) }) }) },
}));

const load = async () => { vi.resetModules(); return import("./otp.server"); };
const KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_VERIFY_SERVICE_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_AUTH_TOKEN", "MESSAGECENTRAL_CUSTOMER_ID", "MESSAGECENTRAL_PASSWORD", "MESSAGECENTRAL_EMAIL"];

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
    expect((await otp.startPhoneVerification("9876500002")).mode).toBe("demo");
    expect(await otp.checkPhoneCode("9876500002", "123456")).toBe(true);
    expect(await otp.checkPhoneCode("9876500002", "111111")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("sends through Twilio Verify with the API key from environment secrets", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_VERIFY_SERVICE_SID: "VA456", TWILIO_API_KEY_SID: "SK789", TWILIO_API_KEY_SECRET: "s3cret" });
    const otp = await load();
    expect((await otp.startPhoneVerification("9876500002")).mode).toBe("sms");
    expect(calls[0].url).toBe("https://verify.twilio.com/v2/Services/VA456/Verifications");
    expect(String(calls[0].init.body)).toBe("To=%2B919876500002&Channel=sms&Locale=en");
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe("Basic " + btoa("SK789:s3cret"));
  });

  it("reads the details from the locked app_secrets table too", async () => {
    secrets.push({ name: "twilio_account_sid", value: "AC1" }, { name: "twilio_verify_service_sid", value: "VA2" }, { name: "twilio_auth_token", value: "tok" });
    const otp = await load();
    expect((await otp.startPhoneVerification("9876500002")).mode).toBe("sms");
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
    expect((await otp.startPhoneVerification("9876543210")).mode).toBe("demo");
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

describe("SMS codes via Message Central VerifyNow", () => {
  type R = { status: number; body: unknown };
  let calls: string[] = [];
  let queue: R[] = [];
  beforeEach(() => {
    calls = []; queue = []; secrets.length = 0; KEYS.forEach((k) => delete process.env[k]);
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "server-only-key";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url} ${(init?.headers as Record<string, string> | undefined)?.["authToken"] ?? ""}`.trim());
      const r = queue.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("logs in, sends a 6-digit code on Message Central's template and returns a signed reference", async () => {
    secrets.push({ name: "messagecentral_customer_id", value: "C-ABC123" }, { name: "messagecentral_password", value: "pa55" }, { name: "messagecentral_email", value: "me@x.in" });
    const otp = await load();
    queue = [{ status: 200, body: { status: 200, token: "TOK1" } }, { status: 200, body: { responseCode: 200, data: { verificationId: "2949", responseCode: "200", timeout: "60" } } }];
    const r = await otp.startPhoneVerification("9876500002");
    expect(r.mode).toBe("sms");
    expect(r.resendAfter).toBe(60);
    expect(calls[0]).toContain("/auth/v1/authentication/token?customerId=C-ABC123&key=" + encodeURIComponent(btoa("pa55")));
    expect(calls[0]).toContain("email=me%40x.in");
    expect(calls[1]).toMatch(/^POST https:\/\/cpaas\.messagecentral\.com\/verification\/v3\/send\?countryCode=91&customerId=C-ABC123&flowType=SMS&mobileNumber=9876500002&otpLength=6 TOK1$/);
    expect(r.ref).toMatch(/^2949\.\d+\.[a-f0-9]{64}$/);

    // correct code
    queue = [{ status: 200, body: { responseCode: 200, data: { verificationStatus: "VERIFICATION_COMPLETED", responseCode: "200" } } }];
    expect(await otp.checkPhoneCode("9876500002", "482913", r.ref)).toBe(true);
    expect(calls[2]).toContain("/verification/v3/validateOtp?countryCode=91&mobileNumber=9876500002&verificationId=2949&customerId=C-ABC123&code=482913");
    // wrong code
    queue = [{ status: 200, body: { responseCode: 702, data: { responseCode: "702" } } }];
    expect(await otp.checkPhoneCode("9876500002", "000000", r.ref)).toBe(false);
    // expired / limit reached give a clear message
    queue = [{ status: 200, body: { responseCode: 800 } }];
    await expect(otp.checkPhoneCode("9876500002", "000000", r.ref)).rejects.toThrow(/Too many attempts/);
  });

  it("rejects a reference that was altered or belongs to another number", async () => {
    secrets.push({ name: "messagecentral_customer_id", value: "C-1" }, { name: "messagecentral_password", value: "p" });
    const otp = await load();
    const ref = await otp.makeRef("9876500002", "2949");
    expect(await otp.readRef("9876500002", ref)).toBe("2949");
    expect(await otp.readRef("9876500003", ref)).toBeNull();
    expect(await otp.readRef("9876500002", ref.replace("2949.", "9999."))).toBeNull();
    expect(await otp.readRef("9876500002", await otp.makeRef("9876500002", "1", -1000))).toBeNull(); // expired
    await expect(otp.checkPhoneCode("9876500002", "123456", "nonsense")).rejects.toThrow(/request a new code/);
    expect(calls.filter((c) => c.includes("validateOtp"))).toHaveLength(0);
  });

  it("explains a too-soon resend in plain words", async () => {
    process.env["MESSAGECENTRAL_CUSTOMER_ID"] = "C-1"; process.env["MESSAGECENTRAL_PASSWORD"] = "p";
    const otp = await load();
    queue = [{ status: 200, body: { token: "T" } }, { status: 200, body: { responseCode: 506 } }];
    await expect(otp.startPhoneVerification("9876500002")).rejects.toThrow(/wait a minute/);
  });

  it("prefers Message Central over Twilio when both are set up", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_VERIFY_SERVICE_SID: "VA2", TWILIO_AUTH_TOKEN: "tok", MESSAGECENTRAL_CUSTOMER_ID: "C-1", MESSAGECENTRAL_PASSWORD: "p" });
    const otp = await load();
    expect((await otp.smsProvider())?.kind).toBe("messagecentral");
  });
});
