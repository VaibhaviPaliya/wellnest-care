/** Coach-priced monthly session packs. Paid once through Razorpay; no automatic renewal. */
import type { ExercisePlan, Subscription } from "./care";

export interface Pack { id: string; title: string; sessions: number; days: number; price: number; }
export const MAX_PACKS = 5;
export const RENEW_NOTICE_DAYS = 3;

export function packProblem(p: Pack): string | null {
  if (!p.title.trim() || p.title.length > 60) return "Give the pack a short name (up to 60 characters).";
  if (!Number.isInteger(p.sessions) || p.sessions < 1 || p.sessions > 30) return "Sessions must be between 1 and 30.";
  if (!Number.isInteger(p.days) || p.days < 7 || p.days > 90) return "Validity must be between 7 and 90 days.";
  if (!Number.isInteger(p.price) || p.price < 1 || p.price > 100000) return "Price must be between ₹1 and ₹1,00,000.";
  return null;
}
export const perSession = (p: Pick<Pack, "price" | "sessions">) => Math.round(p.price / p.sessions);
/** Saving versus booking the same number of single sessions, in rupees (0 if none). */
export const saving = (p: Pick<Pack, "price" | "sessions">, singlePrice: number) => Math.max(0, singlePrice * p.sessions - p.price);

/** The coach a subscription's credits can be used with (packs name the coach; older subscriptions go via their plan). */
export const subscriptionCoach = (s: Subscription, plans: ExercisePlan[]) => s.coachId ?? plans.find((p) => p.id === s.planId)?.coachId;

/** Active subscriptions ending within the notice window that still need a renewal reminder. */
export function renewalsDue(subs: Subscription[], alerted: string[], now = new Date()): Subscription[] {
  const soon = now.getTime() + RENEW_NOTICE_DAYS * 86400000;
  return subs.filter((s) => !s.cancelled && new Date(s.starts) <= now && new Date(s.ends) > now && new Date(s.ends).getTime() <= soon && !alerted.includes(`renew:${s.id}`));
}
