import type { Booking } from './seed';

export function canTrackBooking(b: Pick<Booking, 'status' | 'type' | 'videoUrl'>): boolean {
  return !['completed', 'cancelled'].includes(b.status) && !(b.type === 'fitness' && b.videoUrl);
}
export function locationFresh(locatedAt: string | null, now = Date.now()): boolean {
  if (!locatedAt) return false;
  const age = now - Date.parse(locatedAt);
  return Number.isFinite(age) && age >= 0 && age <= 60000;
}