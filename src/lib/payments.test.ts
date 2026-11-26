import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signatureMatches } from "./payments.server";
import { RAZORPAY_KEY_ID, toPaise } from "./payments";

describe("Razorpay payments", () => {
  const secret = "test_secret_value";
  const sig = createHmac("sha256", secret).update("order_ABC123|pay_XYZ789").digest("hex");
  it("accepts Razorpay's signature for the same order and payment", async () => {
    expect(await signatureMatches(secret, "order_ABC123", "pay_XYZ789", sig)).toBe(true);
  });
  it("rejects a signature for a different payment, order or secret", async () => {
    expect(await signatureMatches(secret, "order_ABC123", "pay_OTHER", sig)).toBe(false);
    expect(await signatureMatches(secret, "order_OTHER", "pay_XYZ789", sig)).toBe(false);
    expect(await signatureMatches("wrong", "order_ABC123", "pay_XYZ789", sig)).toBe(false);
  });
  it("uses a public test key and converts rupees to paise", () => {
    expect(RAZORPAY_KEY_ID.startsWith("rzp_test_")).toBe(true);
    expect(toPaise(170.5)).toBe(17050);
  });
});
