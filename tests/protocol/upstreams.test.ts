import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { WooRest, oauthHeader, type StoreConfig } from '../../apps/woocommerce-mcp/src/rest.js';
import { calendarApp } from '../../apps/calendar-mcp/src/server.js';
import { totalsApp } from '../../apps/totals-mcp/src/server.js';
import { decimal, minor, dayRange } from '../../packages/contracts/src/domain.js';
import { routes } from '../../packages/mcp-client/src/routes.js';
import { guarded } from '../../packages/mcp-runtime/src/server.js';

const testConfig = (url: string): StoreConfig => ({ canonicalUrl: url, connectionUrl: url, consumerKey: `ck_${'1'.repeat(40)}`,
  consumerSecret: `cs_${'2'.repeat(40)}`, currency: 'INR', timezone: 'Asia/Kolkata', timeoutMs: 150 });
describe('exact domain behavior', () => {
  it('preserves large amounts, negative amounts and currency-specific precision', () => {
    expect(decimal(minor('999999999999999999.99', 'INR') + minor('0.01', 'INR'), 'INR')).toBe('1000000000000000000.00');
    expect(decimal(minor('-0.20', 'INR') + minor('0.10', 'INR'), 'INR')).toBe('-0.10');
    expect(decimal(minor('1.123', 'KWD'), 'KWD')).toBe('1.123'); expect(decimal(minor('20', 'JPY'), 'JPY')).toBe('20');
    expect(() => minor('0.001', 'INR')).toThrow('INVALID_AMOUNT'); expect(() => minor('1e2', 'USD')).toThrow();
  });
  it('converts India, DST, invalid and skipped calendar days', () => {
    expect(dayRange('2026-10-10', 'Asia/Kolkata').start_inclusive).toBe('2026-10-09T18:30:00Z');
    expect(dayRange('2026-03-08', 'America/New_York').seconds).toBe(82800);
    expect(dayRange('2026-11-01', 'America/New_York').seconds).toBe(90000);
    expect(() => dayRange('2026-02-30', 'UTC')).toThrow();
    expect(() => dayRange('2011-12-30', 'Pacific/Apia')).toThrow('NONEXISTENT_LOCAL_DATE');
  });
  it('routes identical and long names by immutable identity without parsing aliases', () => {
    const table = routes([{ id: 'a', tools: [{ name: 'info' }, { name: 'x'.repeat(200) }] }, { id: 'b', tools: [{ name: 'info' }] }]);
    expect(table.size).toBe(3); expect([...table.keys()].every(k => k.length <= 64)).toBe(true);
    expect([...table.values()].filter(r => r.toolName === 'info').map(r => r.upstreamId)).toEqual(['a', 'b']);
    expect(() => routes([{ id: 'a', tools: [{ name: 'info' }, { name: 'info' }] }])).toThrow();
    expect(() => routes([{ id: 'a', tools: [] }, { id: 'a', tools: [] }])).toThrow();
  });
  it('sanitizes unexpected output failures and keeps write uncertainty explicit', async () => {
    const fail = async () => { throw new Error('PRIVATE_PROVIDER_SECRET'); };
    expect(JSON.stringify(await guarded(fail))).not.toContain('PRIVATE_PROVIDER_SECRET');
    expect((await guarded(fail)).structuredContent).toMatchObject({ error: { outcome: 'not_executed' } });
    expect((await guarded(fail, true)).structuredContent).toMatchObject({ error: { outcome: 'unknown', retryable: false } });
  });
});
describe('actual local HTTP failure fixtures (isolated from production)', () => {
  it('uses a valid Woo OAuth HMAC signature, including escaped query parameters', () => {
    const url = new URL('http://store.test/wp-json/wc/v3/products?sku=A+B&per_page=1');
    const cfg = testConfig(url.origin); const header = oauthHeader('GET', url, cfg.consumerKey, cfg.consumerSecret);
    const values = Object.fromEntries(header.slice(6).split(', ').map(item => { const [k, v] = item.split('='); return [k!, decodeURIComponent(v!.slice(1, -1))]; }));
    const signature = values['oauth_signature']; delete values['oauth_signature'];
    const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const pairs = [...url.searchParams, ...Object.entries(values)].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0]! + '\0' + a[1]!).localeCompare(b[0]! + '\0' + b[1]!, 'en', { sensitivity: 'variant' }));
    const base = ['GET', enc(url.origin + url.pathname), enc(pairs.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
    expect(signature).toBe(createHmac('sha256', `${cfg.consumerSecret}&`).update(base).digest('base64'));
    expect(header).not.toContain(cfg.consumerSecret);
  });
  it('bounds slow calls, propagates cancellation, sanitizes errors, refuses redirects and limits response bytes', async () => {
    let mode = 'timeout'; let count = 0;
    const server = createServer((_req, res) => {
      count++;
      if (mode === 'timeout') return;
      if (mode === 'slow-body') { res.writeHead(200); res.write('{'); return; }
      if (mode === 'redirect') { res.writeHead(302, { Location: 'http://evil.invalid' }); res.end(); return; }
      if (mode === 'large') { res.end('x'.repeat(1_048_577)); return; }
      if (mode === 'json') { res.end('{invalid'); return; }
      res.writeHead(Number(mode)); res.end(JSON.stringify({ message: 'SECRET_FROM_PROVIDER' }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
    const rest = new WooRest(testConfig(`http://127.0.0.1:${address.port}`));
    try {
      const start = Date.now(); await expect(rest.call('GET', 'products')).rejects.toMatchObject({ code: 'TIMEOUT', outcome: 'not_executed', retryable: true }); expect(Date.now() - start).toBeLessThan(1000);
      await expect(rest.call('POST', 'products', {}, { name: 'fixture' })).rejects.toMatchObject({ code: 'TIMEOUT', outcome: 'unknown', retryable: false });
      mode = 'slow-body'; await expect(rest.call('GET', 'products')).rejects.toMatchObject({ code: 'TIMEOUT' }); mode = 'timeout';
      const controller = new AbortController(); const pending = rest.call('GET', 'orders', {}, undefined, controller.signal); controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
      for (const [m, code] of [['401', 'UPSTREAM_AUTH'], ['404', 'NOT_FOUND'], ['429', 'UPSTREAM_RATE_LIMIT'], ['503', 'UPSTREAM_UNAVAILABLE'], ['redirect', 'UPSTREAM_REJECTED'], ['json', 'UPSTREAM_INVALID_RESPONSE'], ['large', 'RESPONSE_TOO_LARGE']]) {
        mode = m!; await expect(rest.call('GET', 'products')).rejects.toMatchObject({ code });
      }
      expect(count).toBeLessThanOrEqual(11); // no automatic retries, including failed writes
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });
});
describe('real utility SDK transport', () => {
  for (const [name, create] of [['calendar', calendarApp], ['totals', totalsApp]] as const) {
    it(`${name}: strict schemas, output schemas, modern/legacy transport`, async () => {
      const app = create('a'.repeat(64)); const url = await app.listen({ host: '127.0.0.1', port: 0 });
      try {
        for (const mode of ['auto', 'legacy'] as const) {
          const client = new Client({ name: 'unit-client', version: '0.0.0' }, { versionNegotiation: { mode } });
          try {
            await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${'a'.repeat(64)}` } } }));
            expect((await client.listTools()).tools).toHaveLength(3);
            expect((await client.callTool({ name: 'info', arguments: {} })).isError).not.toBe(true);
            expect((await client.callTool({ name: 'info', arguments: { extra: true } })).isError).toBe(true);
            if (name === 'totals') expect((await client.callTool({ name: 'sum_amounts', arguments: { currency: 'INR', amounts: ['0.10', '0.20'] } })).structuredContent).toMatchObject({ total: '0.30' });
          } finally { await client.close(); }
        }
      } finally { await app.close(); }
    });
  }
});
