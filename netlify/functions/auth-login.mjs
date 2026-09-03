import {
  fail, json, usersStore, normalizeEmail, verifyPassword, issueSessionCookie,
} from './_auth-shared.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const secret = process.env.PLANONIT_SESSION_SECRET;
  if (!secret) return fail(500, 'AUTH_MISCONFIGURED', 'PLANONIT_SESSION_SECRET is not set.');

  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT', 'Body must be JSON.'); }
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  // Same message either way - do not tell a caller which part of the pair was wrong.
  const invalid = () => fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (!email || typeof password !== 'string') return invalid();

  const store = usersStore();
  const user = await store.get(email, { type: 'json' });
  if (!user) return invalid();
  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) return invalid();

  return json(200, { ok: true, user: { id: user.id, email: user.email, name: user.name } },
    { 'set-cookie': issueSessionCookie(user, secret) });
}

export const config = { path: '/api/auth/login' };
