import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import * as z from 'zod/v4';
import { randomUUID } from 'node:crypto';
import { Store, pool, secret, type Tx } from '../../../packages/db/src/store.js';
import { sessionAuth } from '../../../packages/auth/src/session.js';
import { Rejection, admin, delegate, equal, issueToken, member, tokenParts, uuid, type Identity } from '../../../packages/auth/src/identity.js';
import { SecretVault, headerSchema } from '../../../packages/auth/src/secret-vault.js';
import { destination } from '../../../packages/auth/src/destinations.js';
const origin = process.env['PUBLIC_ORIGIN'] ?? 'http://relay.localhost:18080';
const store = new Store(pool('app'));
const { auth, pool: authPool } = sessionAuth();
const vault = new SecretVault();
const app = Fastify({ logger: false, bodyLimit: 262144 });
app.setErrorHandler((error, _req, reply) => { if (error instanceof Rejection)
    return reply.code(error.status).send({ error: { code: error.code } }); if (error instanceof z.ZodError)
    return reply.code(400).send({ error: { code: 'INVALID_INPUT' } }); const code = (error as {
    code?: string;
}).code; if (['23505', '23503'].includes(code ?? ''))
    return reply.code(409).send({ error: { code: 'RESOURCE_CONFLICT' } }); const status = (error as {
    statusCode?: number;
}).statusCode; if (status && status >= 400 && status < 500)
    return reply.code(status).send({ error: { code: 'INVALID_REQUEST' } }); return reply.code(503).send({ error: { code: 'CONTROL_UNAVAILABLE' } }); });
app.addHook('onRequest', async (req, reply) => {
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    if (req.url.startsWith('/health/'))
        return;
    const host = req.headers.host?.split(':')[0];
    if (!['localhost', '127.0.0.1', 'relay-api', new URL(origin).hostname].includes(host ?? ''))
        throw new Rejection('HOST_DENIED', 403);
    if (req.url.startsWith('/api/') && req.headers.origin && req.headers.origin !== origin)
        throw new Rejection('ORIGIN_DENIED', 403);
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin)
        throw new Rejection('CSRF_ORIGIN_REQUIRED', 403);
});
app.get('/health/live', async () => ({ status: 'ok' }));
app.get('/health/ready', async () => { await store.ready(); return { status: 'ok' }; });
app.route({ method: ['GET', 'POST'], url: '/api/auth/*', handler: async (req, reply) => { const headers = fromNodeHeaders(req.headers); const response = await auth.handler(new Request(new URL(req.url, origin), { method: req.method, headers, ...(req.method === 'POST' ? { body: JSON.stringify(req.body ?? {}) } : {}) })); reply.code(response.status); for (const [k, v] of response.headers)
        if (k !== 'set-cookie')
            reply.header(k, v); const cookies = response.headers.getSetCookie(); if (cookies.length)
        reply.header('set-cookie', cookies); const text = response.body ? await response.text() : null; if (text && response.headers.get('content-type')?.includes('application/json')) {
        const data = JSON.parse(text) as Record<string, unknown>;
        if (data && typeof data === 'object') {
            delete data['token'];
            if (data['session'] && typeof data['session'] === 'object')
                delete (data['session'] as Record<string, unknown>)['token'];
        }
        return reply.send(data);
    } return reply.send(text); } });
async function login(headers: Parameters<typeof fromNodeHeaders>[0]) { const s = await auth.api.getSession({ headers: fromNodeHeaders(headers) }); if (!s)
    throw new Rejection('SESSION_REQUIRED', 401); return s; }
