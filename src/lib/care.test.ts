import { describe, expect, it } from "vitest";
import {
  arrivalWindow,
  assignDelivery,
  bookingsStartingSoon,
  dueReminders,
  partnerRating,
  validReminder,
  type Reminder,
} from "./care";
import { translate } from "./i18n";
import { seedBookings, seedDelivery } from "./seed";
import { mergeRemote, toShared } from "./sync";
import type { DB } from "./store";

const at = (h: number, m: number, day = 13) => new Date(2026, 10, day, h, m); // Fri 13 Nov 2026
const rem = (p: Partial<Reminder>): Reminder => ({
  id: "r1",
  seniorId: "s",
  kind: "medicine",
  label: "Metformin",
  time: "08:00",
  days: [0, 1, 2, 3, 4, 5, 6],
  active: true,
  createdBy: "s",
  ...p,
});

describe("reminders", () => {
  it("validates label, 24-hour time and days", () => {
    expect(validReminder({ label: "Water", time: "07:30", days: [1] })).toBe(true);
    expect(validReminder({ label: " ", time: "07:30", days: [1] })).toBe(false);
    expect(validReminder({ label: "Water", time: "24:00", days: [1] })).toBe(false);
    expect(validReminder({ label: "Water", time: "07:30", days: [] })).toBe(false);
    expect(validReminder({ label: "Water", time: "07:30", days: [7] })).toBe(false);
  });
  it("fires once a reminder's time has passed, only on its days, and only once a day", () => {
    expect(dueReminders([rem({})], at(7, 59))).toHaveLength(0);
    expect(dueReminders([rem({})], at(8, 0))).toHaveLength(1);
    expect(dueReminders([rem({ days: [1] })], at(8, 5))).toHaveLength(0); // Friday is 5
    expect(dueReminders([rem({ lastFired: "2026-11-13" })], at(8, 5))).toHaveLength(0);
    expect(dueReminders([rem({ active: false })], at(8, 5))).toHaveLength(0);
    expect(dueReminders([rem({})], at(9, 30))).toHaveLength(0); // older than the 60-minute window
  });
  it("alerts once, 30 minutes before a booking (not earlier)", () => {
    const now = new Date();
    const b = {
      ...seedBookings[0],
      id: "x",
      status: "confirmed" as const,
      when: new Date(now.getTime() + 25 * 60000).toISOString(),
    };
    expect(
      bookingsStartingSoon(
        [{ ...b, when: new Date(now.getTime() + 45 * 60000).toISOString() }],
        [],
        now,
      ),
    ).toHaveLength(0);
    expect(bookingsStartingSoon([b], [], now)).toHaveLength(1);
    expect(bookingsStartingSoon([b], ["x"], now)).toHaveLength(0);
    expect(bookingsStartingSoon([{ ...b, status: "cancelled" }], [], now)).toHaveLength(0);
  });
});

describe("partner ratings", () => {
  it("averages completed reviews per partner and type", () => {
    expect(partnerRating("medicine", "p1", seedBookings)).toEqual({ rating: 5, count: 1 });
    expect(partnerRating("meal", "k2", seedBookings)).toEqual({ rating: 4, count: 1 });
    expect(partnerRating("meal", "k1", seedBookings, 0)).toEqual({ rating: 0, count: 0 });
  });
});

describe("Hindi translation", () => {
  it("translates known strings, fills placeholders and falls back to English", () => {
    expect(translate("hi", "Alerts")).toBe("सूचनाएँ");
    expect(translate("hi", "For {name}", { name: "Kamala" })).toBe("Kamala के लिए");
    expect(translate("hi", "Not in the dictionary")).toBe("Not in the dictionary");
    expect(translate("en", "Alerts")).toBe("Alerts");
  });
});

describe("delivery partners and arrival", () => {
  it("assigns only verified delivery partners, least busy first", () => {
    const rider = assignDelivery(seedDelivery, seedBookings);
    expect(rider?.verified).toBe(true);
    expect(rider?.id).toBe("dp1"); // dp3 has an open order in the seed data
    expect(
      assignDelivery(
        seedDelivery.map((d) => ({ ...d, verified: false })),
        seedBookings,
      ),
    ).toBeNull();
  });
  it("gives a 10-minute arrival window before a home visit", () => {
    const w = arrivalWindow({ when: "2026-11-14T08:00:00.000Z" });
    expect(w.to.getTime() - w.from.getTime()).toBe(10 * 60000);
  });
});

describe("two-phone demo sync", () => {
  const base = (over: Partial<DB> = {}): DB => ({
    users: [],
    coaches: [],
    kitchens: [],
    dishes: [],
    pharmacies: [],
    delivery: [],
    bookings: [],
    notices: [],
    care: {
      plans: [],
      subscriptions: [],
      requests: [],
      completions: [],
      reminders: [],
      bookingAlerts: [],
    },
    currentUserId: null,
    activeSeniorId: null,
    updatedAt: 0,
    ...over,
  });
  const b1 = { ...seedBookings[2], prescriptionData: "data:application/pdf;base64,AAAA" };
  it("never sends uploaded files", () => {
    expect(toShared(base({ bookings: [b1], updatedAt: 5 })).bookings[0]).not.toHaveProperty(
      "prescriptionData",
    );
  });
  it("applies a newer version, keeps this device's sign-in and local files, and ignores older ones", () => {
    const local = base({
      bookings: [b1],
      currentUserId: "u-senior-1",
      activeSeniorId: null,
      updatedAt: 10,
      users: [{ id: "u-senior-1", phone: "1", name: "K", role: "senior", linkedSeniorIds: [] }],
    });
    const remote = toShared(
      base({
        bookings: [{ ...b1, status: "completed" }, seedBookings[0]],
        users: local.users,
        updatedAt: 20,
      }),
    );
    const merged = mergeRemote(local, remote);
    expect(merged.bookings).toHaveLength(2);
    expect(merged.currentUserId).toBe("u-senior-1");
    expect(merged.bookings.find((b) => b.id === b1.id)?.prescriptionData).toBe(b1.prescriptionData);
    expect(mergeRemote(local, { ...remote, updatedAt: 5 })).toBe(local);
  });
  it("signs this device out if its account was deleted on another device", () => {
    const local = base({
      currentUserId: "gone",
      updatedAt: 1,
      users: [{ id: "gone", phone: "1", name: "X", role: "family", linkedSeniorIds: [] }],
    });
    expect(mergeRemote(local, toShared(base({ updatedAt: 2 }))).currentUserId).toBeNull();
  });
});
