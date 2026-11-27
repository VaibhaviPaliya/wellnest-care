import { createFileRoute, Link } from "@tanstack/react-router";
import { PacksForSale } from "@/components/Packs";
import { useEffect, useState } from "react";
import { Award, BadgeCheck, Home, Monitor, Star, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageTitle, Shell } from "@/components/Shell";
import { PartnerAvatar } from "@/components/PartnerAvatar";
import { useStore } from "@/lib/store";
import { SUB_SCORES, ratingOf } from "@/lib/reviews";
import { hideReview, partnerReviews, type PublicReview } from "@/lib/partnerApi";

export const Route = createFileRoute("/coach/$id")({
  head: () => ({ meta: [{ title: "Coach profile | WellNest" }, { name: "description", content: "Verified coach profile with certificates and reviews from completed sessions." }] }),
  component: () => <Shell><CoachProfile /></Shell>,
});

function Bar({ label, value }: { label: string; value?: number }) {
  return (
    <div className="grid grid-cols-[150px_1fr_36px] items-center gap-3 text-sm">
      <span>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-warn" style={{ width: `${((value ?? 0) / 5) * 100}%` }} /></span>
      <span className="text-right font-semibold">{value ? value.toFixed(1) : "—"}</span>
    </div>
  );
}

function CoachProfile() {
  const { id } = Route.useParams();
  const { db, me, cloud } = useStore();
  const coach = db.coaches.find((c) => c.id === id);
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const load = () => {
    if (cloud) void partnerReviews(id).then(setReviews).catch(() => setReviews([]));
    else setReviews(db.bookings.filter((b) => b.partnerId === id && b.type === "fitness" && b.status === "completed" && b.review).map((b) => ({ booking_id: b.id, rating: b.review!.rating, punctuality: b.review!.punctuality ?? null, safety: b.review!.safety ?? null, explanation: b.review!.explanation ?? null, text: b.review!.text || null, at: b.review!.at ?? b.when, reviewer: db.users.find((u) => u.id === b.seniorId)?.name.split(" ")[0] ?? "WellNest user", hidden: !!b.review!.hidden })));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id, cloud]);
  if (!coach) return <><PageTitle title="Coach not found" /><p className="surface p-5">This coach isn’t available. <Link to="/fitness" className="text-primary underline">Browse coaches</Link></p></>;
  const summary = ratingOf(coach, db.bookings, "fitness", coach.id, coach.rating);
  const plans = db.care.plans.filter((p) => p.coachId === coach.id && !p.hidden);
  const toggle = async (r: PublicReview) => {
    try { await hideReview(r.booking_id, !r.hidden); toast.success(r.hidden ? "Review shown again." : "Review hidden."); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update."); }
  };
  return (
    <>
      <PageTitle title={coach.name} sub="Fitness coach" />
      <section className="surface flex flex-wrap items-start gap-5 p-5">
        <PartnerAvatar kind="coach" id={coach.id} name={coach.name} size={88} />
        <div className="min-w-0 flex-1 basis-64 space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="flex items-center gap-1 text-success"><BadgeCheck className="h-4 w-4" />Background verified</span>
            {coach.certifications?.length ? <span className="flex items-center gap-1 text-primary"><Award className="h-4 w-4" />Certified</span> : null}</p>
          <p>{coach.bio}</p>
          <p className="text-sm text-muted-foreground">{coach.years} years experience · {coach.level === "moderate" ? "Moderate" : "Gentle"} level · ₹{coach.price} per session</p>
          <div className="flex flex-wrap gap-2">
            {coach.types.map((t) => <span key={t} className="tag capitalize">{t}</span>)}
            {coach.mode.map((m) => <span key={m} className="tag">{m === "home" ? <><Home className="mr-1 h-3.5 w-3.5" />Home visits</> : <><Monitor className="mr-1 h-3.5 w-3.5" />Online</>}</span>)}
          </div>
          {(me?.role === "senior" || me?.role === "family") && <Link to="/fitness" className="btn btn-primary mt-2 inline-flex">Book a session</Link>}
        </div>
      </section>

      <PacksForSale coach={coach} />

      {coach.certifications?.length ? (
        <section className="surface mt-6 p-5">
          <h2 className="text-lg font-bold">Certificates</h2>
          <p className="text-sm text-muted-foreground">Checked by WellNest against the original document.</p>
          <ul className="mt-2 space-y-1">{coach.certifications.map((c) => <li key={c.id} className="flex items-center gap-2"><Award className="h-4 w-4 text-primary" /><strong>{c.name}</strong><span className="text-muted-foreground">· {c.issuer}</span></li>)}</ul>
        </section>
      ) : null}

      <section className="surface mt-6 space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Ratings</h2>
          <p className="flex items-center gap-1 text-lg font-bold"><Star className="h-5 w-5 fill-warn text-warn" />{summary.avg ? summary.avg.toFixed(1) : "New"}<span className="text-sm font-normal text-muted-foreground">· {summary.count} verified review{summary.count === 1 ? "" : "s"}</span></p>
        </div>
        {SUB_SCORES.map((s) => <Bar key={s.key} label={s.label} value={summary[s.key]} />)}
        <ul className="divide-y">
          {(reviews ?? []).map((r) => (
            <li key={r.booking_id} className={`py-3 ${r.hidden ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2"><span className="text-warn">{"★".repeat(r.rating)}</span><strong>{r.reviewer}</strong><span className="text-xs text-success"><BadgeCheck className="inline h-3.5 w-3.5" /> Verified session</span></p>
                <span className="text-xs text-muted-foreground">{new Date(r.at).toLocaleDateString("en-IN")}</span>
              </div>
              {r.punctuality && <p className="text-xs text-muted-foreground">{SUB_SCORES.map((s) => `${s.label} ${r[s.key]}/5`).join(" · ")}</p>}
              {r.text && <p className="mt-1">{r.text}</p>}
              {me?.role === "admin" && cloud && <button type="button" className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary" onClick={() => void toggle(r)}>{r.hidden ? <><Eye className="h-3.5 w-3.5" />Show review</> : <><EyeOff className="h-3.5 w-3.5" />Hide review</>}</button>}
            </li>
          ))}
          {reviews && !reviews.length && <li className="py-3 text-muted-foreground">No reviews yet. Reviews come only from completed sessions.</li>}
        </ul>
      </section>

      {plans.length > 0 && (
        <section className="surface mt-6 p-5">
          <h2 className="text-lg font-bold">Weekly plans by {coach.name.split(" ")[0]}</h2>
          <ul className="mt-2 space-y-1">{plans.map((p) => <li key={p.id}><strong>{p.name}</strong> <span className="text-muted-foreground">· {p.intensity === "moderate" ? "Moderate" : "Gentle"} · {p.days.reduce((n, d) => n + d.minutes, 0)} min / week</span></li>)}</ul>
          <Link to="/fitness" className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">Follow a plan on the Fitness page</Link>
        </section>
      )}
    </>
  );
}