async function identity(headers: Parameters<typeof fromNodeHeaders>[0]): Promise<Identity> { const s = await login(headers); const team = uuid.parse(headers['x-relay-team']); return store.tenant(team, tx => member(tx, s.user.id, team, 'session', { session: s.session.id })); }
async function event(tx: Tx, i: Identity, action: string, target?: string) { await tx.query('INSERT INTO app.management_events(id,team_id,user_id,action,target) VALUES($1,$2,$3,$4,$5)', [randomUUID(), i.team, i.user, action, target ?? null]); }
app.get('/api/teams', async (req) => { const s = await login(req.headers); return { teams: (await store.pool.query('SELECT * FROM app.my_teams($1)', [s.user.id])).rows }; });
app.post('/api/teams', async (req) => { const s = await login(req.headers); const b = z.strictObject({ name: z.string().trim().min(1).max(80) }).parse(req.body); const team = randomUUID(); return store.tenant(team, async (tx) => { await tx.query('INSERT INTO app.teams(id,name) VALUES($1,$2)', [team, b.name]); await tx.query("INSERT INTO app.memberships(team_id,user_id,role) VALUES($1,$2,'admin')", [team, s.user.id]); return { id: team, name: b.name, role: 'admin' }; }); });
app.get('/api/members', async (req) => { const i = await identity(req.headers); admin(i); return store.tenant(i.team, async (tx) => ({ members: (await tx.query('SELECT user_id,role,active,created_at FROM app.memberships ORDER BY created_at')).rows })); });
app.patch('/api/members/:id', async (req) => { const i = await identity(req.headers); admin(i); const id = z.string().min(1).max(128).parse((req.params as {
    id: string;
}).id); const b = z.strictObject({ active: z.boolean().optional(), role: z.enum(['admin', 'member']).optional() }).refine(v => Object.keys(v).length > 0).parse(req.body); return store.tenant(i.team, async (tx) => { await tx.query('SELECT id FROM app.teams WHERE id=$1 FOR UPDATE', [i.team]); const r = (await tx.query<{
    active: boolean;
    role: string;
}>('SELECT active,role FROM app.memberships WHERE user_id=$1 FOR UPDATE', [id])).rows[0]; if (!r)
    throw new Rejection('MEMBER_NOT_FOUND', 404); if (r.active && r.role === 'admin' && (b.active === false || b.role === 'member') && (await tx.query("SELECT 1 FROM app.memberships WHERE active AND role='admin'")).rowCount === 1)
    throw new Rejection('LAST_ADMIN', 409); await tx.query('UPDATE app.memberships SET active=COALESCE($2,active),role=COALESCE($3,role) WHERE user_id=$1', [id, b.active ?? null, b.role ?? null]); await event(tx, i, 'member.update', id); return { updated: true }; }); });
app.post('/api/invitations', async (req) => { const i = await identity(req.headers); admin(i); const b = z.strictObject({ email: z.email().max(254), role: z.enum(['admin', 'member']).default('member') }).parse(req.body); const t = issueToken('ri', i.team); return store.tenant(i.team, async (tx) => { await tx.query('INSERT INTO app.invitations(id,team_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval \'24 hours\',$6)', [t.id, i.team, b.email.toLowerCase(), b.role, t.hash, i.user]); await event(tx, i, 'invitation.create', t.id); return { id: t.id, token: t.token, expiresInSeconds: 86400 }; }); });
app.get('/api/invitations', async (req) => { const i = await identity(req.headers); admin(i); return store.tenant(i.team, async (tx) => ({ invitations: (await tx.query('SELECT id,email,role,expires_at,accepted_at,revoked_at FROM app.invitations ORDER BY created_at')).rows })); });
app.delete('/api/invitations/:id', async (req) => { const i = await identity(req.headers); admin(i); const id = uuid.parse((req.params as {
    id: string;
}).id); return store.tenant(i.team, async (tx) => { if (!(await tx.query('UPDATE app.invitations SET revoked_at=now() WHERE id=$1 AND accepted_at IS NULL RETURNING id', [id])).rowCount)
    throw new Rejection('INVITATION_NOT_FOUND', 404); await event(tx, i, 'invitation.revoke', id); return { revoked: true }; }); });
app.post('/api/invitations/accept', async (req) => { const s = await login(req.headers); const { token } = z.strictObject({ token: z.string().max(200) }).parse(req.body); const t = tokenParts(token, 'ri'); return store.tenant(t.team, async (tx) => { const r = (await tx.query<{
    email: string;
    role: 'admin' | 'member';
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
    accepted_at: Date | null;
    accepted_by: string | null;
}>('SELECT * FROM app.invitations WHERE id=$1 FOR UPDATE', [t.id])).rows[0]; if (!r || !equal(r.token_hash, t.hash) || r.email !== s.user.email.toLowerCase() || r.revoked_at || r.expires_at <= new Date())
    throw new Rejection('INVITATION_INVALID', 403); if (r.accepted_at) {
    if (r.accepted_by === s.user.id)
        return { teamId: t.team, alreadyAccepted: true };
    throw new Rejection('INVITATION_USED', 409);
} if ((await tx.query('SELECT 1 FROM app.memberships WHERE user_id=$1', [s.user.id])).rowCount)
    throw new Rejection('MEMBERSHIP_EXISTS', 409); await tx.query('INSERT INTO app.memberships(team_id,user_id,role) VALUES($1,$2,$3)', [t.team, s.user.id, r.role]); await tx.query('UPDATE app.invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1', [t.id, s.user.id]); return { teamId: t.team, alreadyAccepted: false }; }); });
