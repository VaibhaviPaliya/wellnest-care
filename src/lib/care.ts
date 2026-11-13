import type { Booking, HealthProfile } from './seed';

export interface Nutrition { calories: number; carbs: number; protein: number; }
export interface Metrics { age: number; height: number; weight: number; sex: 'female' | 'male'; activity: 'sedentary' | 'light' | 'moderate'; }
export interface ExerciseDay { day: string; title: string; minutes: number; videoUrl?: string; }
export interface ExercisePlan { id: string; coachId: string; name: string; days: ExerciseDay[]; }
export interface Subscription { id: string; seniorId: string; planId: string; starts: string; ends: string; remaining: number; cancelled: boolean; }
export interface CareRequest { id: string; seniorId: string; kind: 'therapy' | 'meal'; detail: string; partnerId?: string; status: 'pending' | 'approved' | 'rejected'; professional?: string; decision?: string; }
export interface CareData { plans: ExercisePlan[]; subscriptions: Subscription[]; requests: CareRequest[]; completions: { seniorId: string; planId: string; date: string; day: string }[]; }
export const EXERCISE_SUBSCRIPTION = { price: 1999, sessions: 8, days: 30 } as const;
export const freshCare = (): CareData => ({
  plans: [{ id: 'plan-chair', coachId: 'c1', name: 'Gentle movement week', days: [
    { day: 'Monday', title: 'Seated breathing', minutes: 10 }, { day: 'Tuesday', title: 'Chair mobility', minutes: 15 },
    { day: 'Wednesday', title: 'Guided relaxation', minutes: 10 }, { day: 'Thursday', title: 'Gentle seated stretches', minutes: 15 },
    { day: 'Friday', title: 'Breathwork and calm', minutes: 10 }, { day: 'Saturday', title: 'Chair yoga', minutes: 15 },
    { day: 'Sunday', title: 'Rest and recovery', minutes: 0 },
  ] }], subscriptions: [], requests: [], completions: [],
});

/** Mifflin–St Jeor maintenance estimate, not a therapeutic prescription. */
export function calorieTarget(m: Metrics): number | null {
  if (![m.age, m.height, m.weight].every(Number.isFinite) || m.age < 18 || m.age > 120 || m.height < 100 || m.height > 230 || m.weight < 30 || m.weight > 250) return null;
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55 }[m.activity];
  if (!factor || !['female', 'male'].includes(m.sex)) return null;
  return Math.round((10 * m.weight + 6.25 * m.height - 5 * m.age + (m.sex === 'male' ? 5 : -161)) * factor);
}
export function validNutrition(n: Nutrition): boolean { return [n.calories, n.carbs, n.protein].every(v => Number.isFinite(v) && v >= 0) && n.calories > 0; }
export function safeVideoUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function hasActiveSubscription(s: Subscription, now = new Date()): boolean { return !s.cancelled && new Date(s.ends) > now && new Date(s.starts) <= now; }
export function needsNutritionReview(h: HealthProfile): boolean { return h.conditions.length > 0 || !!h.records?.length || !!h.history; }
export function coachRating(coachId: string, bookings: Booking[], fallback: number): { rating: number; count: number } {
  const reviews = bookings.filter(b => b.type === 'fitness' && b.partnerId === coachId && b.status === 'completed' && b.review).map(b => b.review?.rating ?? 0);
  return { rating: reviews.length ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length * 10) / 10 : fallback, count: reviews.length };
}