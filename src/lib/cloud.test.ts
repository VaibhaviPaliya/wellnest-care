import { describe, expect, it } from "vitest";
import { alertId, isPhoneEmail, loadCloud, phoneEmail, planWrites, toUser, type Op } from "./cloud";
import { freshCare } from "./care";
import { seedBookings, seedCoaches } from "./seed";
import type { DB } from "./store";

const K = "kamala-uuid", A = "arjun-uuid";
const base = (over: Partial<DB> = {}): DB => ({
  users: [
    { id: K, phone: "9876543210", name: "Kamala", role: "senior", linkedSeniorIds: [], consent: { given: true, at: "2026-11-01T00:00:00Z" }, health: { conditions: ["diabetes"], diet: "veg", mobility: "assisted", allergies: "" } },
    { id: A, phone: "9123456789", name: "Arjun", role: "family", linkedSeniorIds: [K] },
  ],
  coaches: seedCoaches, kitchens: [], dishes: [], pharmacies: [], delivery: [],
  bookings: [{ ...seedBookings[0], seniorId: K, bookedBy: K }], notices: [],
  care: { ...freshCare() }, currentUserId: K, activeSeniorId: null, updatedAt: 0, ...over,
});
const kinds = (ops: Op[]) => ops.map((o) => (o.t === "insert" || o.t === "update" || o.t === "delete" ? `${o.t}:${o.table}` : o.t));

describe("Cloud writes from local changes", () => {
  it("does nothing when only the signed-in view changes", () => {
    const prev = base();
    expect(planWrites(prev, { ...prev, activeSeniorId: K }, K)).toEqual([]);
  });

  it("inserts a new booking and its alerts with the senior they are about", () => {
    const prev = base();
    const booking = { ...seedBookings[1], id: "b-new", seniorId: K, bookedBy: A };
    const next = { ...prev, bookings: [booking, ...prev.bookings], notices: [
      { id: "n1", userId: K, seniorId: K, title: "Order received", body: "", at: "", read: false },
      { id: "n2", userId: A, seniorId: K, title: "Order received", body: "", at: "", read: false },
    ] };
    const ops = planWrites(prev, next, A);
    expect(kinds(ops)).toEqual(["insert:bookings", "insert:notices"]);
    const b = ops[0] as Extract<Op, { t: "insert" }>;
    expect(b.rows[0]).toMatchObject({ id: "b-new", senior_id: K, booked_by: A });
    const n = ops[1] as Extract<Op, { t: "insert" }>;
    expect(n.rows.map((r) => r["senior_id"])).toEqual([K, K]);
    expect(n.rows[0]["data"]).not.toHaveProperty("userId");
  });

  it("updates (not re-inserts) a booking whose status changed", () => {
    const prev = base();
    const next = { ...prev, bookings: prev.bookings.map((b) => ({ ...b, status: "in_progress" as const })) };
    expect(kinds(planWrites(prev, next, K))).toEqual(["update:bookings"]);
  });

  it("saves the senior’s own health through their profile, and a family member’s edit through the checked function", () => {
    const prev = base();
    const health = { conditions: ["high_bp" as const], diet: "veg" as const, mobility: "limited" as const, allergies: "" };
    const next = { ...prev, users: prev.users.map((u) => (u.id === K ? { ...u, health } : u)) };
    const own = planWrites(prev, next, K);
    expect(own[0]).toMatchObject({ t: "profile", values: { health } });
    const fam = planWrites(prev, next, A);
    expect(fam[0]).toMatchObject({ t: "seniorProfile", senior: K, health });
  });

  it("removes a family link when the senior revokes access", () => {
    const prev = base();
    const next = { ...prev, users: prev.users.map((u) => (u.id === A ? { ...u, linkedSeniorIds: [] } : u)) };
    expect(planWrites(prev, next, K)).toEqual([{ t: "unlink", family: A, senior: K }]);
  });

  it("writes reminders, subscriptions and booking alerts as care items, and deletes removed ones", () => {
    const reminder = { id: "rem-1", seniorId: K, kind: "medicine" as const, label: "Metformin", time: "08:00", days: [1], active: true, createdBy: K };
    const prev = base();
    const added = { ...prev, care: { ...prev.care, reminders: [reminder], bookingAlerts: [prev.bookings[0].id] } };
    const ops = planWrites(prev, added, K);
    const ins = ops.find((o) => o.t === "insert" && o.table === "care_items") as Extract<Op, { t: "insert" }>;
    expect(ins.rows.map((r) => [r["id"], r["kind"], r["senior_id"]])).toEqual([["rem-1", "reminder", K], [alertId(prev.bookings[0].id), "booking_alert", K]]);
    const removed = { ...added, care: { ...added.care, reminders: [] } };
    expect(planWrites(added, removed, K)).toEqual([{ t: "delete", table: "care_items", ids: ["rem-1"] }]);
  });

  it("upserts partner changes made by the admin", () => {
    const prev = base();
    const next = { ...prev, coaches: prev.coaches.map((c) => (c.id === "c5" ? { ...c, verified: true } : c)) };
    const ops = planWrites(prev, next, "admin");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ t: "catalog", rows: [{ kind: "coach", id: "c5", ord: 4 }] });
  });

  it("only deletes the signed-in user’s own alerts", () => {
    const prev = base({ notices: [{ id: "mine", userId: K, title: "", body: "", at: "", read: false }, { id: "theirs", userId: A, title: "", body: "", at: "", read: false }] });
    expect(planWrites(prev, { ...prev, notices: [] }, K)).toEqual([{ t: "delete", table: "notices", ids: ["mine"] }]);
  });
});

