import { useEffect, useState } from "react";
import { Eye, EyeOff, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { youtubeId } from "@/lib/exercise";

type Report = { plan_id: string; reason: string; created_at: string };

/** Admin: every coach plan, its reports, and hide / restore. Plans are published by coaches without prior review. */
export function PlanModeration() {
  const { db, cloud, setPlanHidden } = useStore();
  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => {
    if (!cloud) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("plan_reports").select("plan_id,reason,created_at").order("created_at", { ascending: false })
      .then(({ data }: { data: Report[] | null }) => setReports(data ?? []));
  }, [cloud, db.care.plans]);
  const act = async (id: string, hidden: boolean) => {
    const err = await setPlanHidden(id, hidden);
    if (err) toast.error(err); else toast.success(hidden ? "Plan hidden from seniors." : "Plan restored and its reports cleared.");
  };
  const plans = [...db.care.plans].sort((a, b) => Number(!!b.hidden) - Number(!!a.hidden) || reports.filter((r) => r.plan_id === b.id).length - reports.filter((r) => r.plan_id === a.id).length);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Exercise plans · moderation</h2>
      <p className="text-muted-foreground">Coaches publish plans directly. Check new and reported plans; hidden plans disappear for seniors at once. Restoring a plan clears its reports.</p>
      <ul className="divide-y">
        {plans.map((p) => {
          const coach = db.coaches.find((c) => c.id === p.coachId);
          const rs = reports.filter((r) => r.plan_id === p.id);
          return (
            <li key={p.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{p.name} <span className="font-normal text-muted-foreground">· {coach?.name ?? "Unknown coach"} · {p.intensity ?? "gentle"} · {p.days.filter((d) => youtubeId(d.videoUrl)).length} videos</span></p>
                {p.hidden
                  ? <Button variant="care" size="care" className="btn btn-outline" onClick={() => void act(p.id, false)}><Eye className="h-4 w-4" />Restore</Button>
                  : <Button variant="care" size="care" className="btn btn-outline" onClick={() => void act(p.id, true)}><EyeOff className="h-4 w-4" />Hide</Button>}
              </div>
              <p className="text-sm">{p.hidden ? <span className="font-semibold text-destructive">Hidden {p.hiddenReason === "reports" ? "after reports" : "by admin"}</span> : <span className="font-semibold text-success">Live</span>}
                {p.updatedAt ? ` · updated ${new Date(p.updatedAt).toLocaleDateString("en-IN")}` : ""}</p>
              <details className="text-sm"><summary className="cursor-pointer text-primary">Days & videos</summary>
                <ul className="mt-1 space-y-0.5">{p.days.map((d) => <li key={d.day}><strong>{d.day}:</strong> {d.minutes ? `${d.title} · ${d.minutes} min` : "Rest"}{d.videoUrl && youtubeId(d.videoUrl) ? <> · <a className="text-primary underline" href={d.videoUrl} target="_blank" rel="noopener noreferrer">video</a></> : null}</li>)}</ul>
              </details>
              {rs.length > 0 && <ul className="mt-1 space-y-1 rounded-lg bg-muted p-2 text-sm">{rs.map((r, i) => <li key={i} className="flex gap-2"><Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />{r.reason} <span className="text-muted-foreground">· {new Date(r.created_at).toLocaleDateString("en-IN")}</span></li>)}</ul>}
            </li>
          );
        })}
        {!plans.length && <li className="py-3 text-muted-foreground">No plans yet.</li>}
      </ul>
    </section>
  );
}
