import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Star, Dumbbell, Soup, Pill } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { useStore } from "@/lib/store";
import type { Booking, Status } from "@/lib/seed";
import { FLOW, canCancel } from "@/lib/booking-rules";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Bookings & Orders | WellNest" },
      { name: "description", content: "Track fitness sessions, meal orders and medicine deliveries, and leave reviews." },
      { property: "og:title", content: "Bookings & Orders | WellNest" },
      { property: "og:description", content: "Track and review your WellNest services." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Activity /></Shell>,
});

const ICON = { fitness: Dumbbell, meal: Soup, medicine: Pill };

function Activity() {
  const { db, senior } = useStore();
  const [tab, setTab] = useState<"active" | "past">("active");
  if (!senior) return null;
  const all = db.bookings.filter((b) => b.seniorId === senior.id);
  const list = all.filter((b) => (tab === "active" ? !["completed", "cancelled"].includes(b.status) : ["completed", "cancelled"].includes(b.status)));
  return (
    <>
      <PageTitle title="Bookings & Orders" sub={`For ${senior.name}`} />
      <div className="mb-5 flex gap-2">
        <button className="chip" aria-pressed={tab === "active"} onClick={() => setTab("active")}>Active</button>
        <button className="chip" aria-pressed={tab === "past"} onClick={() => setTab("past")}>Past</button>
      </div>
      <ul className="space-y-4">
        {list.map((b) => <BookingCard key={b.id} b={b} />)}
        {list.length === 0 && <p className="surface p-6 text-lg text-muted-foreground">Nothing here yet.</p>}
      </ul>
    </>
  );
}

function BookingCard({ b }: { b: Booking }) {
  const { setStatus, review, db, me } = useStore();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const steps = FLOW[b.type];
  const idx = steps.indexOf(b.status);
  const Icon = ICON[b.type];
  const by = db.users.find((u) => u.id === b.bookedBy);
  return (
    <li className="surface p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="h-9 w-9 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-xl font-bold">{b.title}</h2>
          <p className="text-muted-foreground">{b.partnerName} · {fmtWhen(b.when)}</p>
          <p className="text-muted-foreground">₹{b.amount} paid · {b.upiRef} · booked by {by?.id === me?.id ? "you" : by?.name}</p>
          {b.items?.length ? <p className="mt-1">{b.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p> : <p className="mt-1">{b.detail}</p>}
        </div>
        <span className="tag">{STATUS_LABEL[b.status]}</span>
      </div>
      {b.videoUrl && b.status !== "cancelled" && <a href={b.videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-4">Join online class</a>}
      {b.prescriptionData && <a href={b.prescriptionData} download={b.prescription} className="mt-3 inline-block text-primary underline">View prescription: {b.prescription}</a>}

      {b.status !== "cancelled" && (
        <ol className="mt-4 flex items-center gap-1" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center text-sm">
              <span className={`h-2.5 w-full rounded-full ${i <= idx ? "bg-success" : "bg-muted"}`} />
              <span className={i <= idx ? "font-bold" : "text-muted-foreground"}>{STATUS_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}

      {idx >= 0 && idx < steps.length - 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-outline min-h-11 text-base" onClick={() => setStatus(b.id, steps[idx + 1])}>Simulate next update →</button>
          {canCancel(b) && <button className="btn btn-outline min-h-11 text-base text-destructive" onClick={() => { setStatus(b.id, "cancelled"); toast("Cancelled. Demo refund recorded; no real money was charged."); }}>Cancel</button>}
        </div>
      )}
      {idx >= 0 && idx < steps.length - 1 && !canCancel(b) && <p className="mt-2 text-sm text-muted-foreground">Cancellation closes 2 hours before the scheduled time.</p>}

      {b.status === "completed" && (b.review ? (
        <p className="mt-4 rounded-xl bg-muted p-3"><span className="text-warn">{"★".repeat(b.review.rating)}</span> {b.review.text || "Rated"}</p>
      ) : (
        <div className="mt-4 rounded-xl bg-muted p-4">
          <p className="font-bold">How was it? (optional)</p>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={`h-9 w-9 ${n <= rating ? "fill-warn text-warn" : "text-muted-foreground"}`} /></button>
            ))}
          </div>
          <textarea className="field mt-2" rows={2} placeholder="Write a few words (optional)" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary mt-2" disabled={!rating} onClick={() => { review(b.id, rating, text); toast.success("Thank you for your review!"); }}>Submit review</button>
        </div>
      ))}
    </li>
  );
}
