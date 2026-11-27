import { useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { SUB_SCORES, isDetailed, overallOf, type ReviewInput, type SubScore } from "@/lib/reviews";
import type { Booking } from "@/lib/seed";

function Stars({ value, onChange, label, size = "h-8 w-8" }: { value: number; onChange: (n: number) => void; label: string; size?: string }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)} className="rounded p-0.5">
          <Star className={`${size} ${n <= value ? "fill-warn text-warn" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

/** Review for a completed booking. Coach and therapy sessions get three scores; the overall is their average. */
export function ReviewForm({ b }: { b: Booking }) {
  const { review } = useStore();
  const detailed = isDetailed(b.type);
  const [r, setR] = useState<ReviewInput>({ rating: 0, text: "" });
  if (b.review) return (
    <div className="mt-4 rounded-xl bg-muted p-3">
      <p className="flex items-center gap-2"><span className="text-warn">{"★".repeat(b.review.rating)}</span><span className="text-sm font-semibold"><BadgeCheck className="inline h-4 w-4 text-success" /> Verified review</span></p>
      {detailed && b.review.punctuality && <p className="text-sm text-muted-foreground">{SUB_SCORES.map((s) => `${s.label} ${b.review?.[s.key]}/5`).join(" · ")}</p>}
      {b.review.text && <p className="mt-1">{b.review.text}</p>}
    </div>
  );
  const sub = (k: SubScore, n: number) => setR((x) => { const next = { ...x, [k]: n }; return { ...next, rating: SUB_SCORES.every((s) => next[s.key]) ? overallOf(next) : 0 }; });
  const submit = () => {
    const err = review(b.id, r);
    if (err) toast.error(err); else toast.success("Thank you — your review helps other families.");
  };
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-muted p-4">
      <p className="font-bold">How was it?</p>
      {detailed ? SUB_SCORES.map((s) => (
        <div key={s.key} className="flex flex-wrap items-center justify-between gap-2">
          <span><strong className="block">{s.label}</strong><span className="text-sm text-muted-foreground">{s.hint}</span></span>
          <Stars value={r[s.key] ?? 0} onChange={(n) => sub(s.key, n)} label={s.label} size="h-7 w-7" />
        </div>
      )) : <Stars value={r.rating} onChange={(n) => setR({ ...r, rating: n })} label="Overall rating" />}
      {detailed && r.rating > 0 && <p className="text-sm">Overall: <strong>{r.rating} / 5</strong></p>}
      <textarea className="field" rows={2} maxLength={500} placeholder="Write a few words (optional)" value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} />
      <Button variant="care" size="care" className="btn btn-primary" disabled={!r.rating} onClick={submit}>Submit review</Button>
      <p className="text-xs text-muted-foreground">Only people who completed a booking can review, once per booking.</p>
    </div>
  );
}
