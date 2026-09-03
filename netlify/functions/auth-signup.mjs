import {
  fail, json, usersStore, normalizeEmail, validEmail, validPassword,
  hashPassword, issueSessionCookie, newUserId,
} from './_auth-shared.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const secret = process.env.PLANONIT_SESSION_SECRET;
  if (!secret) return fail(500, 'AUTH_MISCONFIGURED', 'PLANONIT_SESSION_SECRET is not set.');

  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT', 'Body must be JSON.'); }
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';

  if (!validEmail(email)) return fail(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (!validPassword(password)) return fail(400, 'INVALID_PASSWORD', 'Password must be 8-200 characters.');

  const store = usersStore();
  const existing = await store.get(email, { type: 'json' });
  if (existing) return fail(409, 'EMAIL_TAKEN', 'An account already exists for this email.');

  const user = { id: newUserId(), email, name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  // onlyIfNew: two concurrent signups for the same email cannot both win.
  const written = await store.setJSON(email, user, { onlyIfNew: true });
  if (written && written.modified === false) return fail(409, 'EMAIL_TAKEN', 'An account already exists for this email.');

  return json(201, { ok: true, user: { id: user.id, email: user.email, name: user.name } },
    { 'set-cookie': issueSessionCookie(user, secret) });
}

export const config = { path: '/api/auth/signup' };
