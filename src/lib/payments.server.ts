import { RAZORPAY_KEY_ID } from "./payments";

/**
 * Server-only Razorpay helpers. The Key Secret is stored in the `app_secrets` table, which has
 * row-level security on and no policies, so only the server's service-role client can read it.
 * It is never committed to GitHub and never sent to the browser.
 */
export async function getRazorpaySecret(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // app_secrets is not in the generated types (it is deliberately hidden from the browser API).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).from("app_secrets").select("value").eq("name", "razorpay_key_secret").maybeSingle();
  if (error || !data?.value) return null;
  return String(data.value);
}

export async function createRazorpayOrder(secret: string, paise: number, receipt: string, purpose: string): Promise<string> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${secret}`) },
    body: JSON.stringify({ amount: paise, currency: "INR", receipt, notes: { purpose: purpose.slice(0, 250) } }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? "Razorpay could not create the order.");
  return body.id;
}

/** Razorpay's documented check: HMAC-SHA256(order_id + "|" + payment_id, key_secret) must equal the signature. */
export async function signatureMatches(secret: string, orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${orderId}|${paymentId}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
