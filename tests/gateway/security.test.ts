import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { digest, issueToken, tokenParts, delegate, delegatedIdentity, type Identity } from '../../packages/auth/src/identity.js';
import { schemaSafe, standard, reviewedPatterns } from '../../apps/gateway/src/catalog.js';
import { destination, isPublicAddress } from '../../packages/auth/src/destinations.js';
import { headerSchema } from '../../packages/auth/src/secret-vault.js';
import type { Store } from '../../packages/db/src/store.js';
describe('gateway security boundaries', () => {
    it('hashes high entropy personal keys with a public lookup identity', () => { const team = randomUUID(); const t = issueToken('rk', team); expect(t.token).not.toContain(t.hash); expect(tokenParts(t.token, 'rk')).toEqual({ team, id: t.id, hash: digest(t.token) }); expect(() => tokenParts(t.token + 'suffix', 'rk')).toThrow(); expect(() => tokenParts('ri' + t.token.slice(2), 'rk')).toThrow(); });
    it('delegation rejects altered audience, signature, expiry and overlong lifetime before DB access', async () => {
        const signing = randomBytes(32).toString('hex');
        const i: Identity = { team: randomUUID(), user: 'synthetic', role: 'member', kind: 'session', session: 'valid-session' };
        const token = delegate(i, signing);
        const store = {} as Store;
        await expect(delegatedIdentity(store, token + 'bad', signing)).rejects.toThrow('INVALID_DELEGATION');
        const base = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
        for (const changes of [{ aud: 'other' }, { exp: 0 }, { exp: Math.floor(Date.now() / 1000) + 3600 }, { sid: '' }]) {
            const p = Buffer.from(JSON.stringify({ ...base, ...changes })).toString('base64url');
            const t = `rd.${p}.${createHmac('sha256', signing).update(p).digest('base64url')}`;
            await expect(delegatedIdentity(store, t, signing)).rejects.toThrow();
        }
    });
    it('blocks cookie, host, origin, hop headers and CRLF in server credentials', () => { expect(headerSchema.safeParse({ Authorization: 'Bearer synthetic' }).success).toBe(true); for (const h of [{ Cookie: 'x' }, { Host: 'x' }, { Origin: 'x' }, { Connection: 'x' }, { 'X-Key': 'a\r\nb' }, { Authorization: 'x', authorization: 'y' }])
        expect(headerSchema.safeParse(h).success).toBe(false); });
    it('allows only reviewed private service destinations or explicitly approved HTTPS URLs', () => { process.env['ALLOWED_UPSTREAM_URLS'] = 'https://example.com/mcp'; expect(destination('http://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp').protocol).toBe('http:'); expect(destination('https://example.com/mcp').protocol).toBe('https:'); for (const u of ['http://169.254.169.254/mcp', 'https://127.0.0.1/mcp', 'http://kubernetes.default.svc:443/mcp', 'http://demo.relay-store-m1.svc.cluster.local:3306/mcp', 'http://demo.relay-upstreams.svc.cluster.local:3000/mcp?key=x', 'http://user:secret@demo.relay-upstreams.svc.cluster.local:3000/mcp'])
        expect(() => destination(u)).toThrow(); for (const ip of ['127.0.0.1', '10.43.0.1', '169.254.169.254', '172.16.0.1', '100.64.1.1', '::1', '2001:db8::1'])
        expect(isPublicAddress(ip)).toBe(false); expect(isPublicAddress('8.8.8.8')).toBe(true); });
    it('rejects unreviewed and oversized schema programs; preserves strict JSON schema through Standard Schema', () => { for (const schema of [{ $ref: 'http://evil.invalid/schema' }, { type: 'string', pattern: '(a+)+$' }, { type: 'object', description: 'x'.repeat(40000) }])
        expect(() => schemaSafe(schema)).toThrow(); reviewedPatterns.add('^[a-z]{1,4}$'); const schema = { type: 'object', properties: { name: { type: 'string', pattern: '^[a-z]{1,4}$' } }, required: ['name'], additionalProperties: false }; const s = standard(schema); expect(s['~standard'].jsonSchema.input()).toEqual(schema); expect(s['~standard'].validate({ name: 'ok' })).toHaveProperty('value'); expect(s['~standard'].validate({ name: 'ok', extra: true })).toHaveProperty('issues'); });
});
