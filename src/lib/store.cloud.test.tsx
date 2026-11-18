import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedCoaches, seedPharmacies, seedKitchens, seedDelivery } from "./seed";

// In-memory stand-in for the Lovable Cloud client: returns rows per table and records every write.
const K = "11111111-1111-1111-1111-111111111111", A = "22222222-2222-2222-2222-222222222222";
const writes: { table: string; op: string; payload: unknown }[] = [];
let authCb: ((event: string, session: unknown) => void) | null = null;
const people = [
  { id: K, name: "Kamala", username: "demo_kamala", phone: "9876543210", email: null, age: null, city: null, address: "Jayanagar", consent_at: "2026-11-01T00:00:00Z", health: { conditions: ["diabetes", "high_bp"], diet: "veg", mobility: "assisted", allergies: "" }, role: "senior", linked_senior_ids: [] },
  { id: A, name: "Arjun", username: "demo_arjun", phone: "9123456789", email: null, age: null, city: null, address: null, consent_at: null, health: null, role: "family", linked_senior_ids: [K] },
];
const tables: Record<string, unknown[]> = {
  catalog: [...seedCoaches.map((d, i) => ({ kind: "coach", id: d.id, ord: i, data: d })), ...seedKitchens.map((d, i) => ({ kind: "kitchen", id: d.id, ord: i, data: d })), ...seedPharmacies.map((d, i) => ({ kind: "pharmacy", id: d.id, ord: i, data: d })), ...seedDelivery.map((d, i) => ({ kind: "delivery", id: d.id, ord: i, data: d }))],
  bookings: [], notices: [], care_items: [],
  profiles: [{ id: K, username: "demo_kamala" }],
  user_roles: [{ role: "senior" }],
};
function chain(table: string) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "neq", "order", "in"]) q[m] = self;
  q["maybeSingle"] = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
  q["then"] = (res: (v: unknown) => unknown) => res({ data: tables[table] ?? [], error: null });
  for (const op of ["insert", "update", "delete", "upsert"]) q[op] = (payload?: unknown) => { writes.push({ table, op, payload }); return q; };
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => { authCb = cb; return { data: { subscription: { unsubscribe: () => {} } } }; },
      getUser: async () => ({ data: { user: { id: K } } }),
      signOut: async () => { authCb?.("SIGNED_OUT", null); return { error: null }; },
      verifyOtp: async () => ({ error: null }),
    },
    from: (t: string) => chain(t),
    rpc: async (name: string) => (name === "visible_people" ? { data: people, error: null } : { data: null, error: null }),
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel: async () => {},
  },
}));
vi.mock("./cloud.functions", () => ({ demoPhoneSignIn: async () => ({ tokenHash: "t", isNew: false }) }));

const { StoreProvider, useStore } = await import("./store");

beforeEach(() => { localStorage.clear(); writes.length = 0; });
afterEach(cleanup);

async function signedIn() {
  const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => authCb?.("SIGNED_IN", { user: { id: K, email: "9876543210@phone.wellnest.app" } }));
  await waitFor(() => expect(hook.result.current.cloud).toBe(true));
  return hook.result;
}

describe("Cloud mode", () => {
  it("loads the signed-in senior and partners from Cloud, not from browser storage", async () => {
    const r = await signedIn();
    expect(r.current.me?.name).toBe("Kamala");
    expect(r.current.db.coaches).toHaveLength(seedCoaches.length);
    expect(localStorage.getItem("wellnest-db-v1") ?? "").not.toContain(K);
  });

  it("saves a new booking, its alerts and its delivery partner to Cloud", async () => {
    const r = await signedIn();
    act(() => { r.current.createBooking({ type: "meal", title: "Lunch", partnerId: "k1", partnerName: "Annapoorna", amount: 140, when: new Date(Date.now() + 86400000).toISOString(), detail: "1 item" }); });
    await waitFor(() => expect(writes.some((w) => w.table === "notices" && w.op === "insert")).toBe(true));
    const booking = writes.find((w) => w.table === "bookings" && w.op === "insert")?.payload as { senior_id: string; booked_by: string; data: { deliveryId: string } }[];
    expect(booking[0]).toMatchObject({ senior_id: K, booked_by: K });
    expect(booking[0].data.deliveryId).toBeTruthy();
    const notices = writes.find((w) => w.table === "notices")?.payload as { user_id: string; senior_id: string }[];
    expect(notices.map((n) => n.user_id).sort()).toEqual([K, A].sort());
    expect(notices.every((n) => n.senior_id === K)).toBe(true);
    expect(localStorage.getItem("wellnest-db-v1") ?? "").not.toContain(K);
  });

  it("clears Cloud data from the device on sign-out", async () => {
    const r = await signedIn();
    await act(async () => { r.current.logout(); });
    await waitFor(() => expect(r.current.cloud).toBe(false));
    expect(r.current.me).toBeNull();
    expect(r.current.db.users.some((u) => u.id === K)).toBe(false);
  });

  it("signs in by mobile through the server and Cloud", async () => {
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await expect(hook.result.current.phoneSignIn("9876543210", "123456")).resolves.toBeNull();
  });

  it("sends a new Google user to registration with their name filled in", async () => {
    const roles = tables["user_roles"]; tables["user_roles"] = [];
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => authCb?.("SIGNED_IN", { user: { id: "g-user", email: "asha@gmail.com", user_metadata: { full_name: "Asha Rao" } } }));
    await waitFor(() => expect(hook.result.current.pendingCloud).toEqual({ id: "g-user", email: "asha@gmail.com", name: "Asha Rao" }));
    tables["user_roles"] = roles;
  });
});
