import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from 'vitest';
import { ingressFetch } from '../../packages/mcp-client/src/ingress.js';

test('local client dials the requested Ingress port while preserving canonical host and origin', async () => {
    const server = createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, path: req.url }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const port = (server.address() as AddressInfo).port;
        const origin = `http://relay.localhost:${port}`;
        const response = await ingressFetch(`${origin}/api/teams?test=port`, { headers: { origin } });
        expect(await response.json()).toEqual({ host: `relay.localhost:${port}`, origin, path: '/api/teams?test=port' });
        await expect(ingressFetch('ftp://relay.localhost/api/teams')).rejects.toThrow('URL denied');
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
