import https from 'node:https';
import { readFileSync } from 'node:fs';
import * as z from 'zod/v4';
import { Rejection } from './identity.js';
export const headerSchema = z.record(z.string().regex(/^[a-zA-Z0-9-]{1,64}$/), z.string().min(1).max(4096).refine(v => !/[\r\n]/.test(v))).refine(h => Object.keys(h).length <= 8 && Object.keys(h).every(k => !['host', 'origin', 'cookie', 'connection', 'content-length', 'content-type', 'accept', 'proxy-authorization', 'mcp-protocol-version'].includes(k.toLowerCase())) && new Set(Object.keys(h).map(k => k.toLowerCase())).size === Object.keys(h).length);
export type HeadersMap = z.infer<typeof headerSchema>;
type Vault = Record<string, {
    team: string;
    headers: HeadersMap;
}>;
interface SecretResource {
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        namespace: string;
        resourceVersion: string;
    };
    data: Record<string, string>;
}
// Fixed resource, no caller-controlled namespace/name, no Secret enumeration or creation permission.
export class SecretVault {
    private async request(method: 'GET' | 'PUT', body?: SecretResource): Promise<SecretResource> {
        const base = '/var/run/secrets/kubernetes.io/serviceaccount';
        const ca = readFileSync(`${base}/ca.crt`);
        const token = readFileSync(`${base}/token`, 'utf8');
        return new Promise((resolve, reject) => { const r = https.request({ hostname: process.env['KUBERNETES_SERVICE_HOST'], port: Number(process.env['KUBERNETES_SERVICE_PORT_HTTPS'] ?? 443), path: '/api/v1/namespaces/relay-platform/secrets/gateway-upstream-credentials', method, ca, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, timeout: 2000 }, res => { let data = ''; res.on('data', c => { data += String(c); if (data.length > 1048576)
            r.destroy(new Error('Secret resource too large')); }); res.on('end', () => { if (res.statusCode === 409)
            return reject(new Rejection('SECRET_CONFLICT', 409)); if (res.statusCode !== 200)
            return reject(new Rejection('SECRET_STORE_UNAVAILABLE', 503)); try {
            resolve(JSON.parse(data) as SecretResource);
        }
        catch {
            reject(new Rejection('SECRET_STORE_UNAVAILABLE', 503));
        } }); }); r.on('timeout', () => r.destroy(new Error('Secret timeout'))); r.on('error', () => reject(new Rejection('SECRET_STORE_UNAVAILABLE', 503))); r.end(body ? JSON.stringify(body) : undefined); });
    }
    private decode(s: SecretResource): Vault { return JSON.parse(Buffer.from(s.data['credentials.json'] ?? 'e30=', 'base64').toString('utf8')) as Vault; }
    async get(team: string, ref: string) { const v = this.decode(await this.request('GET'))[ref]; if (!v || v.team !== team)
        throw new Rejection('CREDENTIAL_UNAVAILABLE', 503); return headerSchema.parse(v.headers); }
    async set(team: string, ref: string, headers: HeadersMap | null) { for (let n = 0; n < 3; n++) {
        const s = await this.request('GET');
        const v = this.decode(s);
        if (v[ref] && v[ref].team !== team)
            throw new Rejection('CREDENTIAL_SCOPE', 403);
        if (headers)
            v[ref] = { team, headers: headerSchema.parse(headers) };
        else
            delete v[ref];
        s.data['credentials.json'] = Buffer.from(JSON.stringify(v)).toString('base64');
        try {
            await this.request('PUT', s);
            return;
        }
        catch (e) {
            if (!(e instanceof Rejection && e.code === 'SECRET_CONFLICT') || n === 2)
                throw e;
        }
    } }
}
