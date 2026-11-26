import { createServerFn } from "@tanstack/react-start";

/**
 * Creates a Razorpay order for a booking or order. When the Key Secret has not been stored yet,
 * returns `orderId: null` and the browser falls back to plain checkout (payment taken, not verified).
 */
export const createPaymentOrder = createServerFn({ method: "POST" })
  .validator((input: { amount: number; purpose: string }) => {
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) throw new Error("Payment amount must be between ₹1 and ₹1,00,000.");
    return { amount, purpose: String(input?.purpose ?? "WellNest payment").slice(0, 250) };
  })
  .handler(async ({ data }) => {
    const { getRazorpaySecret, createRazorpayOrder } = await import("./payments.server");
    const { toPaise } = await import("./payments");
    const secret = await getRazorpaySecret();
    if (!secret) return { orderId: null as string | null };
    const receipt = `wn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return { orderId: await createRazorpayOrder(secret, toPaise(data.amount), receipt, data.purpose) };
  });

/** Confirms a payment really came from Razorpay for this order before the booking is saved. */
export const verifyPayment = createServerFn({ method: "POST" })
  .validator((input: { orderId: string; paymentId: string; signature: string }) => {
    const ok = (v: unknown, p: RegExp) => typeof v === "string" && p.test(v);
    if (!ok(input?.orderId, /^order_[A-Za-z0-9]+$/) || !ok(input?.paymentId, /^pay_[A-Za-z0-9]+$/) || !ok(input?.signature, /^[a-f0-9]{64}$/))
      throw new Error("Payment details are incomplete.");
    return input;
  })
  .handler(async ({ data }) => {
    const { getRazorpaySecret, signatureMatches } = await import("./payments.server");
    const secret = await getRazorpaySecret();
    if (!secret) throw new Error("Payments are not fully set up yet.");
    return { ok: await signatureMatches(secret, data.orderId, data.paymentId, data.signature) };
  });
