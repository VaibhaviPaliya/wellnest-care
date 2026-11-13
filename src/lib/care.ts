import type { Booking, DeliveryPartner, HealthProfile } from './seed';

export interface Nutrition { calories: number; carbs: number; protein: number; }
export interface Metrics { age: number; height: number; weight: number; sex: 'female' | 'male'; activity: 'sedentary' | 'light' | 'moderate'; }
export interface ExerciseDay { day: string; title: string; minutes: number; videoUrl?: string; }
export interface ExercisePlan { id: string; coachId: string; name: string; days: ExerciseDay[]; }
export interface Subscription { id: string; seniorId: string; planId: string; starts: string; ends: string; remaining: number; cancelled: boolean; }
export interface CareRequest { id: string; seniorId: string; kind: 'therapy' | 'meal'; detail: string; partnerId?: string; status: 'pending' | 'approved' | 'rejected'; professional?: string; decision?: string; }
export type ReminderKind = 'medicine' | 'exercise' | 'meal' | 'water' | 'other';
/** Repeating daily reminder. `days` uses JS weekday numbers (0 = Sunday). */
export interface Reminder { id: string; seniorId: string; kind: ReminderKind; label: string; time: string; days: number[]; active: boolean; createdBy: string; lastFired?: string; }
export interface CareData { plans: ExercisePlan[]; subscriptions: Subscription[]; requests: CareRequest[]; completions: { seniorId: string; planId: string; date: string; day: string }[]; reminders: Reminder[]; bookingAlerts: string[]; }
export const EXERCISE_SUBSCRIPTION = { price: 1999, sessions: 8, days: 30 } as const;
export const freshCare = (): CareData => ({
  plans: [{ id: 'plan-chair', coachId: 'c1', name: 'Gentle movement week', days: [
    { day: 'Monday', title: 'Seated breathing', minutes: 10 }, { day: 'Tuesday', title: 'Chair mobility', minutes: 15 },
    { day: 'Wednesday', title: 'Guided relaxation', minutes: 10 }, { day: 'Thursday', title: 'Gentle seated stretches', minutes: 15 },
    { day: 'Friday', title: 'Breathwork and calm', minutes: 10 }, { day: 'Saturday', title: 'Chair yoga', minutes: 15 },
    { day: 'Sunday', title: 'Rest and recovery', minutes: 0 },
  ] }], subscriptions: [], requests: [], completions: [],
  reminders: [], bookingAlerts: [],
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
/** Average of completed, reviewed bookings for one partner; falls back to the listed rating when none exist. */
export function partnerRating(type: Booking['type'], partnerId: string, bookings: Booking[], fallback = 0): { rating: number; count: number } {
  const reviews = bookings.filter(b => b.type === type && b.partnerId === partnerId && b.status === 'completed' && b.review).map(b => b.review?.rating ?? 0);
  return { rating: reviews.length ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length * 10) / 10 : fallback, count: reviews.length };
}
export function coachRating(coachId: string, bookings: Booking[], fallback: number): { rating: number; count: number } {
  return partnerRating('fitness', coachId, bookings, fallback);
}

export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function validReminder(r: Pick<Reminder, 'label' | 'time' | 'days'>): boolean {
  return !!r.label.trim() && r.label.length <= 80 && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) && r.days.length > 0 && r.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(r.days).size === r.days.length;
}
/** Reminders whose time has passed today (within `windowMin`) and that have not fired today. */
export function dueReminders(reminders: Reminder[], now = new Date(), windowMin = 60): Reminder[] {
  const today = localDate(now); const mins = now.getHours() * 60 + now.getMinutes();
  return reminders.filter(r => {
    if (!r.active || r.lastFired === today || !r.days.includes(now.getDay())) return false;
    const [h, m] = r.time.split(':').map(Number); const at = h * 60 + m;
    return at <= mins && mins - at <= windowMin;
  });
}
/** Minutes before a booking that the "starting soon" alert goes out (FR10). */
export const BOOKING_REMINDER_MIN = 30;
/** Active bookings starting within the reminder window that have not been alerted yet. */
export function bookingsStartingSoon(bookings: Booking[], alerted: string[], now = new Date(), withinMin = BOOKING_REMINDER_MIN): Booking[] {
  return bookings.filter(b => !['cancelled', 'completed'].includes(b.status) && !alerted.includes(b.id) && new Date(b.when).getTime() > now.getTime() && new Date(b.when).getTime() - now.getTime() <= withinMin * 60000);
}

/** Picks the verified delivery partner with the fewest active orders; unverified staff are never assigned. */
export function assignDelivery(partners: DeliveryPartner[], bookings: Booking[]): DeliveryPartner | null {
  const load = (id: string) => bookings.filter(b => b.deliveryId === id && !['completed', 'cancelled'].includes(b.status)).length;
  return partners.filter(p => p.verified).sort((a, b) => load(a.id) - load(b.id) || a.id.localeCompare(b.id))[0] ?? null;
}
/** Coaches arrive 10 minutes early to set up a home visit. */
export const ARRIVAL_LEAD_MIN = 10;
export function arrivalWindow(b: Pick<Booking, 'when'>): { from: Date; to: Date } {
  const to = new Date(b.when);
  return { from: new Date(to.getTime() - ARRIVAL_LEAD_MIN * 60000), to };
}