app.get('/api/api-keys', async (req) => { const i = await identity(req.headers); return store.tenant(i.team, async (tx) => ({ keys: (await tx.query('SELECT id,user_id,name,created_at,revoked_at,last_used_at FROM app.api_keys WHERE ($1=\'admin\' OR user_id=$2) ORDER BY created_at', [i.role, i.user])).rows })); });
app.post('/api/api-keys', async (req) => { const i = await identity(req.headers); const b = z.strictObject({ name: z.string().trim().min(1).max(80), userId: z.string().max(128).optional() }).parse(req.body); const user = b.userId ?? i.user; if (user !== i.user)
    admin(i); const t = issueToken('rk', i.team); return store.tenant(i.team, async (tx) => { await member(tx, user, i.team, 'session'); await tx.query('INSERT INTO app.api_keys(id,team_id,user_id,name,key_hash) VALUES($1,$2,$3,$4,$5)', [t.id, i.team, user, b.name, t.hash]); await event(tx, i, 'key.issue', t.id); return { id: t.id, key: t.token }; }); });
app.delete('/api/api-keys/:id', async (req) => { const i = await identity(req.headers); const id = uuid.parse((req.params as {
    id: string;
}).id); return store.tenant(i.team, async (tx) => { if (!(await tx.query('UPDATE app.api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND ($2=\'admin\' OR user_id=$3) RETURNING id', [id, i.role, i.user])).rowCount)
    throw new Rejection('KEY_NOT_FOUND', 404); await event(tx, i, 'key.revoke', id); return { revoked: true }; }); });
