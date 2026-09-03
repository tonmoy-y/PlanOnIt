import { fail, json, readSession } from './_auth-shared.mjs';

export default async function handler(request) {
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  const secret = process.env.PLANONIT_SESSION_SECRET;
  if (!secret) return fail(500, 'AUTH_MISCONFIGURED', 'PLANONIT_SESSION_SECRET is not set.');

  const session = readSession(request, secret);
  if (!session) return fail(401, 'UNAUTHENTICATED', 'Not signed in.');
  return json(200, { ok: true, user: { id: session.sub, email: session.email, name: session.name } });
}

export const config = { path: '/api/auth/me' };
