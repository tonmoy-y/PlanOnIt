import { fail, json, readSession } from './_auth-shared.mjs';
import { getStore } from '@netlify/blobs';

/**
 * Cross-device plan sync, added 2026-09.
 *
 * Answers a fair question: if signing in didn't change what the app could do for you, why
 * have accounts at all? This gives sign-in one concrete job - remembering the evening you're
 * building so you can pick it up on another device or browser.
 *
 * Scope, deliberately narrow:
 *  - Only the *planning* fields are stored (city, date, people, budget, preferences,
 *    dinner duration/buffer, restaurant/movie/transport selections). Never `status`,
 *    `approval`, or `reservation`. The sandbox reservation ledger (`demoProvider`) lives in
 *    one browser's localStorage and is never synced anywhere, so a plan that has moved past
 *    "draft"/"valid" is not eligible for sync at all - restoring reservation-shaped state on
 *    a device with a different (or empty) ledger would show a booking that isn't real there.
 *  - One row per account, last write wins. Two devices editing at once is not resolved or
 *    merged; the later save overwrites the earlier one. That is an accepted limitation, not
 *    an oversight - the same last-write-wins rule already governs two tabs in one browser.
 *
 * Storage: Netlify Blobs, same store family as accounts and the reservation ledger, keyed by
 * the signed-in user's id so one account cannot read or overwrite another's draft.
 */

const STORE = 'planonit-plans';
const MAX_JSON_BYTES = 20000;

export function sanitizePlan(input) {
  if (!input || typeof input !== 'object') return null;
  const p = input;
  const num = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
  };
  const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  return {
    city: str(p.city, 80),
    date: str(p.date, 20),
    people: num(p.people, 2, 1, 20),
    budget: num(p.budget, 0, 0, 10_000_000),
    dinnerDurationMinutes: num(p.dinnerDurationMinutes, 90, 15, 300),
    bufferMinutes: num(p.bufferMinutes, 30, 0, 300),
    preferences: p.preferences && typeof p.preferences === 'object' ? p.preferences : {},
    selections: p.selections && typeof p.selections === 'object' ? p.selections : {},
  };
}

export default async function handler(request) {
  const secret = process.env.PLANONIT_SESSION_SECRET;
  if (!secret) return fail(500, 'AUTH_MISCONFIGURED', 'PLANONIT_SESSION_SECRET is not set.');
  const session = readSession(request, secret);
  if (!session) return fail(401, 'UNAUTHENTICATED', 'Sign in to sync a plan.');

  const store = getStore(STORE);

  if (request.method === 'GET') {
    const record = await store.get(session.sub, { type: 'json' });
    return json(200, { ok: true, plan: record?.plan ?? null, savedAt: record?.savedAt ?? null });
  }

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT', 'Body must be JSON.'); }
    const sanitized = sanitizePlan(body?.plan);
    if (!sanitized) return fail(400, 'INVALID_INPUT', 'plan is required.');
    const encoded = JSON.stringify(sanitized);
    if (encoded.length > MAX_JSON_BYTES) return fail(413, 'PLAN_TOO_LARGE', 'That plan is too large to sync.');
    await store.setJSON(session.sub, { plan: sanitized, savedAt: new Date().toISOString() });
    return json(200, { ok: true });
  }

  return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET or PUT.');
}

export const config = { path: '/api/plan' };
