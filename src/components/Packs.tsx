import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Plus, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UpiCheckout } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { hasActiveSubscription } from "@/lib/care";
import { MAX_PACKS, packProblem, perSession, saving, subscriptionCoach, type Pack } from "@/lib/packs";
import type { Coach } from "@/lib/seed";

/** Coach dashboard: up to 5 monthly packs. */
export function CoachPacks({ coach }: { coach: Coach }) {
  const { saveCoachPacks } = useStore();
  const [packs, setPacks] = useState<Pack[]>(coach.packs ?? []);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Pack>) => setPacks(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const problem = packs.map(packProblem).find(Boolean) ?? null;
  const save = async () => {
    setBusy(true);
    const err = await saveCoachPacks(packs);
    setBusy(false);
    if (err) toast.error(err); else toast.success(packs.length ? "Packs saved — customers can buy them now." : "Packs removed.");
  };
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Monthly packs</h2>
      <p className="text-sm text-muted-foreground">Offer a number of sessions at your own price. Customers pay once; packs don’t renew automatically (they get a reminder 3 days before expiry). Your single-session price is ₹{coach.price}.</p>
      <ul className="mt-3 space-y-3">
        {packs.map((p, i) => (
          <li key={i} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-semibold">Name<input className="field mt-1" maxLength={60} value={p.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. 8 sessions · monthly" /></label>
            <label className="text-sm font-semibold">Sessions<input className="field mt-1" inputMode="numeric" value={p.sessions || ""} onChange={(e) => set(i, { sessions: num(e.target.value) })} /></label>
            <label className="text-sm font-semibold">Valid (days)<input className="field mt-1" inputMode="numeric" value={p.days || ""} onChange={(e) => set(i, { days: num(e.target.value) })} /></label>
            <label className="text-sm font-semibold">Price (₹)<input className="field mt-1" inputMode="numeric" value={p.price || ""} onChange={(e) => set(i, { price: num(e.target.value) })} /></label>
            <Button variant="care" size="care" className="btn btn-outline" aria-label="Remove pack" onClick={() => setPacks(packs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            {p.sessions > 0 && p.price > 0 && <p className="text-xs text-muted-foreground sm:col-span-5">₹{perSession(p)} per session{saving(p, coach.price) ? ` · customers save ₹${saving(p, coach.price)} vs single sessions` : ""}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="care" size="care" className="btn btn-outline" disabled={packs.length >= MAX_PACKS} onClick={() => setPacks([...packs, { id: "", title: "", sessions: 8, days: 30, price: Math.round(coach.price * 8 * 0.85) }])}><Plus className="h-4 w-4" />Add pack</Button>
        <div className="flex items-center gap-3">
          {problem && <span className="text-sm text-muted-foreground">{problem}</span>}
          <Button variant="care" size="care" className="btn btn-primary" disabled={!!problem || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save packs"}</Button>
        </div>
      </div>
    </section>
  );
}

/** Coach profile: packs for sale, bought with Razorpay. */
export function PacksForSale({ coach }: { coach: Coach }) {
  const { me, senior, buyPack } = useStore();
  const [pack, setPack] = useState<Pack | null>(null);
  if (!coach.packs?.length) return null;
  const canBuy = (me?.role === "senior" || me?.role === "family") && !!senior?.consent?.given;
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Monthly packs</h2>
      <p className="text-sm text-muted-foreground">Pay once, book sessions with credits. No automatic renewal — you’ll get a reminder before it ends. Cancelling a session at least 2 hours ahead returns its credit.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {coach.packs.map((p) => (
          <li key={p.id} className="flex flex-col gap-1 rounded-xl border p-4">
            <p className="flex items-center gap-2 font-bold"><Ticket className="h-4 w-4 text-primary" />{p.title}</p>
            <p className="font-display text-2xl font-bold">₹{p.price.toLocaleString("en-IN")}</p>
            <p className="text-sm">{p.sessions} sessions · valid {p.days} days · ₹{perSession(p)}/session</p>
            {saving(p, coach.price) > 0 && <p className="text-sm font-semibold text-success">Save ₹{saving(p, coach.price).toLocaleString("en-IN")}</p>}
            {canBuy && <Button variant="care" size="care" className="btn btn-accent mt-2" onClick={() => setPack(p)}>Buy for {senior!.name.split(" ")[0]}</Button>}
          </li>
        ))}
      </ul>
      {pack && (
        <UpiCheckout open amount={pack.price} title={`${coach.name} · ${pack.title}`} onClose={() => setPack(null)} onDone={() => setPack(null)}
          onPaid={async (ref, proof) => { await buyPack(coach.id, pack.id, ref, proof); }} />
      )}
    </section>
  );
}

/** Fitness page: the senior's packs, credits left, expiry and renew links. */
export function MyPacks() {
  const { db, senior, cancelSubscription } = useStore();
  if (!senior) return null;
  const mine = db.care.subscriptions.filter((s) => s.seniorId === senior.id && hasActiveSubscription(s));
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Session packs</h2>
      {!mine.length ? <p className="text-muted-foreground">No active pack. Coaches list their monthly packs on their profile page — open a coach’s profile to buy one.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {mine.map((s) => {
            const coachId = subscriptionCoach(s, db.care.plans);
            const coach = db.coaches.find((c) => c.id === coachId);
            const daysLeft = Math.ceil((new Date(s.ends).getTime() - Date.now()) / 86400000);
            return (
              <li key={s.id} className="surface space-y-1 p-4">
                <p className="font-bold">{s.title ?? "Exercise pack"} <span className="font-normal text-muted-foreground">· {coach?.name ?? "Coach"}</span></p>
                <p className="text-2xl font-bold">{s.remaining} <span className="text-base font-normal text-muted-foreground">of {s.sessions ?? 8} sessions left</span></p>
                <p className={`flex items-center gap-1 text-sm ${daysLeft <= 3 ? "font-semibold text-amber-700" : "text-muted-foreground"}`}><CalendarClock className="h-4 w-4" />Ends {new Date(s.ends).toLocaleDateString("en-IN")} ({daysLeft} day{daysLeft === 1 ? "" : "s"})</p>
                {s.verified === false && <p className="text-xs text-muted-foreground">Payment not server-verified (test setup).</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {coach && <Link to="/coach/$id" params={{ id: coach.id }} className="btn btn-outline">Renew / view packs</Link>}
                  <Button variant="care" size="care" className="btn btn-outline text-destructive" onClick={() => { cancelSubscription(s.id); toast("Pack cancelled. Unused credits end; booked sessions stay."); }}>Cancel pack</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
