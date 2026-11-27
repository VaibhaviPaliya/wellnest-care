import { describe, expect, it } from "vitest";
import { overallOf, ratingOf, reviewProblem } from "./reviews";
import type { Booking } from "./seed";

describe("detailed reviews", () => {
  it("coach sessions need all three scores; orders need only the overall rating", () => {
    expect(reviewProblem("fitness", { rating: 4, text: "" })).toMatch(/three scores/);
    expect(reviewProblem("fitness", { rating: 4, text: "", punctuality: 5, safety: 4, explanation: 3 })).toBeNull();
    expect(reviewProblem("meal", { rating: 4, text: "" })).toBeNull();
    expect(reviewProblem("meal", { rating: 6, text: "" })).toMatch(/1 to 5/);
    expect(reviewProblem("meal", { rating: 3, text: "x".repeat(501) })).toMatch(/500/);
  });
  it("the overall score is the rounded average of the three", () => {
    expect(overallOf({ punctuality: 5, safety: 4, explanation: 4 })).toBe(4);
    expect(overallOf({ punctuality: 5, safety: 5, explanation: 4 })).toBe(5);
  });
  it("prefers the server summary, and ignores hidden reviews otherwise", () => {
    expect(ratingOf({ ratingSummary: { avg: 4.6, count: 12 } }, [], "fitness", "c1").avg).toBe(4.6);
    const b = (rating: number, hidden = false) => ({ id: String(rating), type: "fitness", partnerId: "c1", status: "completed", review: { rating, text: "", punctuality: rating, hidden } }) as unknown as Booking;
    const s = ratingOf(undefined, [b(5), b(3), b(1, true)], "fitness", "c1");
    expect(s).toMatchObject({ avg: 4, count: 2, punctuality: 4 });
    expect(ratingOf(undefined, [], "fitness", "c9", 4.8)).toEqual({ avg: 4.8, count: 0 });
  });
});
