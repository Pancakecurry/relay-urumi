import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { Readable, Transform } from 'node:stream';
import { Rejection } from './identity.js';
export function destination(url: string) { const allowed = (process.env['ALLOWED_UPSTREAM_URLS'] ?? '').split(',').filter(Boolean); let u: URL; try {
    u = new URL(url);
}
catch {
    throw new Rejection('DESTINATION_DENIED', 400);
} const internal = u.protocol === 'http:' && u.port === '3000' && /^[a-z0-9-]+\.(relay-upstreams|relay-store-m1)\.svc\.cluster\.local$/.test(u.hostname); if ((!internal && !allowed.includes(u.href)) || u.username || u.password || u.search || u.hash || !['http:', 'https:'].includes(u.protocol) || u.pathname !== '/mcp')
    throw new Rejection('DESTINATION_DENIED', 400); if (u.protocol === 'http:' && !/^[a-z0-9-]+\.(relay-upstreams|relay-store-m1)\.svc\.cluster\.local$/.test(u.hostname))
    throw new Rejection('DESTINATION_DENIED', 400); return u; }
export function isPublicAddress(ip: string) { if (ip.includes(':'))
    return false; const b = ip.split('.').map(Number); return b.length === 4 && b.every(n => n >= 0 && n <= 255) && !([0, 10, 127].includes(b[0]!) || b[0]! >= 224 || (b[0] === 169 && b[1] === 254) || (b[0] === 172 && b[1]! >= 16 && b[1]! <= 31) || (b[0] === 192 && b[1] === 168) || (b[0] === 100 && b[1]! >= 64 && b[1]! <= 127) || (b[0] === 198 && [18, 19, 51].includes(b[1]!)) || (b[0] === 203 && b[1] === 0) || (b[0] === 192 && b[1] === 0)); }
// Bind each HTTP connection to the resolved/validated address; never follow redirects.
export async function boundedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const u = destination(input instanceof Request ? input.url : String(input));
    const answers = await lookup(u.hostname, { all: true });
    if (!answers.length || answers.some(a => u.protocol === 'http:' ? !/^10\.43\./.test(a.address) : !isPublicAddress(a.address)))
        throw new Rejection('DESTINATION_ADDRESS_DENIED', 400);
    const headers = new Headers(init?.headers);
    headers.set('host', u.host);
    const signal = init?.signal;
    const body = init?.body;
    if (body && typeof body !== 'string')
        throw new Rejection('UNSUPPORTED_REQUEST_BODY', 400);
    return new Promise((resolve, reject) => {
        const r = (u.protocol === 'https:' ? https : http).request({ hostname: answers[0]!.address, servername: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)), path: u.pathname, method: init?.method ?? 'GET', headers: Object.fromEntries(headers), ...(signal ? { signal } : {}), timeout: 10000 }, res => {
            const h = new Headers();
            for (const [key, value] of Object.entries(res.headers))
                if (value !== undefined)
                    h.set(key, Array.isArray(value) ? value.join(',') : value);
            if ((res.statusCode ?? 500) >= 300 && (res.statusCode ?? 500) < 400) {
                res.resume();
                reject(new Rejection('UPSTREAM_REDIRECT_DENIED', 502));
                return;
            }
            let bytes = 0;
            const limiter = new Transform({ transform(chunk: Buffer, _encoding, cb) { bytes += chunk.length; if (bytes > 1048576)
                    cb(new Error('UPSTREAM_OUTPUT_LIMIT'));
                else
                    cb(null, chunk); } });
            res.on('error', e => limiter.destroy(e));
            res.pipe(limiter);
            resolve(new Response([204, 205, 304].includes(res.statusCode ?? 200) ? null : Readable.toWeb(limiter) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 500, headers: h }));
        });
        r.on('timeout', () => r.destroy(new Error('UPSTREAM_TIMEOUT')));
        r.on('error', reject);
        r.end(body ?? undefined);
    });
}
