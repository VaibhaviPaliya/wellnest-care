import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Buys a coach's monthly pack for a senior after checking the Razorpay payment on the server:
 * the payment must be for this order, authorised or captured, and for exactly the pack's price.
 * Each payment can be used once. Only then are the session credits added (customers cannot add them).
 * Without a Razorpay secret (test fallback), the purchase is recorded as unverified.
 */
export const purchasePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { coachId: string; packId: string; seniorId: string; paymentId: string; orderId?: string; signature?: string }) => {
    const s = (v: unknown, re: RegExp, msg: string) => { const x = String(v ?? ""); if (!re.test(x)) throw new Error(msg); return x; };
    return {
      coachId: s(i?.coachId, /^[A-Za-z0-9_-]{1,64}$/, "Unknown coach."),
      packId: s(i?.packId, /^pk-[a-z0-9]{6,40}$/, "Unknown pack."),
      seniorId: s(i?.seniorId, /^[0-9a-f-]{36}$/i, "Unknown senior."),
      paymentId: s(i?.paymentId, /^pay_[A-Za-z0-9]+$/, "Payment reference missing."),
      orderId: i?.orderId ? s(i.orderId, /^order_[A-Za-z0-9]+$/, "Bad order reference.") : undefined,
      signature: i?.signature ? s(i.signature, /^[a-f0-9]{64}$/, "Bad payment signature.") : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: can } = await context.supabase.rpc("can_manage_senior", { _senior: data.seniorId });
    if (!can) throw new Error("You can buy packs only for yourself or a senior you're linked to.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("catalog").select("data").eq("kind", "coach").eq("id", data.coachId).maybeSingle();
    const coach = row?.data as { name?: string; verified?: boolean; packs?: { id: string; title: string; sessions: number; days: number; price: number }[] } | undefined;
    const pack = coach?.verified ? coach.packs?.find((p) => p.id === data.packId) : undefined;
    if (!coach || !pack) throw new Error("This pack is no longer available.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: used } = await admin.from("care_items").select("id").eq("kind", "subscription").eq("data->>paymentRef", data.paymentId).limit(1);
    if (used?.length) throw new Error("This payment has already been used.");

    const { getRazorpaySecret, signatureMatches } = await import("./payments.server");
    const { RAZORPAY_KEY_ID } = await import("./payments");
    const secret = await getRazorpaySecret();
    let verified = false;
    if (secret) {
      if (!data.orderId || !data.signature || !(await signatureMatches(secret, data.orderId, data.paymentId, data.signature))) throw new Error("Payment could not be verified.");
      const res = await fetch(`https://api.razorpay.com/v1/payments/${data.paymentId}`, { headers: { Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${secret}`) }, signal: AbortSignal.timeout(10_000) });
      const pay = (await res.json().catch(() => ({}))) as { status?: string; amount?: number; order_id?: string };
      if (!res.ok || !["authorized", "captured"].includes(pay.status ?? "") || pay.order_id !== data.orderId || pay.amount !== pack.price * 100)
        throw new Error("The payment doesn't match this pack's price. Please contact support with your payment reference.");
      verified = true;
    }

    const now = new Date();
    const id = `sub-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const sub = { id, seniorId: data.seniorId, planId: "", coachId: data.coachId, packId: pack.id, title: pack.title, sessions: pack.sessions, remaining: pack.sessions,
      price: pack.price, starts: now.toISOString(), ends: new Date(now.getTime() + pack.days * 86400000).toISOString(), cancelled: false, paymentRef: data.paymentId, verified };
    const { error } = await admin.from("care_items").insert({ id, kind: "subscription", senior_id: data.seniorId, data: sub });
    if (error) throw new Error("Payment received, but the pack couldn't be saved. Please contact support with your payment reference.");

    // Alert the senior and every linked family member.
    const { data: links } = await admin.from("family_links").select("family_id").eq("senior_id", data.seniorId);
    const targets = [data.seniorId, ...((links ?? []) as { family_id: string }[]).map((l) => l.family_id)];
    const body = `${pack.sessions} sessions with ${coach.name} · valid until ${new Date(sub.ends).toLocaleDateString("en-IN")} · ₹${pack.price} paid · no automatic renewal`;
    await admin.from("notices").insert(targets.map((user_id) => ({ id: `n-${crypto.randomUUID().replace(/-/g, "")}`, user_id, senior_id: data.seniorId, data: { title: `Pack bought: ${pack.title}`, body, at: now.toISOString(), read: false } })));
    return { id, verified };
  });
