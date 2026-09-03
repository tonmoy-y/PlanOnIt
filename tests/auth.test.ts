import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  hashPassword, verifyPassword, validEmail, validPassword, normalizeEmail,
  issueSessionCookie, readSession, clearSessionCookie,
} from '../netlify/functions/_auth-shared.mjs';

const mockRequest = (cookieHeader?: string) => ({ headers: { get: (name: string) => name.toLowerCase() === 'cookie' ? cookieHeader : undefined } });
const cookieValue = (setCookieHeader: string) => setCookieHeader.split(';')[0].split('=').slice(1).join('=');

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('wrong password entirely', stored)).toBe(false);
  });
  it('never stores the plaintext password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).not.toContain('correct horse battery staple');
    expect(stored.startsWith('scrypt:')).toBe(true);
  });
  it('salts identically-valued passwords differently', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password-123', a)).toBe(true);
    expect(await verifyPassword('same-password-123', b)).toBe(true);
  });
  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(await verifyPassword('anything', undefined as unknown as string)).toBe(false);
  });
});

describe('input validation', () => {
  it('accepts ordinary emails and rejects malformed ones', () => {
    expect(validEmail('person@example.com')).toBe(true);
    expect(validEmail('not-an-email')).toBe(false);
    expect(validEmail('missing@domain')).toBe(false);
    expect(validEmail('')).toBe(false);
  });
  it('normalizes email casing and whitespace for lookup', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
  });
  it('enforces a minimum password length', () => {
    expect(validPassword('short')).toBe(false);
    expect(validPassword('long-enough-password')).toBe(true);
  });
});

describe('session cookies', () => {
  const secret = 'test-secret-do-not-use-in-production';
  const user = { id: 'u1', email: 'person@example.com', name: 'Person' };

  it('round-trips a session issued for a user', () => {
    const setCookie = issueSessionCookie(user, secret);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    const session = readSession(mockRequest(`planonit_session=${cookieValue(setCookie)}`), secret);
    expect(session).toMatchObject({ sub: 'u1', email: 'person@example.com', name: 'Person' });
  });
  it('rejects a session signed with a different secret', () => {
    const setCookie = issueSessionCookie(user, secret);
    const session = readSession(mockRequest(`planonit_session=${cookieValue(setCookie)}`), 'a-different-secret');
    expect(session).toBeNull();
  });
  it('rejects a tampered payload even if the signature format still looks valid', () => {
    const setCookie = issueSessionCookie(user, secret);
    const raw = cookieValue(setCookie);
    const [encoded, signature] = raw.split('.');
    const tampered = `${Buffer.from(JSON.stringify({ sub: 'someone-else', email: 'attacker@example.com', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${signature}`;
    void encoded;
    expect(readSession(mockRequest(`planonit_session=${tampered}`), secret)).toBeNull();
  });
  it('rejects an expired session', () => {
    // Issue, then read it back with a secret that makes "now" look past expiry by reading
    // the payload directly rather than waiting 30 days: construct an already-expired token
    // the same way issueSessionCookie does, to keep this a true round-trip of the format.
    const past = Math.floor(Date.now() / 1000) - 10;
    const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, name: user.name, exp: past })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    expect(readSession(mockRequest(`planonit_session=${payload}.${signature}`), secret)).toBeNull();
  });
  it('returns null when there is no session cookie at all', () => {
    expect(readSession(mockRequest(undefined), secret)).toBeNull();
    expect(readSession(mockRequest('other_cookie=1'), secret)).toBeNull();
  });
  it('clears the cookie with Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});
