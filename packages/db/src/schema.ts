import { pgSchema, text, boolean, timestamp } from 'drizzle-orm/pg-core';
// Explicit library-owned identity schema; no application service can read password/token columns.
const auth = pgSchema('auth');
const dates = () => ({ createdAt: timestamp('createdAt', { withTimezone: true }).notNull(), updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull() });
export const user = auth.table('user', { id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').notNull().default(false), image: text('image'), ...dates() });
export const session = auth.table('session', { id: text('id').primaryKey(), expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(), token: text('token').notNull().unique(), ...dates(), ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }) });
export const account = auth.table('account', { id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }), refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }), scope: text('scope'), password: text('password'), ...dates() });
export const verification = auth.table('verification', { id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(), expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(), ...dates() });

export * from './oauth-schema.js';
