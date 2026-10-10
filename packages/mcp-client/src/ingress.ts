import { request } from 'node:http';
import { Readable } from 'node:stream';
// Local-only external client adapter: preserve the canonical Ingress Host while dialing loopback.
export const ingressFetch: typeof fetch = async (input, init) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    headers.set('host', u.host);
    return new Promise((resolve, reject) => { const r = request({ hostname: '127.0.0.1', port: 18080, path: u.pathname + u.search, method: init?.method ?? 'GET', headers: Object.fromEntries(headers), ...(init?.signal ? { signal: init.signal } : {}) }, res => { const h = new Headers(); for (let i = 0; i < res.rawHeaders.length; i += 2)
        h.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!); resolve(new Response([204, 205, 304].includes(res.statusCode ?? 200) ? null : Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 500, headers: h })); }); r.on('error', reject); r.setTimeout(15000, () => r.destroy(new Error('Ingress response deadline exceeded'))); if (init?.body && typeof init.body !== 'string') {
        reject(new Error('Unsupported test request body'));
        r.destroy();
        return;
    } r.end(init?.body ?? undefined); });
};
