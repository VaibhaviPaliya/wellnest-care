import { useState } from "react";
import { Check, Flag, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { WEEK_DAYS, planUnsuitable, youtubeEmbed, youtubeId, youtubeThumb } from "@/lib/exercise";
import { localDate, type ExercisePlan } from "@/lib/care";

const todayName = () => WEEK_DAYS[(new Date().getDay() + 6) % 7];

/** Seniors and family: plans that suit the senior's health profile, with videos and "mark done". */
export function ExercisePlans() {
  const { db, senior, completeExercise, reportPlan } = useStore();
  const [planId, setPlanId] = useState<string>("");
  const [video, setVideo] = useState<{ title: string; id: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  if (!senior?.consent?.given) return null;
  const live = db.care.plans.filter((p) => db.coaches.some((c) => c.id === p.coachId && c.verified));
  const suitable = live.filter((p) => !planUnsuitable(p, senior.health));
  const hiddenCount = live.length - suitable.length;
  const recent = [...db.care.completions].filter((c) => c.seniorId === senior.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.planId;
  const plan: ExercisePlan | undefined = suitable.find((p) => p.id === planId) ?? suitable.find((p) => p.id === recent) ?? suitable[0];
  const coach = plan ? db.coaches.find((c) => c.id === plan.coachId) : undefined;
  const today = localDate(new Date());
  const doneToday = (day: string) => db.care.completions.some((c) => c.seniorId === senior.id && plan && c.planId === plan.id && c.date === today && c.day === day);
  const sendReport = async () => {
    if (!plan) return;
    const err = await reportPlan(plan.id, reason);
    if (err) return toast.error(err);
    toast.success("Thank you. Our team will review this plan.");
    setReporting(false); setReason("");
  };

  return (
    <section className="my-6 space-y-4 border-y py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Weekly exercise plans</h2>
        {hiddenCount > 0 && <span className="tag">{hiddenCount} plan{hiddenCount === 1 ? "" : "s"} hidden — not suitable for {senior.name.split(" ")[0]}</span>}
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />Only exercise within your doctor’s advice. Stop if you feel pain, dizziness or breathlessness. Plans are made by verified coaches and filtered by your health profile.</p>
      {!suitable.length ? <p className="surface p-5">No plans suit this health profile yet. Coaches add new plans regularly.</p> : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a plan">
            {suitable.map((p) => (
              <Button key={p.id} variant="care" size="care" role="tab" aria-selected={plan?.id === p.id} className="chip" onClick={() => setPlanId(p.id)}>{p.name}</Button>
            ))}
          </div>
          {plan && (
            <div className="surface space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">by <strong>{coach?.name ?? "a verified coach"}</strong> · {plan.intensity === "moderate" ? "Moderate" : "Gentle"} · {plan.days.reduce((n, d) => n + d.minutes, 0)} min / week</p>
                  {plan.description && <p className="mt-1 text-sm">{plan.description}</p>}
                </div>
                <button type="button" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-destructive" onClick={() => setReporting(true)}><Flag className="h-4 w-4" />Report</button>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {plan.days.map((d) => {
                  const vid = youtubeId(d.videoUrl);
                  const isToday = d.day === todayName();
                  const done = doneToday(d.day);
                  return (
                    <li key={d.day} className={`rounded-xl border p-3 ${isToday ? "border-primary bg-secondary" : "bg-card"}`}>
                      <p className="text-sm font-bold text-primary">{d.day}{isToday ? " · Today" : ""}</p>
                      <p className="font-semibold">{d.minutes ? d.title : "Rest day"}</p>
                      {d.minutes > 0 && <p className="text-sm text-muted-foreground">{d.minutes} minutes</p>}
                      {vid && (
                        <button type="button" onClick={() => setVideo({ title: `${d.day}: ${d.title}`, id: vid })} className="relative mt-2 block w-full overflow-hidden rounded-lg" aria-label={`Play video: ${d.title}`}>
                          <img src={youtubeThumb(vid)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                          <span className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-10 w-10 fill-white text-white" /></span>
                        </button>
                      )}
                      {d.minutes > 0 && isToday && (
                        <Button variant="care" size="care" className="btn btn-primary mt-2 w-full" disabled={done} onClick={() => completeExercise(plan.id, d.day)}>
                          <Check className="h-4 w-4" />{done ? "Done today" : "Mark done"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      <Dialog open={!!video} onOpenChange={(o) => { if (!o) setVideo(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{video?.title}</DialogTitle>
          <DialogDescription>Follow along at your own pace. Stop if anything hurts.</DialogDescription>
          {video && <iframe title={video.title} src={youtubeEmbed(video.id)} className="aspect-video w-full rounded-lg" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />}
        </DialogContent>
      </Dialog>
      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <DialogTitle>Report this plan</DialogTitle>
          <DialogDescription>Tell us what’s wrong — for example an exercise that looks unsafe, or a video that doesn’t match. Two reports hide the plan until our team checks it.</DialogDescription>
          <textarea className="field" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s the problem?" />
          <div className="flex justify-end gap-2">
            <Button variant="care" size="care" className="btn btn-outline" onClick={() => setReporting(false)}>Cancel</Button>
            <Button variant="care" size="care" className="btn btn-danger" disabled={reason.trim().length < 3} onClick={() => void sendReport()}>Send report</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
