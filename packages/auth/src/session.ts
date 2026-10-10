import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/src/schema.js';
import { pool, secret } from '../../db/src/store.js';
export function sessionAuth() { const p = pool('auth'); const origin = process.env['PUBLIC_ORIGIN'] ?? 'http://relay.localhost:18080'; return { pool: p, auth: betterAuth({ database: drizzleAdapter(drizzle(p, { schema }), { provider: 'pg', schema }), secret: secret('auth-signing'), baseURL: origin, basePath: '/api/auth', trustedOrigins: [origin], emailAndPassword: { enabled: true, minPasswordLength: 12 }, session: { cookieCache: { enabled: false }, expiresIn: 86400, updateAge: 3600 }, advanced: { disableOriginCheck: false, disableCSRFCheck: false, useSecureCookies: origin.startsWith('https://') }, logger: { disabled: true } }) }; }
