import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { getStore } from '@netlify/blobs';

const scryptAsync = promisify(scrypt);

/**
 * Real accounts for PlanOnIt, added 2026-09.
 *
 * Storage: Netlify Blobs (already a project dependency; no new service to sign up for).
 * Users live in the 'planonit-users' store, keyed by lowercased email.
 *
 * Passwords: scrypt (Node's built-in, no extra dependency) with a random 16-byte salt per
 * user; stored as `scrypt:N:r:p:saltHex:hashHex`. Never store or log a plaintext password.
 *
 * Sessions: stateless, signed cookies (HMAC-SHA256 over a JSON payload with PLANONIT_SESSION_SECRET)
 * rather than a server-side session table - one less store to keep consistent, and it matches
 * this project's existing "no server session, verify everything client-presented" posture in
 * src/authority.ts. A cookie cannot be forged without the secret, and it cannot outlive its exp.
 */

const USERS_STORE = 'planonit-users';
const SESSION_COOKIE = 'planonit_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });

export const fail = (status, code, message) => json(status, { ok: false, error: { code, message } });

export function usersStore() {
  return getStore(USERS_STORE);
}

export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254;
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const derived = await scryptAsync(password, salt, 64, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr), r = Number(rStr), p = Number(pStr);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(password, salt, expected.length, { N, r, p });
  // Buffers must be equal length for timingSafeEqual; a length mismatch just means "wrong".
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueSessionCookie(user, secret) {
  const payload = JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name ?? null,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const token = `${encoded}.${sign(encoded, secret)}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/** Returns the verified session payload, or null if there is no valid, unexpired session. */
export function readSession(request, secret) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function newUserId() {
  return randomUUID();
}
