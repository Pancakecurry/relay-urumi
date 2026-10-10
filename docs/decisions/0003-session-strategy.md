# ADR 0003: Better Auth sessions; personal keys remain separate

Status: historical M0 compatibility spike; PostgreSQL/Drizzle integration is implemented and tested in M3. See [ADR 0008](0008-durable-gateway.md) for the current session/key implementation.

Use Better Auth 1.7.7 for browser identity. An isolated real SQLite test invokes its request handler, runs its supported migration API, creates a synthetic user, verifies HttpOnly/SameSite cookies, reads the session, rejects a forged cookie and invalidates it on sign-out. No passwords, session tokens or auth signing key are persisted from this test.

Production uses PostgreSQL/Drizzle, same-origin API routes and restricted trusted origins. Secure cookies require HTTPS in production. Disable cookie-cache session snapshots where immediate revocation is required; derive membership and current policy server-side. Platform personal API keys remain separate hashed/revocable database identities at M3. MCP OAuth is still D03; this session spike is not a verified OAuth flow or production authentication implementation.

Compatibility tests explicitly enable Origin and CSRF checks because Better Auth’s test-environment defaults can skip them. The negative test uses a valid cookie-bearing request. The control API will explicitly validate browser Origin/Host at its boundary as well. Do not claim production checks from a test that used the library’s relaxed test defaults.

References: [Better Auth Fastify](https://better-auth.com/docs/integrations/fastify), [SQLite adapter](https://better-auth.com/docs/adapters/sqlite). Installed public export `better-auth/db/migration` supplies migration execution for the temporary spike.
