import { describe, expect, it } from "vitest";
import { packProblem, perSession, renewalsDue, saving, subscriptionCoach } from "./packs";
import type { Subscription } from "./care";

const pack = { id: "pk-abc123", title: "8 sessions · monthly", sessions: 8, days: 30, price: 3400 };
describe("coach packs", () => {
  it("validates sessions, validity and price", () => {
    expect(packProblem(pack)).toBeNull();
    expect(packProblem({ ...pack, title: " " })).toMatch(/name/);
    expect(packProblem({ ...pack, sessions: 0 })).toMatch(/1 and 30/);
    expect(packProblem({ ...pack, days: 120 })).toMatch(/7 and 90/);
    expect(packProblem({ ...pack, price: 0 })).toMatch(/₹1/);
    expect(packProblem({ ...pack, price: 99.5 })).toMatch(/₹1/);
  });
  it("shows the per-session price and the saving", () => {
    expect(perSession(pack)).toBe(425);
    expect(saving(pack, 499)).toBe(592);
    expect(saving(pack, 300)).toBe(0);
  });
  it("finds the coach for new packs and older plan-based subscriptions", () => {
    const base: Subscription = { id: "s", seniorId: "k", planId: "plan-chair", starts: "", ends: "", remaining: 1, cancelled: false };
    expect(subscriptionCoach({ ...base, coachId: "co-9" }, [])).toBe("co-9");
    expect(subscriptionCoach(base, [{ id: "plan-chair", coachId: "c1", name: "", days: [] }])).toBe("c1");
  });
  it("reminds once, 3 days before a pack ends", () => {
    const now = new Date("2026-12-10T10:00:00Z");
    const s = (id: string, ends: string, extra: Partial<Subscription> = {}): Subscription => ({ id, seniorId: "k", planId: "", starts: "2026-11-15T00:00:00Z", ends, remaining: 2, cancelled: false, ...extra });
    const subs = [s("a", "2026-12-12T00:00:00Z"), s("b", "2026-12-20T00:00:00Z"), s("c", "2026-12-11T00:00:00Z", { cancelled: true }), s("d", "2026-12-09T00:00:00Z")];
    expect(renewalsDue(subs, [], now).map((x) => x.id)).toEqual(["a"]);
    expect(renewalsDue(subs, ["renew:a"], now)).toEqual([]);
  });
});
