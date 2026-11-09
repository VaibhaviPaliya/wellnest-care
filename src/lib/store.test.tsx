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
    expect(result.current.db.bookings).toHaveLength(3);
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
    act(() => result.current.saveHealth({ conditions: ["high_bp"], diet: "jain", mobility: "limited", allergies: "" }, "Demo address"));
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
    expect(result.current.db.bookings).toHaveLength(3);
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
});