const credentials = z.union([z.strictObject({ kind: z.literal('bearer'), token: z.string().min(1).max(4096).refine(v => !/[\r\n]/.test(v)) }), z.strictObject({ kind: z.literal('headers'), headers: headerSchema }), z.null()]);
function credentialHeaders(c: z.infer<typeof credentials>) { return c === null ? null : c.kind === 'bearer' ? { Authorization: `Bearer ${c.token}` } : c.headers; }
const upstreamFields = { name: z.string().trim().min(1).max(80), url: z.url().max(2048), enabled: z.boolean(), timeoutMs: z.number().int().min(100).max(10000), credentials: credentials.optional() };
app.get('/api/upstreams', async (req) => { const i = await identity(req.headers); admin(i); return store.tenant(i.team, async (tx) => ({ upstreams: (await tx.query("SELECT u.id,u.name,u.url,u.enabled,u.revision,u.timeout_ms,u.created_at,(u.credential_ref IS NOT NULL) AS has_credentials,CASE WHEN NOT u.enabled THEN 'Disabled' ELSE COALESCE(c.state,'Unreachable') END AS status,c.reason,c.checked_at FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.deleted_at IS NULL ORDER BY u.created_at")).rows })); });
app.post('/api/upstreams', async (req) => { const i = await identity(req.headers); admin(i); const b = z.strictObject({ ...upstreamFields, enabled: upstreamFields.enabled.default(true), timeoutMs: upstreamFields.timeoutMs.default(10000) }).parse(req.body); destination(b.url); const id = randomUUID(); const h = b.credentials ? credentialHeaders(b.credentials) : null; if (h)
    await vault.set(i.team, id, h); return store.tenant(i.team, async (tx) => { await tx.query('INSERT INTO app.upstreams(id,team_id,name,url,enabled,timeout_ms,credential_ref) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, i.team, b.name, b.url, b.enabled, b.timeoutMs, h ? id : null]); await event(tx, i, 'upstream.create', id); return { id }; }); });
app.patch('/api/upstreams/:id', async (req) => { const i = await identity(req.headers); admin(i); const id = uuid.parse((req.params as {
    id: string;
}).id); const b = z.strictObject({ revision: z.number().int().min(1), name: upstreamFields.name.optional(), url: upstreamFields.url.optional(), enabled: upstreamFields.enabled.optional(), timeoutMs: upstreamFields.timeoutMs.optional(), credentials: credentials.optional() }).parse(req.body); if (b.url)
    destination(b.url); return store.tenant(i.team, async (tx) => { const u = (await tx.query<{
    revision: number;
    credential_ref: string | null;
}>('SELECT revision,credential_ref FROM app.upstreams WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0]; if (!u)
    throw new Rejection('UPSTREAM_NOT_FOUND', 404); if (u.revision !== b.revision)
    throw new Rejection('REVISION_CONFLICT', 409); let ref = u.credential_ref; if (b.credentials !== undefined) {
    const h = credentialHeaders(b.credentials);
    await vault.set(i.team, id, h);
    ref = h ? id : null;
} await tx.query('UPDATE app.upstreams SET name=COALESCE($2,name),url=COALESCE($3,url),enabled=COALESCE($4,enabled),timeout_ms=COALESCE($5,timeout_ms),credential_ref=$6,revision=revision+1 WHERE id=$1', [id, b.name ?? null, b.url ?? null, b.enabled ?? null, b.timeoutMs ?? null, ref]); await event(tx, i, 'upstream.update', id); return { id, revision: u.revision + 1 }; }); });
app.delete('/api/upstreams/:id', async (req) => { const i = await identity(req.headers); admin(i); const id = uuid.parse((req.params as {
    id: string;
}).id); await store.tenant(i.team, async (tx) => { if (!(await tx.query('UPDATE app.upstreams SET enabled=false,deleted_at=now(),revision=revision+1 WHERE id=$1 AND deleted_at IS NULL RETURNING id', [id])).rowCount)
    throw new Rejection('UPSTREAM_NOT_FOUND', 404); await event(tx, i, 'upstream.remove', id); }); await vault.set(i.team, id, null); return { removed: true }; });
app.get('/api/audit', async (req) => { const i = await identity(req.headers); const q = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.iso.datetime().optional() }).parse(req.query); return store.tenant(i.team, async (tx) => ({ calls: (await tx.query('SELECT id,user_id,key_id,auth_kind,upstream_id,tool_name,alias,started_at,finished_at,duration_ms,status,code FROM app.audit_calls WHERE ($1=\'admin\' OR user_id=$2) AND ($3::timestamptz IS NULL OR started_at<$3) ORDER BY started_at DESC,id DESC LIMIT $4', [i.role, i.user, q.before ?? null, q.limit])).rows })); });
app.get('/api/permissions', async (req) => { const i = await identity(req.headers); admin(i); return store.tenant(i.team, async (tx) => ({ rules: (await tx.query('SELECT id,subject,upstream_id,tool_name,effect FROM app.permission_rules ORDER BY created_at')).rows })); });
app.post('/api/permissions', async (req) => { const i = await identity(req.headers); admin(i); const b = z.strictObject({ subject: z.string().regex(/^(\*|role:(admin|member)|user:[a-zA-Z0-9-]{1,128})$/), upstreamId: uuid.optional(), toolName: z.string().min(1).max(256).optional(), effect: z.enum(['allow', 'deny']) }).parse(req.body); const id = randomUUID(); return store.tenant(i.team, async (tx) => { if (b.upstreamId && !(await tx.query('SELECT 1 FROM app.upstreams WHERE id=$1 AND deleted_at IS NULL', [b.upstreamId])).rowCount)
    throw new Rejection('UPSTREAM_NOT_FOUND', 404); await tx.query('INSERT INTO app.permission_rules(id,team_id,subject,upstream_id,tool_name,effect) VALUES($1,$2,$3,$4,$5,$6)', [id, i.team, b.subject, b.upstreamId ?? null, b.toolName ?? null, b.effect]); await event(tx, i, 'permission.create', id); return { id }; }); });
app.delete('/api/permissions/:id', async (req) => { const i = await identity(req.headers); admin(i); const id = uuid.parse((req.params as {
    id: string;
}).id); return store.tenant(i.team, async (tx) => { if (!(await tx.query('DELETE FROM app.permission_rules WHERE id=$1 RETURNING id', [id])).rowCount)
    throw new Rejection('POLICY_NOT_FOUND', 404); await event(tx, i, 'permission.remove', id); return { removed: true }; }); });
app.post('/internal/chat-identity', async (req) => { if (!equal(req.headers.authorization ?? '', `Bearer ${secret('internal-token')}`))
    throw new Rejection('INTERNAL_ONLY', 403); const i = await identity(req.headers); return { token: delegate(i, secret('delegation-signing')), expiresInSeconds: 60 }; });
app.post('/internal/upstream-credential', async (req) => { if (!equal(req.headers.authorization ?? '', `Bearer ${secret('internal-token')}`))
    throw new Rejection('INTERNAL_ONLY', 403); const b = z.strictObject({ team: uuid, upstream: uuid }).parse(req.body); return store.tenant(b.team, async (tx) => { const u = (await tx.query<{
    credential_ref: string | null;
}>('SELECT credential_ref FROM app.upstreams WHERE id=$1 AND enabled AND deleted_at IS NULL', [b.upstream])).rows[0]; if (!u)
    throw new Rejection('UPSTREAM_DISABLED', 403); return { headers: u.credential_ref ? await vault.get(b.team, u.credential_ref) : {} }; }); });
app.get('/api/tools', async (req) => { await identity(req.headers); const h = new Headers(); h.set('cookie', req.headers.cookie ?? ''); h.set('x-relay-team', String(req.headers['x-relay-team'])); h.set('authorization', `Bearer ${secret('internal-token')}`); const d = await fetch('http://relay-api:3001/internal/chat-identity', { method: 'POST', headers: h, signal: AbortSignal.timeout(2000) }); if (!d.ok)
    throw new Rejection('IDENTITY_UNAVAILABLE', 503); const { token } = await d.json() as {
    token: string;
}; const response = await fetch('http://relay-gateway:3000/internal/tools', { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }); if (!response.ok)
    throw new Rejection('CATALOG_UNAVAILABLE', 503); return await response.json(); });
await app.listen({ host: '0.0.0.0', port: 3001 });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => { void app.close().then(() => Promise.all([store.pool.end(), authPool.end()])); });
