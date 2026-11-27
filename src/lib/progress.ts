/** Weekly exercise progress for the senior and their family (batch 5). Dates are the browser's local dates. */
import { localDate, type CareData, type ExercisePlan } from "./care";

type Completion = CareData["completions"][number];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const minutesOf = (plan: ExercisePlan, weekday: string) => plan.days.find((d) => d.day === weekday)?.minutes ?? 0;

/** The plan the senior is following: the one they last marked an exercise done in. */
export function activePlan(plans: ExercisePlan[], completions: Completion[]): ExercisePlan | undefined {
  const last = [...completions].sort((a, b) => b.date.localeCompare(a.date))[0];
  return last ? plans.find((p) => p.id === last.planId) : undefined;
}

export interface DayStatus { date: string; weekday: string; scheduled: boolean; done: boolean; today: boolean; missed: boolean }

/** The last 7 days, oldest first. Rest days (0 minutes) are never "missed"; today is not missed yet. */
export function weekProgress(plan: ExercisePlan, completions: Completion[], now = new Date()): DayStatus[] {
  const today = localDate(now);
  return [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const d = addDays(now, -back); const date = localDate(d); const weekday = WEEKDAY[d.getDay()];
    const scheduled = minutesOf(plan, weekday) > 0;
    const done = completions.some((c) => c.planId === plan.id && c.date === date);
    return { date, weekday, scheduled, done, today: date === today, missed: scheduled && !done && date < today };
  });
}

/** Scheduled days done in a row, counting back from today (today counts only once done). Rest days don't break it. */
export function streak(plan: ExercisePlan, completions: Completion[], now = new Date()): number {
  const done = new Set(completions.filter((c) => c.planId === plan.id).map((c) => c.date));
  let n = 0;
  for (let back = 0; back < 120; back++) {
    const d = addDays(now, -back); const date = localDate(d);
    if (minutesOf(plan, WEEKDAY[d.getDay()]) <= 0) continue;
    if (done.has(date)) n++;
    else if (back === 0) continue;
    else break;
  }
  return n;
}

/** Minutes of exercise marked done this calendar month, across plans. */
export function minutesThisMonth(plans: ExercisePlan[], completions: Completion[], now = new Date()): number {
  const month = localDate(now).slice(0, 7);
  return completions.filter((c) => c.date.startsWith(month)).reduce((sum, c) => {
    const plan = plans.find((p) => p.id === c.planId);
    return sum + (plan ? minutesOf(plan, c.day) : 0);
  }, 0);
}

/**
 * The family alert "missed 2 days": the last two scheduled days before today were both skipped, the senior
 * exercised in the past 14 days (so it stops nagging after they stop), and it hasn't fired today.
 * Returns the alert marker to store, or null.
 */
export function missedTwoDays(seniorId: string, plan: ExercisePlan | undefined, completions: Completion[], alerted: string[], now = new Date()): string | null {
  if (!plan) return null;
  const marker = `missed:${seniorId}:${localDate(now)}`;
  if (alerted.includes(marker)) return null;
  const mine = completions.filter((c) => c.planId === plan.id);
  const recent = localDate(addDays(now, -14));
  if (!mine.some((c) => c.date >= recent)) return null;
  const scheduled: string[] = [];
  for (let back = 1; back <= 14 && scheduled.length < 2; back++) {
    const d = addDays(now, -back);
    if (minutesOf(plan, WEEKDAY[d.getDay()]) > 0) scheduled.push(localDate(d));
  }
  if (scheduled.length < 2) return null;
  return scheduled.every((date) => !mine.some((c) => c.date === date)) ? marker : null;
}
