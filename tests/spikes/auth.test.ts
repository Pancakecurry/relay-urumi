import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';

it('Better Auth creates a session, rejects forged cookies and invalidates sign-out', async () => {
  // Isolated compatibility spike. Production identity uses PostgreSQL in M3.
  const database = new DatabaseSync(':memory:');
  const auth = betterAuth({ database, secret: randomBytes(32).toString('hex'), baseURL: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'], emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: false } },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false }, logger: { disabled: true } });
  await (await getMigrations(auth.options)).runMigrations();
  const send = (path: string, body?: object, cookie?: string) => auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? {cookie} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  try {
    const signup = await send('sign-up/email', { name: 'M0 Test', email: 'm0@example.invalid', password: randomBytes(20).toString('hex') });
    expect(signup.status).toBe(200);
    const setCookies = signup.headers.getSetCookie();
    const sessionCookie = setCookies.find(cookie => cookie.includes('session_token='));
    expect(sessionCookie).toContain('HttpOnly'); expect(sessionCookie).toContain('SameSite=Lax');
    const cookie = setCookies.map(cookie => cookie.split(';')[0]).join('; ');
    const session = await send('get-session', undefined, cookie);
    expect((await session.json() as {user:{email:string}}).user.email).toBe('m0@example.invalid');
    const forged = await send('get-session', undefined, 'better-auth.session_token=forged');
    expect(await forged.json()).toBeNull();
    expect((await send('sign-out', {}, cookie)).status).toBe(200);
    expect(await (await send('get-session', undefined, cookie)).json()).toBeNull();
    const badOrigin = await auth.handler(new Request('http://localhost:3000/api/auth/sign-up/email', {method:'POST',headers:{origin:'https://evil.invalid',cookie,'content-type':'application/json'},body:JSON.stringify({name:'Evil',email:'evil@example.invalid',password:randomBytes(20).toString('hex')})}));
    expect(badOrigin.status).toBe(403);
  } finally { database.close(); }
});
