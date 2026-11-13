import { describe, expect, it } from "vitest";
import {
  bookingsStartingSoon,
  dueReminders,
  partnerRating,
  validReminder,
  type Reminder,
} from "./care";
import { translate } from "./i18n";
import { seedBookings } from "./seed";

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
  it("alerts once for bookings starting within the hour", () => {
    const now = new Date();
    const b = {
      ...seedBookings[0],
      id: "x",
      status: "confirmed" as const,
      when: new Date(now.getTime() + 30 * 60000).toISOString(),
    };
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
