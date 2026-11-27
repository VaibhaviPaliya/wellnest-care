import { Link } from "@tanstack/react-router";
import { Check, Flame, Minus, Timer, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { activePlan, minutesThisMonth, streak, weekProgress } from "@/lib/progress";

/** Exercise progress for the senior and their family: the last 7 days, streak and minutes this month. */
export function ExerciseProgress({ seniorId, name }: { seniorId: string; name: string }) {
  const { db, me } = useStore();
  const mine = db.care.completions.filter((c) => c.seniorId === seniorId);
  const plan = activePlan(db.care.plans, mine);
  const self = me?.id === seniorId;
  if (!plan) return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Exercise progress</h2>
      <p className="text-muted-foreground">{self ? "You haven’t" : `${name} hasn’t`} marked any exercise done yet. <Link to="/fitness" className="font-semibold text-primary underline">Pick a weekly plan</Link></p>
    </section>
  );
  const week = weekProgress(plan, mine);
  const scheduled = week.filter((d) => d.scheduled && !d.today).length;
  const doneCount = week.filter((d) => d.done).length;
  const missed = week.filter((d) => d.missed).length;
  const run = streak(plan, mine);
  const minutes = minutesThisMonth(db.care.plans, mine);
  return (
    <section className="surface mt-6 p-5" aria-labelledby="progress-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="progress-h" className="text-lg font-bold">Exercise progress</h2>
        <span className="text-sm text-muted-foreground">{plan.name}</span>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5 text-center" aria-label="Last 7 days">
        {week.map((d) => {
          const look = d.done ? "bg-success text-white" : d.missed ? "bg-red-100 text-red-700" : d.scheduled ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground border border-dashed";
          const label = d.done ? "done" : d.missed ? "missed" : !d.scheduled ? "rest day" : d.today ? "due today" : "planned";
          return (
            <li key={d.date} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-semibold ${d.today ? "text-primary" : "text-muted-foreground"}`}>{d.today ? "Today" : d.weekday.slice(0, 3)}</span>
              <span className={`grid h-10 w-10 place-items-center rounded-full ${look} ${d.today ? "ring-2 ring-primary ring-offset-2" : ""}`} aria-label={`${d.weekday}: ${label}`}>
                {d.done ? <Check className="h-5 w-5" /> : d.missed ? <X className="h-5 w-5" /> : <Minus className="h-4 w-4" />}
              </span>
            </li>
          );
        })}
      </ol>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-muted p-3"><dt className="text-xs font-semibold text-muted-foreground">This week</dt><dd className="text-xl font-bold">{doneCount}<span className="text-sm font-normal text-muted-foreground"> / {scheduled + (week[6].scheduled ? 1 : 0)}</span></dd></div>
        <div className="rounded-xl bg-muted p-3"><dt className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"><Flame className="h-3.5 w-3.5" />Streak</dt><dd className="text-xl font-bold">{run}<span className="text-sm font-normal text-muted-foreground"> day{run === 1 ? "" : "s"}</span></dd></div>
        <div className="rounded-xl bg-muted p-3"><dt className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"><Timer className="h-3.5 w-3.5" />This month</dt><dd className="text-xl font-bold">{minutes}<span className="text-sm font-normal text-muted-foreground"> min</span></dd></div>
      </dl>
      {missed >= 2 && !self && <p className="mt-3 text-sm font-semibold text-red-700">{name} missed {missed} plan days this week. A gentle check-in call might help.</p>}
      {self && <Link to="/fitness" className="mt-3 inline-block font-semibold text-primary underline">Open today’s exercise</Link>}
    </section>
  );
}
