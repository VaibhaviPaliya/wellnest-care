import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoreProvider, useStore } from "./store";
import { canCancel, isSlotAvailable } from "./booking-rules";
import { seedBookings } from "./seed";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function store(phone = "9876543210") {
  const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => { hook.result.current.login(phone); });
  return hook.result;
}

describe("WellNest care rules", () => {
  it("does not let a new registration choose the admin role", async () => {
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(() => hook.result.current.register("9000000002", "Sneaky", "admin", { username: "sneaky" })).toThrow();
    expect(hook.result.current.db.users.some((u) => u.phone === "9000000002")).toBe(false);
  });

  it("never saves health information before explicit consent", async () => {
    const result = await store();
    act(() => { result.current.register("9000000001", "New Senior", "senior"); });
    const health = { conditions: ["diabetes" as const], diet: "veg" as const, mobility: "assisted" as const, allergies: "" };
    act(() => result.current.saveHealth(health));
    expect(result.current.me?.health).toBeUndefined();
    act(() => result.current.giveConsent());
    act(() => result.current.saveHealth(health));
    expect(result.current.me?.health?.conditions).toEqual(["diabetes"]);
  });

  it("deletes health data and withdraws consent while keeping booking history", async () => {
    const result = await store();
    act(() => result.current.deleteHealthData());
    expect(result.current.me?.health).toBeUndefined();
    expect(result.current.me?.consent).toBeUndefined();
    expect(result.current.db.bookings).toHaveLength(seedBookings.length);
  });

  it("only allows a family member to manage linked seniors", async () => {
    const result = await store("9123456789");
    act(() => result.current.setActiveSenior("u-senior-2"));
    expect(result.current.senior?.id).toBe("u-senior-1");
    act(() => { result.current.linkSenior("9876500001"); });
    expect(result.current.senior?.id).toBe("u-senior-2");
  });

  it("allows linked family to update a consented senior profile without storing health on the family account", async () => {
    const result = await store("9123456789");
    act(() => result.current.saveHealth({ conditions: ["high_bp"], diet: "jain", mobility: "limited", allergies: "" }, { line: "Demo address", pincode: "560011", city: "Bengaluru", state: "Karnataka" }));
    expect(result.current.senior?.health?.diet).toBe("jain");
    expect(result.current.me?.health).toBeUndefined();
  });

  it("revoking family access removes the senior from family management", async () => {
    const result = await store();
    act(() => result.current.unlinkFamily("u-family-1"));
    act(() => { result.current.login("9123456789"); });
    expect(result.current.me?.linkedSeniorIds).toEqual([]);
    expect(result.current.senior).toBeNull();
  });

  it("rejects an unverified coach at booking time", async () => {
    const result = await store();
    expect(() => result.current.createBooking({ type: "fitness", title: "Yoga", partnerId: "c5", partnerName: "Sunil", amount: 349, when: new Date(Date.now() + 86400000).toISOString(), detail: "Gentle" })).toThrow("not available");
    expect(result.current.db.bookings).toHaveLength(seedBookings.length);
  });

  it("starts medicine requests in pharmacy review and alerts every linked family member with time", async () => {
    const result = await store();
    const when = new Date(Date.now() + 86400000).toISOString();
    act(() => { result.current.createBooking({ type: "medicine", title: "Medicine order", partnerId: "p1", partnerName: "Apollo Care Pharmacy", amount: 65, when, detail: "Metformin" }); });
    expect(result.current.db.bookings[0].status).toBe("pending_review");
    const alert = result.current.db.notices.find((n) => n.userId === "u-family-1" && n.title.includes("Medicine order"));
    expect(alert?.body).toContain(new Date(when).toLocaleString("en-IN"));
  });

  it("prevents double booking a coach slot", async () => {
    const result = await store();
    const booking = { type: "fitness" as const, title: "Yoga", partnerId: "c1", partnerName: "Meera", amount: 499, when: new Date(Date.now() + 86400000).toISOString(), detail: "Gentle" };
    act(() => { result.current.createBooking(booking); });
    expect(() => result.current.createBooking(booking)).toThrow("already been booked");
  });

  it("only accepts ratings for completed services", async () => {
    const result = await store();
    act(() => result.current.review("b-seed-1", 5, "Great"));
    expect(result.current.db.bookings.find((b) => b.id === "b-seed-1")?.review).toBeUndefined();
    act(() => result.current.review("b-seed-3", 4, "Helpful"));
    expect(result.current.db.bookings.find((b) => b.id === "b-seed-3")?.review?.rating).toBe(4);
  });

  it("limits verification to admin accounts", async () => {
    const result = await store();
    act(() => result.current.toggleVerify("coaches", "c5"));
    expect(result.current.db.coaches.find((c) => c.id === "c5")?.verified).toBe(false);
    act(() => { result.current.login("9999999999"); });
    act(() => result.current.toggleVerify("coaches", "c5"));
    expect(result.current.db.coaches.find((c) => c.id === "c5")?.verified).toBe(true);
  });

  it("allows free cancellation until exactly two hours before the slot", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    expect(canCancel({ ...seedBookings[0], when: "2026-11-09T12:00:00Z" }, now)).toBe(true);
    expect(canCancel({ ...seedBookings[0], when: "2026-11-09T11:59:59Z" }, now)).toBe(false);
  });

  it("never offers past fitness slots", () => {
    expect(isSlotAvailable(0, "09:00", "c1", [], new Date("2026-11-09T10:00:00"))).toBe(false);
    expect(isSlotAvailable(1, "09:00", "c1", [], new Date("2026-11-09T10:00:00"))).toBe(true);
  });

  it("deleting an account removes the user, their bookings and family links", async () => {
    const result = await store();
    act(() => { expect(result.current.deleteAccount()).toBeNull(); });
    expect(result.current.me).toBeNull();
    expect(result.current.db.users.some((u) => u.id === "u-senior-1")).toBe(false);
    expect(result.current.db.bookings.some((b) => b.seniorId === "u-senior-1")).toBe(false);
    expect(result.current.db.users.find((u) => u.id === "u-family-1")?.linkedSeniorIds).toEqual([]);
  });

  it("the only admin cannot delete their account", async () => {
    const result = await store("9999999999");
    act(() => { expect(result.current.deleteAccount()).toMatch(/only administrator/); });
    expect(result.current.me?.role).toBe("admin");
  });

  it("lets linked family add a reminder that fires once for the senior and family", async () => {
    const result = await store("9123456789");
    let error: string | null = "not run";
    act(() => { error = result.current.addReminder({ kind: "medicine", label: "Metformin", time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] }); });
    expect(error).toBeNull();
    const reminder = result.current.db.care.reminders[0];
    expect(reminder.seniorId).toBe("u-senior-1");
    const eight = new Date(); eight.setHours(8, 10, 0, 0);
    act(() => { result.current.runTimers(eight); });
    act(() => { result.current.runTimers(eight); });
    const fired = result.current.db.notices.filter((n) => n.title === "Reminder: Metformin");
    expect(fired.map((n) => n.userId).sort()).toEqual(["u-family-1", "u-senior-1"]);
  });

  it("removes reminders when the senior deletes their health data", async () => {
    const result = await store();
    act(() => { result.current.addReminder({ kind: "water", label: "Water", time: "10:00", days: [1] }); });
    expect(result.current.db.care.reminders).toHaveLength(1);
    act(() => result.current.deleteHealthData());
    expect(result.current.db.care.reminders).toHaveLength(0);
  });

  it("does not let an unlinked family member add reminders", async () => {
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => { hook.result.current.register("9000000003", "Cousin", "family"); });
    expect(hook.result.current.addReminder({ kind: "other", label: "Call", time: "09:00", days: [1] })).not.toBeNull();
  });

  it("assigns a verified delivery partner to orders and tells the family who is coming", async () => {
    const result = await store();
    act(() => { result.current.createBooking({ type: "meal", title: "Lunch", partnerId: "k1", partnerName: "Annapoorna", amount: 140, when: new Date(Date.now() + 86400000).toISOString(), detail: "1 item" }); });
    const order = result.current.db.bookings[0];
    expect(order.deliveryId).toBe("dp1");
    const alert = result.current.db.notices.find((n) => n.userId === "u-family-1" && n.title === "Order received: Lunch");
    expect(alert?.who).toEqual({ kind: "delivery", id: "dp1", name: "Ravi Kumar" });
    expect(alert?.body).toContain("Delivery by Ravi Kumar (verified)");
  });

  it("lets only the admin verify delivery partners, and moves open orders off an unverified one", async () => {
    const senior = await store();
    act(() => senior.current.toggleVerify("delivery", "dp3"));
    expect(senior.current.db.delivery.find((d) => d.id === "dp3")?.verified).toBe(true);
    act(() => { senior.current.logout(); senior.current.login("9999999999"); });
    act(() => senior.current.toggleVerify("delivery", "dp3"));
    expect(senior.current.db.delivery.find((d) => d.id === "dp3")?.verified).toBe(false);
    const moved = senior.current.db.bookings.find((b) => b.id === "b-seed-2");
    expect(moved?.deliveryId).not.toBe("dp3");
    expect(senior.current.db.delivery.find((d) => d.id === moved?.deliveryId)?.verified).toBe(true);
  });

  it("only accepts small image data URLs as partner photos, from the admin", async () => {
    const result = await store("9999999999");
    expect(result.current.setPartnerPhoto("coach", "c1", "javascript:alert(1)")).not.toBeNull();
    let error: string | null = "x";
    act(() => { error = result.current.setPartnerPhoto("coach", "c1", "data:image/jpeg;base64,AAAA"); });
    expect(error).toBeNull();
    expect(result.current.db.coaches.find((c) => c.id === "c1")?.photo).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("partners and pincodes", () => {
  it("runs the partner journey: apply → pending and hidden → admin approves → bookable in its pincodes only", async () => {
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => { hook.result.current.register("9000000050", "Ramesh", "partner", { username: "ramesh_med" }); });
    expect(hook.result.current.me?.role).toBe("partner");
    let err: string | null = "x";
    await act(async () => {
      err = await hook.result.current.submitPartner("pharmacy", {
        name: "Ramesh Medicals", licence: "KA-B-999", contactPhone: "9000000050",
        address: { line: "Sector 21 market", pincode: "160022", city: "Chandigarh", state: "Chandigarh" }, servicePincodes: ["160022"],
      });
    });
    expect(err).toBeNull();
    const mine = hook.result.current.myListing!;
    expect(mine.kind).toBe("pharmacy");
    expect(mine.listing.verified).toBe(false);
    expect(mine.listing.status).toBe("pending");

    // Admin approves
    act(() => { hook.result.current.logout(); });
    act(() => { hook.result.current.login("9999999999"); });
    let review: string | null = null;
    act(() => { review = hook.result.current.reviewPartner("pharmacy", mine.listing.id, false); });
    expect(review).toMatch(/reason/);
    act(() => { review = hook.result.current.reviewPartner("pharmacy", mine.listing.id, true); });
    expect(review).toBeNull();
    expect(hook.result.current.db.pharmacies.find((p) => p.id === mine.listing.id)?.verified).toBe(true);

    // Harbhajan (160022) can order from it; Kamala (560011) cannot
    act(() => { hook.result.current.logout(); });
    act(() => { hook.result.current.login("9876500001"); });
    const order = { type: "medicine" as const, title: "Medicine order", partnerId: mine.listing.id, partnerName: "Ramesh Medicals", amount: 125, when: new Date(Date.now() + 86400000).toISOString(), detail: "Metformin" };
    act(() => { hook.result.current.createBooking(order); });
    expect(hook.result.current.db.bookings.some((b) => b.partnerId === mine.listing.id)).toBe(true);
    act(() => { hook.result.current.logout(); });
    act(() => { hook.result.current.login("9876543210"); });
    expect(() => hook.result.current.createBooking(order)).toThrow(/does not serve pincode 560011/);
  });

  it("refuses home services when the senior has no pincode, but allows online classes", async () => {
    const result = await store();
    act(() => result.current.saveHealth(result.current.me!.health!, { line: "12, 4th Cross", pincode: "", city: "Bengaluru", state: "Karnataka" }));
    const when = new Date(Date.now() + 3 * 86400000); when.setHours(19, 0, 0, 0);
    expect(() => result.current.createBooking({ type: "medicine", title: "Order", partnerId: "p1", partnerName: "Apollo", amount: 100, when: when.toISOString(), detail: "x" })).toThrow(/pincode/);
    act(() => { result.current.createBooking({ type: "fitness", title: "Meditation · Online live", partnerId: "c3", partnerName: "Ananya Rao", amount: 299, when: when.toISOString(), detail: "gentle", videoUrl: "https://meet.jit.si/x" }); });
    expect(result.current.db.bookings[0].partnerId).toBe("c3");
  });

  it("a partner cannot submit a second listing of another type", async () => {
    const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => { hook.result.current.register("9000000051", "Lata", "partner", { username: "lata_k" }); });
    const base = { name: "Lata's Kitchen", licence: "FSSAI-1", contactPhone: "9000000051", address: { line: "Main road", pincode: "560011", city: "Bengaluru", state: "Karnataka" }, servicePincodes: ["560011"] };
    await act(async () => { await hook.result.current.submitPartner("kitchen", base); });
    let err: string | null = null;
    await act(async () => { err = await hook.result.current.submitPartner("pharmacy", base); });
    expect(err).toMatch(/already has a kitchen/);
  });
});

