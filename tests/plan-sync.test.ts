import { describe, expect, it } from 'vitest';
import { sanitizePlan } from '../netlify/functions/plan-sync.mjs';

describe('plan sync sanitization', () => {
  it('keeps only the pre-reservation planning fields, never status/approval/reservation', () => {
    const sanitized = sanitizePlan({
      city: 'Dhaka', date: '2026-09-10', people: 3, budget: 5000,
      preferences: { cuisine: 'Thai' }, dinnerDurationMinutes: 90, bufferMinutes: 30,
      selections: { restaurantId: 'r1' },
      status: 'reserved', approval: { version: 1 }, reservation: { id: 'SBX-1' },
    });
    expect(sanitized).toEqual({
      city: 'Dhaka', date: '2026-09-10', people: 3, budget: 5000,
      preferences: { cuisine: 'Thai' }, dinnerDurationMinutes: 90, bufferMinutes: 30,
      selections: { restaurantId: 'r1' },
    });
  });
  it('rejects a non-object plan instead of storing garbage', () => {
    expect(sanitizePlan(null)).toBeNull();
    expect(sanitizePlan('not a plan')).toBeNull();
    expect(sanitizePlan(42)).toBeNull();
  });
  it('clamps out-of-range or wrong-typed numbers to safe defaults', () => {
    const sanitized = sanitizePlan({ people: -5, budget: 'a lot', dinnerDurationMinutes: 999999 });
    expect(sanitized?.people).toBe(1);
    expect(sanitized?.budget).toBe(0);
    expect(sanitized?.dinnerDurationMinutes).toBe(300);
  });
  it('drops non-object preferences/selections rather than storing them verbatim', () => {
    const sanitized = sanitizePlan({ preferences: 'thai food please', selections: 'a whole restaurant' });
    expect(sanitized?.preferences).toEqual({});
    expect(sanitized?.selections).toEqual({});
  });
  it('truncates oversized strings instead of storing them unbounded', () => {
    const sanitized = sanitizePlan({ city: 'x'.repeat(500), date: 'y'.repeat(500) });
    expect(sanitized?.city.length).toBe(80);
    expect(sanitized?.date.length).toBe(20);
  });
});
