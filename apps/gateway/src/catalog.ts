import { Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { routes } from '../../../packages/mcp-client/src/routes.js';
import { Store, secret } from '../../../packages/db/src/store.js';
import { Rejection, permitted, type Identity } from '../../../packages/auth/src/identity.js';
import { boundedFetch } from '../../../packages/auth/src/destinations.js';
export interface Upstream {
    id: string;
    team_id: string;
    name: string;
    url: string;
    revision: number;
    timeout_ms: number;
    credential_ref: string | null;
}
export interface CatalogTool {
    alias: string;
    upstream: Upstream;
    tool: Tool;
}
// Reviewed schema subset: no remote references or executable regex supplied by a registry admin.
const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: false, addUsedSchema: false });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function schemaSafe(schema: Record<string, unknown>) {
    if (Buffer.byteLength(JSON.stringify(schema)) > 32768)
        throw new Rejection('SCHEMA_LIMIT', 502);
    let count = 0;
    function visit(v: unknown, depth: number): void { if (++count > 1000 || depth > 16)
        throw new Rejection('SCHEMA_LIMIT', 502); if (typeof v === 'string' && v.length > 2048)
        throw new Rejection('SCHEMA_LIMIT', 502); if (Array.isArray(v)) {
        if (v.length > 100)
            throw new Rejection('SCHEMA_LIMIT', 502);
        for (const n of v)
            visit(n, depth + 1);
    }
    else if (v && typeof v === 'object')
        for (const [k, n] of Object.entries(v)) {
            if (['$ref', '$dynamicRef', '$recursiveRef', 'patternProperties', 'contentSchema'].includes(k))
                throw new Rejection('SCHEMA_UNSUPPORTED', 502);
            if (k === 'pattern' && typeof n === 'string' && !reviewedPatterns.has(n))
                throw new Rejection('SCHEMA_PATTERN_UNREVIEWED', 502);
            visit(n, depth + 1);
        } }
    visit(schema, 0);
    return schema;
}
// Populated from our handwritten, versioned contracts; new connector patterns require review.
export const reviewedPatterns = new Set<string>();
export function validate(schema: Record<string, unknown>, value: unknown) { schemaSafe(schema); const key = JSON.stringify(schema); let fn = validators.get(key); if (!fn) {
    fn = ajv.compile(schema);
    if (validators.size >= 512)
        validators.clear();
    validators.set(key, fn);
} return fn(value); }
export function standard(schema: Record<string, unknown>) { schemaSafe(schema); return { '~standard': { version: 1 as const, vendor: 'relay-reviewed-json-schema', jsonSchema: { input: () => schema, output: () => schema }, validate: (v: unknown) => validate(schema, v) ? { value: v as Record<string, unknown> } : { issues: [{ message: 'Invalid tool data' }] } } }; }
export async function credentials(u: Upstream) { const r = await fetch('http://relay-api:3001/internal/upstream-credential', { method: 'POST', headers: { authorization: `Bearer ${secret('internal-token')}`, 'content-type': 'application/json' }, body: JSON.stringify({ team: u.team_id, upstream: u.id }), signal: AbortSignal.timeout(2000) }); if (!r.ok)
    throw new Rejection('CREDENTIAL_UNAVAILABLE', 503); return (await r.json() as {
    headers: Record<string, string>;
}).headers; }
function sanitize<T>(value: T, headers: Record<string, string>): T { let text = JSON.stringify(value); for (const v of Object.values(headers)) {
    text = text.replaceAll(v, '[redacted]');
    if (v.startsWith('Bearer '))
        text = text.replaceAll(v.slice(7), '[redacted]');
} text = text.replace(/(?:ck_|cs_)[a-f0-9]{40}|AIza[\w-]{20,}|r[kid]\.[a-zA-Z0-9_.-]{30,}/g, '[redacted]'); return JSON.parse(text) as T; }
export async function connection<T>(u: Upstream, timeout: number, signal: AbortSignal | undefined, fn: (client: Client, headers: Record<string, string>, signal: AbortSignal) => Promise<T>): Promise<T> { const deadline = AbortSignal.timeout(timeout); const combined = signal ? AbortSignal.any([deadline, signal]) : deadline; const headers = await credentials(u); const c = new Client({ name: 'relay-gateway-upstream', version: '0.3.0' }, { versionNegotiation: { mode: 'auto' } }); const transport = new StreamableHTTPClientTransport(new URL(u.url), { requestInit: { headers, signal: combined }, fetch: boundedFetch }); try {
    await c.connect(transport, { timeout, signal: combined });
    return await fn(c, headers, combined);
}
finally {
    await c.close().catch(() => { });
} }
export class Catalog {
    private refreshes = new Map<string, Promise<void>>();
    private seen = new Set<string>();
    private timer: ReturnType<typeof setInterval>;
    constructor(readonly store: Store) { this.timer = setInterval(() => { for (const team of this.seen)
        void this.refresh(team).catch(() => { }); }, 5000); this.timer.unref(); }
    close() { clearInterval(this.timer); }
    async upstreams(team: string) { return this.store.tenant(team, async (tx) => (await tx.query<Upstream>('SELECT * FROM app.upstreams WHERE enabled AND deleted_at IS NULL ORDER BY id')).rows); }
    async refresh(team: string) { const previous = this.refreshes.get(team); if (previous)
        return previous; const running = this.refreshInner(team).finally(() => this.refreshes.delete(team)); this.refreshes.set(team, running); return running; }
    private async refreshInner(team: string) {
        const upstreams = await this.upstreams(team);
        for (let offset = 0; offset < upstreams.length; offset += 3)
            await Promise.all(upstreams.slice(offset, offset + 3).map(async (u) => {
                let tools: Tool[] = [];
                let state = 'Connected', reason: string | null = null;
                try {
                    tools = await connection(u, 2000, undefined, async (c, h, s) => { const list: Tool[] = []; let cursor: string | undefined; for (let page = 0; page < 10; page++) {
                        const response = await c.listTools(cursor ? { cursor } : undefined, { timeout: 2000, signal: s });
                        list.push(...response.tools);
                        cursor = response.nextCursor;
                        if (!cursor)
                            break;
                    } if (cursor || list.length > 500 || new Set(list.map(t => t.name)).size !== list.length)
                        throw new Rejection('CATALOG_LIMIT', 502); for (const t of list) {
                        if (t.name.length > 256 || t.description && t.description.length > 2048)
                            throw new Rejection('CATALOG_LIMIT', 502);
                        schemaSafe(t.inputSchema);
                        if (t.outputSchema)
                            schemaSafe(t.outputSchema);
                        validate(t.inputSchema, {});
                    } return sanitize(list.map(t => ({ name: t.name, ...(t.description ? { description: t.description } : {}), inputSchema: t.inputSchema, ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}), ...(t.annotations ? { annotations: t.annotations } : {}) })), h); });
                }
                catch (e) {
                    state = 'Unreachable';
                    reason = e instanceof Rejection ? e.code : 'DISCOVERY_UNAVAILABLE';
                }
                await this.store.tenant(team, async (tx) => { await tx.query('INSERT INTO app.tool_catalog_versions(upstream_id,team_id,revision,tools,state,reason) SELECT id,team_id,$2,$3::jsonb,$4,$5 FROM app.upstreams WHERE id=$1 AND revision=$2 AND enabled AND deleted_at IS NULL ON CONFLICT(upstream_id) DO UPDATE SET revision=EXCLUDED.revision,tools=CASE WHEN EXCLUDED.state=\'Unreachable\' AND app.tool_catalog_versions.revision=EXCLUDED.revision THEN app.tool_catalog_versions.tools ELSE EXCLUDED.tools END,state=EXCLUDED.state,reason=EXCLUDED.reason,checked_at=now()', [u.id, u.revision, JSON.stringify(tools), state, reason]); });
            }));
    }
    async list(i: Identity) {
        this.seen.add(i.team);
        const stale = await this.store.tenant(i.team, async (tx) => (await tx.query("SELECT 1 FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.enabled AND u.deleted_at IS NULL AND (c.upstream_id IS NULL OR c.checked_at<now()-interval '5 seconds') LIMIT 1")).rowCount);
        if (stale)
            await this.refresh(i.team);
        return this.store.tenant(i.team, async (tx) => { const upstreams = (await tx.query<Upstream & {
            tools: Tool[];
        }>('SELECT u.*,c.tools FROM app.upstreams u JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.enabled AND u.deleted_at IS NULL ORDER BY u.id')).rows; const table = routes(upstreams.map(u => ({ id: u.id, tools: u.tools }))); const list: CatalogTool[] = []; for (const [alias, r] of table) {
            const u = upstreams.find(u => u.id === r.upstreamId)!;
            const t = u.tools.find(t => t.name === r.toolName)!;
            if (await permitted(tx, i, u.id, t.name))
                list.push({ alias, upstream: u, tool: t });
        } return list; });
    }
    async authorize(i: Identity, t: CatalogTool) { return this.store.tenant(i.team, async (tx) => { const u = (await tx.query<Upstream>('SELECT * FROM app.upstreams WHERE id=$1 AND enabled AND deleted_at IS NULL', [t.upstream.id])).rows[0]; if (!u || u.revision !== t.upstream.revision)
        throw new Rejection('UPSTREAM_DISABLED_OR_CHANGED', 403); if (!await permitted(tx, i, u.id, t.tool.name))
        throw new Rejection('TOOL_DENIED', 403); return u; }); }
    async call(i: Identity, t: CatalogTool, args: Record<string, unknown>, signal: AbortSignal): Promise<CallToolResult> { const u = await this.authorize(i, t); if (!validate(t.tool.inputSchema, args))
        throw new Rejection('INVALID_TOOL_ARGUMENTS', 400); return connection(u, u.timeout_ms, signal, async (c, h, s) => { const r = await c.callTool({ name: t.tool.name, arguments: args }, { timeout: u.timeout_ms, signal: s, toolDefinition: t.tool }); if (Buffer.byteLength(JSON.stringify(r)) > 1048576)
        throw new Rejection('UPSTREAM_OUTPUT_LIMIT', 502); if (r.content.some(c => c.type !== 'text'))
        throw new Rejection('UPSTREAM_CONTENT_UNSUPPORTED', 502); const clean=sanitize({ ...r, _meta: undefined }, h);if(!clean.isError&&t.tool.outputSchema&&!validate(t.tool.outputSchema,clean.structuredContent))throw new Rejection('UPSTREAM_INVALID_RESPONSE',502);return clean; }); }
}