describe("Loading from Cloud", () => {
  it("maps people, catalogue, bookings, alerts and care items into the app’s data", async () => {
    const rows: Record<string, unknown[]> = {
      catalog: [{ kind: "coach", id: "c1", ord: 0, data: seedCoaches[0] }, { kind: "plan", id: "p1", ord: 0, data: { id: "p1", coachId: "c1", name: "Plan", days: [] } }],
      bookings: [{ data: { ...seedBookings[0], seniorId: K } }],
      notices: [{ id: "n1", user_id: K, data: { title: "Hi", body: "", at: "", read: false } }],
      care_items: [{ id: "r1", kind: "reminder", senior_id: K, data: { id: "r1", seniorId: K } }, { id: "alert:b1", kind: "booking_alert", senior_id: K, data: { bookingId: "b1" } }],
    };
    const query = (table: string) => {
      const q = { select: () => q, neq: () => q, order: () => q, then: (res: (v: unknown) => unknown) => res({ data: rows[table], error: null }) };
      return q;
    };
    const client = {
      rpc: async () => ({ data: [{ id: K, name: "Kamala", username: "k", phone: "9876543210", email: phoneEmail("9876543210"), age: null, city: null, address: "Jayanagar", consent_at: "2026-11-01T00:00:00Z", health: { conditions: ["diabetes"] }, role: "senior", linked_senior_ids: [] }], error: null }),
      from: query,
    };
    const shared = await loadCloud(client as never);
    expect(shared.users[0]).toMatchObject({ id: K, role: "senior", email: undefined, consent: { given: true } });
    expect(shared.coaches).toHaveLength(1);
    expect(shared.care.plans[0].id).toBe("p1");
    expect(shared.notices[0]).toMatchObject({ id: "n1", userId: K, title: "Hi" });
    expect(shared.care.reminders).toHaveLength(1);
    expect(shared.care.bookingAlerts).toEqual(["b1"]);
  });

  it("hides the internal email used for mobile accounts", () => {
    expect(isPhoneEmail(phoneEmail("9000000001"))).toBe(true);
    expect(toUser({ id: "x", name: "X", username: null, phone: "9000000001", email: phoneEmail("9000000001"), age: null, city: null, address: null, consent_at: null, health: null, role: "family", linked_senior_ids: [] }).email).toBeUndefined();
  });
});