describe("store delivery partners", () => {
  it("leaves rider assignment to server dispatch for stores with their own verified riders", async () => {
    const result = await store();
    // Give Apollo (p1) its own verified rider
    act(() => { result.current.logout(); });
    act(() => { result.current.login("9999999999"); });
    const own = { id: "dl-own", name: "Store Rider", vehicle: "Scooter", area: "Bengaluru", verified: false, ownerPartnerId: "p1", riderUserId: "u-x" };
    // Seed through toggle path: admin cannot verify without a masked Aadhaar
    let msg: string | null = null;
    act(() => { (result.current.db.delivery as unknown[]).push(own); });
    act(() => { msg = result.current.reviewRider("dl-own", true); });
    expect(msg).toMatch(/masked Aadhaar/);
    act(() => { (result.current.db.delivery.find((d) => d.id === "dl-own")!).docUploadedAt = "2026-11-26T00:00:00Z"; });
    act(() => { msg = result.current.reviewRider("dl-own", true); });
    expect(msg).toBeNull();
    act(() => { result.current.logout(); });
    act(() => { result.current.login("9876543210"); });
    act(() => { result.current.createBooking({ type: "medicine", title: "Medicine order", partnerId: "p1", partnerName: "Apollo", amount: 125, when: new Date(Date.now() + 86400000).toISOString(), detail: "Metformin" }); });
    const b = result.current.db.bookings[0];
    expect(b.partnerId).toBe("p1");
    expect(b.deliveryId).toBeUndefined();
  });
});
