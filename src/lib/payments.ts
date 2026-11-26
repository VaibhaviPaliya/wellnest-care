/**
 * Razorpay checkout (test mode) — browser side.
 * The Key ID is public by design (Razorpay sends it to every browser), so it lives in code.
 * The Key Secret never does: the server reads it from the locked `app_secrets` table (see payments.server.ts).
 */
export const RAZORPAY_KEY_ID = "rzp_test_U1jiZUH20jnd4t";
export const RAZORPAY_TEST_MODE = RAZORPAY_KEY_ID.startsWith("rzp_test_");
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpaySuccess { razorpay_payment_id: string; razorpay_order_id?: string; razorpay_signature?: string; }
export interface RazorpayFailure { error?: { description?: string; reason?: string } }
export interface RazorpayOptions {
  key: string; amount: number; currency: "INR"; name: string; description: string; order_id?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void; confirm_close?: boolean };
}
interface RazorpayInstance { open: () => void; on: (event: "payment.failed", cb: (r: RazorpayFailure) => void) => void; }
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance } }

let loading: Promise<void> | null = null;
/** Loads Razorpay's checkout script once. */
export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Payments run in the browser only."));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve() : reject(new Error("Razorpay did not load.")));
    s.onerror = () => { loading = null; reject(new Error("Could not reach Razorpay. Check your internet connection.")); };
    document.body.appendChild(s);
  });
  return loading;
}

/** Rupees → paise, the unit Razorpay expects. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
