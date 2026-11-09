import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Home, Monitor, Star } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, UpiCheckout } from "@/components/Shell";
import { useStore } from "@/lib/store";
import type { Coach } from "@/lib/seed";
import { isSlotAvailable, sessionDate } from "@/lib/booking-rules";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/fitness")({
  head: () => ({
    meta: [
      { title: "Fitness Coaches for Seniors | WellNest" },
      { name: "description", content: "Book verified yoga, mobility and meditation coaches for home visits or live online classes." },
      { property: "og:title", content: "Fitness Coaches for Seniors | WellNest" },
      { property: "og:description", content: "Verified coaches for gentle yoga, mobility and meditation." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Fitness /></Shell>,
});

type T = "all" | "yoga" | "mobility" | "meditation";

function Fitness() {
  const { db, senior, createBooking } = useStore();
  const nav = useNavigate();
  const [type, setType] = useState<T>("all");
  const [mode, setMode] = useState<"all" | "home" | "online">("all");
  const [level, setLevel] = useState<"all" | "gentle" | "moderate">(senior?.health?.mobility === "independent" ? "all" : "gentle");
  const [sel, setSel] = useState<{ coach: Coach; slot: string; day: number; mode: "home" | "online"; kind: string } | null>(null);
  const [pay, setPay] = useState(false);

  const list = db.coaches.filter((c) => c.verified && (type === "all" || c.types.includes(type)) && (mode === "all" || c.mode.includes(mode)) && (level === "all" || c.level === level));
  const days = [0, 1, 2, 3].map((i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });

  const choose = (coach: Coach) => {
    const day = days.findIndex((_, i) => coach.slots.some((slot) => isSlotAvailable(i, slot, coach.id, db.bookings)));
    const slot = coach.slots.find((slot) => isSlotAvailable(day, slot, coach.id, db.bookings));
    if (day < 0 || !slot) return toast.error("No available slots in the next four days.");
    const sessionMode = mode !== "all" && coach.mode.includes(mode) ? mode : coach.mode[0];
    setSel({ coach, day, slot, mode: sessionMode, kind: type !== "all" && coach.types.includes(type) ? type : coach.types[0] });
  };
  const available = !!sel && isSlotAvailable(sel.day, sel.slot, sel.coach.id, db.bookings);

  return (
    <>
      <PageTitle title="Fitness Coaches" sub="Every coach is background-verified and trained for seniors." />
      <div className="surface space-y-3 p-4">
        <Filter label="Type" value={type} set={setType} opts={[["all", "All"], ["yoga", "Yoga"], ["mobility", "Mobility"], ["meditation", "Meditation"]]} />
        <Filter label="Where" value={mode} set={setMode} opts={[["all", "Any"], ["home", "Home visit"], ["online", "Online live"]]} />
        <Filter label="Level" value={level} set={setLevel} opts={[["all", "Any"], ["gentle", "Gentle"], ["moderate", "Moderate"]]} />
      </div>

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {list.map((c) => (
          <li key={c.id} className="surface p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-2xl font-bold">{c.name}<BadgeCheck className="h-6 w-6 text-success" aria-label="Verified" /></h2>
                <p className="text-muted-foreground">{c.years} yrs experience · <Star className="inline h-4 w-4 fill-warn text-warn" /> {c.rating}</p>
              </div>
              <p className="font-display text-2xl font-bold">₹{c.price}</p>
            </div>
            <p className="mt-2 text-lg">{c.bio}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.types.map((t) => <span key={t} className="tag capitalize">{t}</span>)}
              <span className="tag capitalize">{c.level}</span>
              {c.mode.map((m) => <span key={m} className="tag">{m === "home" ? <><Home className="mr-1 h-3.5 w-3.5" />Home</> : <><Monitor className="mr-1 h-3.5 w-3.5" />Online</>}</span>)}
            </div>
            <button className="btn btn-primary mt-4 w-full" onClick={() => choose(c)}>Choose a slot</button>
          </li>
        ))}
        {list.length === 0 && <p className="surface p-6 text-lg">No coaches match. Try “Any”.</p>}
      </ul>

      {sel && !pay && (
        <Dialog open onOpenChange={(open) => { if (!open) setSel(null); }}>
          <DialogContent>
            <DialogTitle className="text-2xl font-bold">Book with {sel.coach.name}</DialogTitle>
            <DialogDescription>Available times in your local time zone.</DialogDescription>
            <p className="mb-2 mt-4 font-bold">Session</p>
            <div className="flex flex-wrap gap-2">{sel.coach.types.map((t) => <button key={t} className="chip capitalize" aria-pressed={sel.kind === t} onClick={() => setSel({ ...sel, kind: t })}>{t}</button>)}</div>
            <p className="mb-2 mt-4 font-bold">How</p>
            <div className="flex flex-wrap gap-2">{sel.coach.mode.map((m) => <button key={m} className="chip" aria-pressed={sel.mode === m} onClick={() => setSel({ ...sel, mode: m })}>{m === "home" ? "Home visit" : "Online live"}</button>)}</div>
            <p className="mb-2 mt-4 font-bold">Day</p>
            <div className="flex flex-wrap gap-2">{days.map((d, i) => <button key={i} className="chip" aria-pressed={sel.day === i} disabled={!sel.coach.slots.some((s) => isSlotAvailable(i, s, sel.coach.id, db.bookings))} onClick={() => setSel({ ...sel, day: i, slot: sel.coach.slots.find((s) => isSlotAvailable(i, s, sel.coach.id, db.bookings)) ?? "" })}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</button>)}</div>
            <p className="mb-2 mt-4 font-bold">Time</p>
            <div className="flex flex-wrap gap-2">{sel.coach.slots.map((s) => <button key={s} className="chip" disabled={!isSlotAvailable(sel.day, s, sel.coach.id, db.bookings)} aria-pressed={sel.slot === s} onClick={() => setSel({ ...sel, slot: s })}>{s}</button>)}</div>
            <div className="mt-6 flex gap-3">
              <button className="btn btn-outline flex-1" onClick={() => setSel(null)}>Cancel</button>
              <button className="btn btn-accent flex-1" disabled={!available} onClick={() => setPay(true)}>Pay ₹{sel.coach.price}</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <UpiCheckout open={pay} amount={sel?.coach.price ?? 0} title={sel ? `${sel.kind} with ${sel.coach.name}` : ""}
        onClose={() => { setPay(false); }}
        onPaid={() => {
          if (!sel || !available) throw new Error("This slot is no longer available. Choose another time.");
          createBooking({ type: "fitness", title: `${sel.kind[0].toUpperCase() + sel.kind.slice(1)} · ${sel.mode === "home" ? "Home visit" : "Online live"}`, partnerId: sel.coach.id, partnerName: sel.coach.name, amount: sel.coach.price, when: sessionDate(sel.day, sel.slot).toISOString(), detail: `${sel.coach.level} level`, videoUrl: sel.mode === "online" ? "https://meet.jit.si/WellNest-" + sel.coach.id + "-" + sessionDate(sel.day, sel.slot).getTime() : undefined });
          toast.success("Session booked! Family members have been alerted.");
        }} onDone={() => { setPay(false); setSel(null); nav({ to: "/activity" }); }} />
    </>
  );
}

function Filter<V extends string>({ label, value, set, opts }: { label: string; value: V; set: (v: V) => void; opts: [V, string][] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 font-bold">{label}</span>
      {opts.map(([v, l]) => <button key={v} className="chip" aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}
    </div>
  );
}
