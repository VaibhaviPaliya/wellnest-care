import type { Booking, Status, User } from "./seed";

export const FLOW: Record<Booking["type"], Status[]> = {
  fitness: ["confirmed", "completed"],
  meal: ["confirmed", "in_progress", "out_for_delivery", "completed"],
  medicine: ["pending_review", "confirmed", "out_for_delivery", "completed"],
};

export function canManageSenior(actor: User | null, senior: User | null): boolean {
  return !!actor && senior?.role === "senior" &&
    (actor.id === senior.id || (actor.role === "family" && actor.linkedSeniorIds.includes(senior.id)));
}

export function canAccessBooking(actor: User | null, booking: Booking): boolean {
  return !!actor && (actor.role === "admin" || actor.id === booking.seniorId ||
    (actor.role === "family" && actor.linkedSeniorIds.includes(booking.seniorId)));
}

export function canTransition(booking: Booking, next: Status): boolean {
  const steps = FLOW[booking.type];
  const index = steps.indexOf(booking.status);
  if (next === "cancelled") return index === 0 || (booking.type === "medicine" && booking.status === "confirmed");
  return index >= 0 && steps[index + 1] === next;
}

export function sessionDate(day: number, slot: string, now = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + day);
  const [hour, minute] = slot.split(":").map(Number);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function isSlotAvailable(day: number, slot: string, coachId: string, bookings: Booking[], now = new Date()): boolean {
  const date = sessionDate(day, slot, now);
  return date > now && !bookings.some((b) => b.type === "fitness" && b.partnerId === coachId && b.status !== "cancelled" && new Date(b.when).getTime() === date.getTime());
}