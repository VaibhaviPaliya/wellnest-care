import { useState } from "react";
import { EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckField } from "@/components/CheckField";
import { useStore } from "@/lib/store";
import { MAX_PLANS_PER_COACH, blankPlan, planProblem, youtubeId, youtubeThumb } from "@/lib/exercise";
import { CONDITION_LABEL, MOBILITY_LABEL, type Condition, type Mobility } from "@/lib/seed";
import type { ExercisePlan } from "@/lib/care";

/** Coach dashboard: create, edit and delete weekly plans with YouTube videos. Plans go live straight away. */
export function CoachPlans({ coachId }: { coachId: string }) {
  const { db, me, saveCoachPlan, deleteCoachPlan } = useStore();
  const mine = db.care.plans.filter((p) => p.ownerId === me?.id);
  const [edit, setEdit] = useState<ExercisePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const err = await saveCoachPlan(edit);
    setBusy(false);
    if (err) return toast.error(err);
    toast.success(edit.id ? "Plan updated — seniors see the changes now." : "Plan published — matching seniors can follow it now.");
    setEdit(null);
  };
  const remove = async (p: ExercisePlan) => {
    const err = await deleteCoachPlan(p.id);
    if (err) toast.error(err); else toast.success(`“${p.name}” deleted.`);
  };

  if (edit) return <PlanEditor plan={edit} onChange={setEdit} onCancel={() => setEdit(null)} onSave={() => void save()} busy={busy} />;
  return (
    <section className="surface mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Weekly plans & videos</h2>
        <Button variant="care" size="care" className="btn btn-primary" disabled={mine.length >= MAX_PLANS_PER_COACH} onClick={() => setEdit(blankPlan(coachId))}><Plus className="h-4 w-4" />New plan</Button>
      </div>
      <p className="text-sm text-muted-foreground">Plans go live as soon as you publish them. Seniors only see plans that suit their health profile. Upload videos to YouTube as <strong>Unlisted</strong> and paste the link. WellNest’s team can hide a plan, and two reports from seniors hide it until it’s checked.</p>
      <ul className="mt-3 divide-y">
        {mine.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-bold">{p.name} <span className="font-normal text-muted-foreground">· {p.intensity === "moderate" ? "Moderate" : "Gentle"} · {p.days.filter((d) => d.minutes > 0).length} exercise days · {p.days.filter((d) => youtubeId(d.videoUrl)).length} videos</span></p>
              {p.hidden ? <p className="flex items-center gap-1 text-sm font-semibold text-destructive"><EyeOff className="h-4 w-4" />{p.hiddenReason === "reports" ? "Hidden after reports from seniors — WellNest is reviewing it" : "Hidden by WellNest — contact support"}</p>
                : <p className="text-sm font-semibold text-success">Live</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="care" size="care" className="btn btn-outline" aria-label={`Edit ${p.name}`} onClick={() => setEdit(structuredClone(p))}><Pencil className="h-4 w-4" /></Button>
              <Button variant="care" size="care" className="btn btn-outline" aria-label={`Delete ${p.name}`} onClick={() => void remove(p)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
        {!mine.length && <li className="py-3 text-muted-foreground">No plans yet. Create your first 7-day plan.</li>}
      </ul>
    </section>
  );
}

function PlanEditor({ plan, onChange, onCancel, onSave, busy }: { plan: ExercisePlan; onChange: (p: ExercisePlan) => void; onCancel: () => void; onSave: () => void; busy: boolean }) {
  const set = <K extends keyof ExercisePlan>(k: K, v: ExercisePlan[K]) => onChange({ ...plan, [k]: v });
  const toggle = <T,>(list: T[] | undefined, v: T) => (list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v];
  const problem = planProblem(plan);
  return (
    <section className="surface mt-6 space-y-5 p-5">
      <h2 className="text-lg font-bold">{plan.id ? "Edit plan" : "New weekly plan"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-bold sm:col-span-2">Plan name<input className="field mt-1" maxLength={80} value={plan.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Gentle chair yoga week" /></label>
        <label className="font-bold sm:col-span-2">Short description<textarea className="field mt-1" rows={2} maxLength={300} value={plan.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Who it's for and what it helps with" /></label>
        <label className="font-bold">Intensity<select className="field mt-1" value={plan.intensity} onChange={(e) => set("intensity", e.target.value as "gentle" | "moderate")}><option value="gentle">Gentle</option><option value="moderate">Moderate</option></select></label>
      </div>
      <fieldset><legend className="mb-2 font-bold">Suitable for (mobility)</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">{(Object.keys(MOBILITY_LABEL) as Mobility[]).map((m) => <CheckField key={m} checked={!!plan.mobility?.includes(m)} onChange={() => set("mobility", toggle(plan.mobility, m))}>{MOBILITY_LABEL[m]}</CheckField>)}</div>
      </fieldset>
      <fieldset><legend className="mb-1 font-bold">Not suitable for</legend>
        <p className="mb-2 text-sm text-muted-foreground">Seniors with these conditions won’t see this plan.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">{(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => <CheckField key={c} checked={!!plan.notFor?.includes(c)} onChange={() => set("notFor", toggle(plan.notFor, c))}>{CONDITION_LABEL[c]}</CheckField>)}</div>
      </fieldset>
      <fieldset className="space-y-3"><legend className="mb-1 font-bold">The week</legend>
        {plan.days.map((d, i) => {
          const vid = youtubeId(d.videoUrl);
          const setDay = (patch: Partial<typeof d>) => set("days", plan.days.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={d.day} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[110px_1fr_90px] sm:items-end">
              <p className="font-bold text-primary sm:self-center">{d.day}</p>
              <label className="text-sm font-semibold">Exercise<input className="field mt-1" maxLength={80} value={d.title} onChange={(e) => setDay({ title: e.target.value })} placeholder={d.minutes ? "e.g. Seated breathing" : "Rest day"} /></label>
              <label className="text-sm font-semibold">Minutes<input className="field mt-1" inputMode="numeric" value={d.minutes} onChange={(e) => setDay({ minutes: Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></label>
              <div className="flex items-center gap-3 sm:col-span-3">
                <label className="min-w-0 flex-1 text-sm font-semibold">YouTube link (optional)<input className="field mt-1" inputMode="url" value={d.videoUrl ?? ""} onChange={(e) => setDay({ videoUrl: e.target.value })} placeholder="https://youtu.be/…" aria-invalid={!!d.videoUrl && !vid} /></label>
                {vid ? <img src={youtubeThumb(vid)} alt="Video preview" className="mt-5 h-14 w-24 shrink-0 rounded object-cover" /> : d.videoUrl ? <span className="mt-5 text-xs text-destructive">Not a YouTube link</span> : null}
              </div>
            </div>
          );
        })}
      </fieldset>
      {problem && <p className="text-sm text-muted-foreground">To publish: {problem}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="care" size="care" className="btn btn-outline" onClick={onCancel}>Cancel</Button>
        <Button variant="care" size="care" className="btn btn-primary" disabled={!!problem || busy} onClick={onSave}>{busy ? "Publishing…" : plan.id ? "Save changes" : "Publish plan"}</Button>
      </div>
    </section>
  );
}
