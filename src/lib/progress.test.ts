import { describe, expect, it } from "vitest";
import { activePlan, minutesThisMonth, missedTwoDays, streak, weekProgress } from "./progress";
import { freshCare, localDate } from "./care";

const plan = freshCare().plans[0]; // Sunday is a rest day
const now = new Date(2026, 10, 27, 18, 0); // Friday 27 Nov 2026
const day = (back: number) => { const d = new Date(now); d.setDate(d.getDate() - back); return d; };
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const done = (...backs: number[]) => backs.map((b) => ({ seniorId: "s", planId: plan.id, date: localDate(day(b)), day: WD[day(b).getDay()] }));

describe("exercise progress", () => {
  it("finds the plan being followed", () => {
    expect(activePlan(freshCare().plans, done(1))?.id).toBe(plan.id);
    expect(activePlan(freshCare().plans, [])).toBeUndefined();
  });
  it("marks the week: done, missed, rest and today", () => {
    const w = weekProgress(plan, done(1, 3), now);
    expect(w).toHaveLength(7);
    expect(w[6].today && !w[6].missed).toBe(true);
    expect(w.filter((d) => d.done)).toHaveLength(2);
    const sunday = w.find((d) => d.weekday === "Sunday")!;
    expect(sunday.scheduled || sunday.missed).toBe(false);
    expect(w.filter((d) => d.missed)).toHaveLength(3); // Sat, Mon, Wed of the last week
  });
  it("counts a streak across rest days", () => {
    // Fri today not done; Thu, Wed, Tue, Mon done; Sun rest; Sat done; Fri (7 back) missed.
    expect(streak(plan, done(1, 2, 3, 4, 6), now)).toBe(5);
    expect(streak(plan, done(0, 1), now)).toBe(2);
    expect(streak(plan, [], now)).toBe(0);
  });
  it("adds this month's minutes", () => {
    expect(minutesThisMonth(freshCare().plans, done(1, 2), now)).toBe(15 + 10); // Thursday 15, Wednesday 10
  });
  it("alerts family after two skipped exercise days, once a day", () => {
    expect(missedTwoDays("s", plan, done(3), [], now)).toBe(`missed:s:${localDate(now)}`);
    expect(missedTwoDays("s", plan, done(1), [], now)).toBeNull();
    expect(missedTwoDays("s", plan, done(3), [`missed:s:${localDate(now)}`], now)).toBeNull();
    expect(missedTwoDays("s", plan, done(20), [], now)).toBeNull(); // stopped long ago: no nagging
    expect(missedTwoDays("s", undefined, [], [], now)).toBeNull();
  });
});
