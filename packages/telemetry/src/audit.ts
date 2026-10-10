import { randomUUID } from 'node:crypto';
import { Store } from '../../db/src/store.js';
import { routes } from '../../mcp-client/src/routes.js';
import { digest, type Identity } from '../../auth/src/identity.js';
export class Audit {
    constructor(readonly store: Store) { }
    async reconcile(team: string) { await this.store.tenant(team, async (tx) => { await tx.query("UPDATE app.audit_calls SET status='unknown',code='GATEWAY_INTERRUPTED',finished_at=now(),duration_ms=LEAST(2147483647,EXTRACT(epoch FROM (now()-started_at))*1000)::integer WHERE status='started' AND started_at<now()-interval '30 seconds'"); }); }
    async start(i: Identity, alias: string, upstream?: string, tool?: string, args?: unknown) { const id = randomUUID(); await this.store.tenant(i.team, async (tx) => { if (!upstream) {
        const all = (await tx.query<{
            id: string;
            tools: {
                name: string;
            }[];
        }>('SELECT u.id,COALESCE(c.tools,$$[]$$::jsonb) AS tools FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id')).rows;
        const route = routes(all).get(alias);
        upstream = route?.upstreamId;
        tool = route?.toolName ?? alias;
    } await tx.query('INSERT INTO app.audit_calls(id,team_id,user_id,key_id,auth_kind,upstream_id,tool_name,alias,status,argument_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'started\',$9)', [id, i.team, i.user, i.key ?? null, i.kind, upstream ?? null, tool ?? null, alias.slice(0, 256), args === undefined ? null : digest(JSON.stringify(args))]); }); return { id, team: i.team, started: Date.now() }; }
    async finish(a: {
        id: string;
        team: string;
        started: number;
    }, status: 'success' | 'failed' | 'rejected' | 'unknown', code: string | null) { await this.store.tenant(a.team, async (tx) => { if (!(await tx.query('UPDATE app.audit_calls SET finished_at=now(),duration_ms=$2,status=$3,code=$4 WHERE id=$1 AND status=\'started\'', [a.id, Math.min(2147483647, Date.now() - a.started), status, code])).rowCount)
        throw new Error('Audit completion unavailable'); }); }
    async reject(i: Identity | undefined, alias: string, code: string) { if (i) {
        const a = await this.start(i, alias);
        await this.finish(a, 'rejected', code);
    }
    else
        await this.store.pool.query('INSERT INTO app.security_events(id,code,method) VALUES($1,$2,$3)', [randomUUID(), code, alias === 'unknown' ? 'request' : 'tools/call']); }
}
