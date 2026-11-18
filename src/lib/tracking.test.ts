import { describe, expect, it } from 'vitest';
import { canTrackBooking, locationFresh } from './tracking';

describe('real partner tracking', () => {
  it('allows medicine delivery tracking', () => expect(canTrackBooking({type: 'medicine', status: 'confirmed'})).toBe(true));
  it('allows kitchen delivery tracking', () => expect(canTrackBooking({type: 'meal', status: 'confirmed'})).toBe(true));
  it('allows home visit coach tracking', () => expect(canTrackBooking({type: 'fitness', status: 'confirmed'})).toBe(true));
  it('does not track online coaches', () => expect(canTrackBooking({type: 'fitness', status: 'confirmed', videoUrl: 'https://example.org'})).toBe(false));
  it('does not track completed services', () => expect(canTrackBooking({type: 'medicine', status: 'completed'})).toBe(false));
  it('does not track cancelled services', () => expect(canTrackBooking({type: 'meal', status: 'cancelled'})).toBe(false));
  it('marks locations older than a minute as stale', () => {
    const now = Date.parse('2026-11-18T08:00:00Z');
    expect(locationFresh('2026-11-18T07:59:00Z', now)).toBe(true);
    expect(locationFresh('2026-11-18T07:58:59Z', now)).toBe(false);
    expect(locationFresh(null, now)).toBe(false);
  });
});