import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Award, BadgeCheck, Clock, HandHeart, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageTitle, Shell, UpiCheckout } from "@/components/Shell";
import { PartnerAvatar } from "@/components/PartnerAvatar";
import { ServiceArea } from "@/components/ServiceArea";
import { CheckField } from "@/components/CheckField";
import { useStore } from "@/lib/store";
import { partnersFor } from "@/lib/partners";
import { ratingOf } from "@/lib/reviews";
import { isSlotAvailable, sessionDate } from "@/lib/booking-rules";
import { cheapestService, needsDoctorApproval } from "@/lib/therapy";
import type { Therapist, TherapyService } from "@/lib/seed";

export const Route = createFileRoute("/therapy")({
  head: () => ({
    meta: [
      { title: "Therapy Massage at Home for Seniors | WellNest" },
      { name: "description", content: "Book verified, certified massage therapists for gentle home visits." },
      { property: "og:title", content: "Therapy Massage at Home | WellNest" },
      { property: "og:description", content: "Verified massage therapists for seniors, at home." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Therapy /></Shell>,
});

type Sel = { t: Therapist; service: TherapyService; day: number; slot: string };

function Therapy() {
  const { db, senior, createBooking } = useStore();
  const nav = useNavigate();
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [sel, setSel] = useState<Sel | null>(null);
  const [doctorOk, setDoctorOk] = useState(false);
  const [pay, setPay] = useState(false);
  const needsOk = needsDoctorApproval(senior?.health);
  const free = (t: Therapist, day: number, slot: string) => isSlotAvailable(day, slot, t.id, db.bookings, new Date(), "therapy");
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const list = partnersFor(db.therapists, "therapist", senior?.pincode).filter((t) => gender === "all" || t.gender === gender);

  const choose = (t: Therapist) => {
    const day = days.findIndex((_, i) => t.slots.some((s) => free(t, i, s)));
    const slot = day < 0 ? undefined : t.slots.find((s) => free(t, day, s));
    if (day < 0 || !slot) return toast.error("No free slots this week.");
    setDoctorOk(false);
    setSel({ t, service: t.services[0], day, slot });
  };
  const available = !!sel && free(sel.t, sel.day, sel.slot);
  const blocked = needsOk && !doctorOk;
  const book = (paymentRef: string) => {
    if (!sel || !available) throw new Error("This slot is no longer available.");
    createBooking({
      type: "therapy", title: `${sel.service.name} · Home visit`, partnerId: sel.t.id, partnerName: sel.t.name, amount: sel.service.price,
      when: sessionDate(sel.day, sel.slot).toISOString(), detail: `${sel.service.minutes} min`, serviceId: sel.service.id,
      ...(needsOk ? { doctorApproved: true } : {}), upiRef: paymentRef,
    });
    toast.success("Therapy booked! Family members have been alerted.");
  };

  return (
    <>
      <PageTitle title="Therapy Massage" sub="Certified therapists, verified by WellNest, visiting at home." />
      <ServiceArea what="massage therapists" />
      {needsOk && (
        <p className="surface mb-4 flex items-start gap-2 border-amber-300 bg-amber-50 p-4 text-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          {senior?.name ?? "This senior"}’s health profile lists a heart condition, high blood pressure or limited mobility. Please check with their doctor before booking a massage — you’ll be asked to confirm this.</p>
      )}
      <div className="surface flex flex-wrap items-center gap-2 p-4">
        <span className="w-24 font-bold">Therapist</span>
        {([["all", "Any"], ["female", "Female"], ["male", "Male"]] as const).map(([v, l]) => <Button key={v} variant="care" size="care" className="chip" aria-pressed={gender === v} onClick={() => setGender(v)}>{l}</Button>)}
      </div>

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {list.map((t) => {
          const r = ratingOf(t, db.bookings, "therapy", t.id, t.rating);
          return (
            <li key={t.id} className="surface p-5">
              <div className="flex items-start gap-3">
                <PartnerAvatar kind="therapist" id={t.id} name={t.name} size={64} />
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">{t.name}<BadgeCheck className="h-6 w-6 text-success" aria-label="Verified" />{t.certifications?.length ? <span className="tag text-primary"><Award className="mr-1 h-3.5 w-3.5" />Certified</span> : null}</h2>
                  <p className="text-muted-foreground">{t.years} yrs experience{t.gender ? ` · ${t.gender === "female" ? "Female" : "Male"} therapist` : ""} · <Star className="inline h-4 w-4 fill-warn text-warn" /> {r.avg ? r.avg.toFixed(1) : "New"}{r.count ? ` · ${r.count} verified review${r.count === 1 ? "" : "s"}` : ""}</p>
                </div>
                <p className="font-display text-base font-semibold">from ₹{cheapestService(t)}</p>
              </div>
              {t.bio && <p className="mt-2 text-base">{t.bio}</p>}
              <ul className="mt-3 space-y-1 text-sm">{t.services.map((s) => <li key={s.id} className="flex justify-between gap-2"><span>{s.name} <span className="text-muted-foreground">· {s.minutes} min</span></span><span className="font-semibold">₹{s.price}</span></li>)}</ul>
              <Button variant="care" size="care" className="btn btn-primary mt-4 w-full" onClick={() => choose(t)}>Choose a slot</Button>
            </li>
          );
        })}
        {list.length === 0 && <p className="surface p-5 text-base">{senior?.pincode ? `No verified therapist visits ${senior.pincode} yet.` : "Add the senior’s pincode to see therapists nearby."} {gender !== "all" && "Try “Any”."}</p>}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">Looking for exercise instead? <Link to="/fitness" className="font-semibold text-primary underline">Browse fitness coaches</Link>.</p>

      {sel && !pay && (
        <Dialog open onOpenChange={(open) => { if (!open) setSel(null); }}>
          <DialogContent>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold"><HandHeart className="h-5 w-5 text-primary" />Book with {sel.t.name}</DialogTitle>
            <DialogDescription>Home visit at {senior?.name ?? "the senior"}’s address. Times are in your local time zone.</DialogDescription>
            <p className="mb-2 mt-4 font-bold">Service</p>
            <div className="flex flex-wrap gap-2">{sel.t.services.map((s) => <Button key={s.id} variant="care" size="care" className="chip" aria-pressed={sel.service.id === s.id} onClick={() => setSel({ ...sel, service: s })}>{s.name} · ₹{s.price}</Button>)}</div>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" />{sel.service.minutes} minutes</p>
            <p className="mb-2 mt-4 font-bold">Day</p>
            <div className="flex flex-wrap gap-2">{days.map((d, i) => <Button key={i} variant="care" size="care" className="chip" aria-pressed={sel.day === i} disabled={!sel.t.slots.some((s) => free(sel.t, i, s))} onClick={() => setSel({ ...sel, day: i, slot: sel.t.slots.find((s) => free(sel.t, i, s)) ?? sel.slot })}>{i === 0 ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</Button>)}</div>
            <p className="mb-2 mt-4 font-bold">Time</p>
            <div className="flex flex-wrap gap-2">{sel.t.slots.map((s) => <Button key={s} variant="care" size="care" className="chip" disabled={!free(sel.t, sel.day, s)} aria-pressed={sel.slot === s} onClick={() => setSel({ ...sel, slot: s })}>{s}</Button>)}</div>
            {needsOk && <CheckField className="mt-4" checked={doctorOk} onChange={setDoctorOk}>I confirm {senior?.name ?? "the senior"}’s doctor has approved gentle massage.</CheckField>}
            <div className="mt-6 flex gap-3">
              <Button variant="care" size="care" className="btn btn-outline flex-1" onClick={() => setSel(null)}>Cancel</Button>
              <Button variant="care" size="care" className="btn btn-accent flex-1" disabled={!available || blocked} onClick={() => setPay(true)}>Pay ₹{sel.service.price}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <UpiCheckout open={pay} amount={sel?.service.price ?? 0} title={sel ? `${sel.service.name} with ${sel.t.name}` : ""}
        onClose={() => setPay(false)}
        onPaid={(paymentRef) => { book(paymentRef); }}
        onDone={() => { setPay(false); setSel(null); nav({ to: "/activity" }); }} />
    </>
  );
}
