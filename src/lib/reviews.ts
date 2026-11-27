/** Detailed, verified reviews. Coach (and therapy) sessions get three extra scores; the server checks the same rules. */
import type { Booking } from "./seed";

export type SubScore = "punctuality" | "safety" | "explanation";
export const SUB_SCORES: { key: SubScore; label: string; hint: string }[] = [
  { key: "punctuality", label: "Punctuality", hint: "Arrived or started on time" },
  { key: "safety", label: "Safety & gentleness", hint: "Careful with limits, never rushed" },
  { key: "explanation", label: "Explanation", hint: "Clear, easy-to-follow instructions" },
];
export interface ReviewInput { rating: number; text: string; punctuality?: number; safety?: number; explanation?: number; }
export interface RatingSummary { avg: number; count: number; punctuality?: number; safety?: number; explanation?: number; }

export const isDetailed = (type: Booking["type"]) => type === "fitness" || (type as string) === "therapy";
const score = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

export function reviewProblem(type: Booking["type"], r: ReviewInput): string | null {
  if (isDetailed(type) && SUB_SCORES.some((s) => !score(r[s.key]))) return "Give each of the three scores from 1 to 5.";
  if (!score(r.rating)) return "Choose an overall rating from 1 to 5.";
  if (r.text.length > 500) return "Keep the review under 500 characters.";
  return null;
}
/** Overall rating for a detailed review: the rounded average of its three scores. */
export const overallOf = (r: Pick<ReviewInput, SubScore>) => Math.round(((r.punctuality ?? 0) + (r.safety ?? 0) + (r.explanation ?? 0)) / 3);

/** Summary from the listing (server-maintained) or, if absent, from the bookings this user can see. */
export function ratingOf(listing: { ratingSummary?: RatingSummary } | undefined, bookings: Booking[], type: Booking["type"], partnerId: string, fallback = 0): RatingSummary {
  if (listing?.ratingSummary?.count) return listing.ratingSummary;
  const rs = bookings.filter((b) => b.type === type && b.partnerId === partnerId && b.status === "completed" && b.review && !b.review.hidden).map((b) => b.review!);
  if (!rs.length) return { avg: fallback, count: 0 };
  const avg = (k: "rating" | SubScore) => { const v = rs.map((r) => r[k]).filter((x): x is number => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined; };
  return { avg: avg("rating") ?? fallback, count: rs.length, punctuality: avg("punctuality"), safety: avg("safety"), explanation: avg("explanation") };
}
