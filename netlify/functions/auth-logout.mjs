import { fail, json, clearSessionCookie } from './_auth-shared.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  return json(200, { ok: true }, { 'set-cookie': clearSessionCookie() });
}

export const config = { path: '/api/auth/logout' };
