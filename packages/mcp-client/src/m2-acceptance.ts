import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import * as z from 'zod/v4';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { routes } from './routes.js';
import { productSchema, orderSchema, pagination, infoSchema, currency, amount } from '../../contracts/src/domain.js';

const upstreams = [
  { id: 'store-0001', key: 'woo', url: 'http://relay-woocommerce.relay-store-m1.svc.cluster.local:3000/mcp', name: 'relay-woocommerce', count: 6 },
  { id: 'calendar-0001', key: 'calendar', url: 'http://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp', name: 'relay-calendar', count: 3 },
  { id: 'totals-0001', key: 'totals', url: 'http://relay-totals.relay-upstreams.svc.cluster.local:3000/mcp', name: 'relay-totals', count: 3 }
];
const evidence: Record<string, unknown>[] = [];
const clients = new Map<string, Client>();
async function rawStatus(url: string, headers: Record<string, string>) {
  return await new Promise<number>((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } }, response => {
      response.resume(); resolve(response.statusCode ?? 0);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Security probe timeout'))); req.on('error', reject); req.end('{}');
  });
}
async function call<T>(client: Client, name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const start = Date.now(); const r = await client.callTool({ name, arguments: args }, { timeout: 10000 });
  assert.notEqual(r.isError, true, `${name} returned a tool error: ${JSON.stringify(r.structuredContent)}`);
  const data = schema.parse(r.structuredContent);
  evidence.push({ tool: name, durationMs: Date.now() - start, data }); return data;
}
async function errorCall(client: Client, name: string, args: Record<string, unknown>, code?: string) {
  const r = await client.callTool({ name, arguments: args }, { timeout: 10000 }); assert.equal(r.isError, true);
  if (code) assert.equal(z.object({ error: z.object({ code: z.string() }) }).parse(r.structuredContent).error.code, code);
  evidence.push({ tool: name, negative: true, expectedCode: code ?? 'SDK input validation', isError: true, ...(code ? { data: r.structuredContent } : {}) });
}
try {
  const catalogs = [];
  for (const u of upstreams) {
    const token = readFileSync(`/secrets/${u.key}`, 'utf8').trim();
    const wire: Record<string, unknown>[] = [];
    const observedFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      wire.push({ method: init?.method, protocol: new Headers(init?.headers).get('MCP-Protocol-Version'), status: response.status, sessionIssued: response.headers.has('Mcp-Session-Id') });
      return response;
    };
    const client = new Client({ name: 'relay-m2-acceptance', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } });
    await client.connect(new StreamableHTTPClientTransport(new URL(u.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: observedFetch }));
    clients.set(u.id, client);
    const catalog = await client.listTools(); assert.equal(catalog.tools.length, u.count);
    assert(catalog.tools.every(tool => tool.inputSchema['additionalProperties'] === false && tool.outputSchema));
    catalogs.push({ id: u.id, tools: catalog.tools });
    const info = await call(client, 'info', {}, infoSchema); assert.equal(info.service, u.name);
    evidence.push({ upstream: u.id, catalog: catalog.tools, wire });
    const legacy = new Client({ name: 'relay-m2-legacy', version: '0.0.0' }, { versionNegotiation: { mode: 'legacy' } });
    await legacy.connect(new StreamableHTTPClientTransport(new URL(u.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: observedFetch }));
    assert.equal((await call(legacy, 'info', {}, infoSchema)).service, u.name);
    await legacy.close();
    for (const [label, headers, suffix, status] of [
      ['bad-token', { Authorization: `Bearer ${'f'.repeat(64)}` }, '', 401],
      ['forged-host', { Authorization: `Bearer ${token}`, Host: 'evil.invalid' }, '', 403],
      ['forged-origin', { Authorization: `Bearer ${token}`, Origin: 'https://evil.invalid' }, '', 403],
      ['trailing-slash', { Authorization: `Bearer ${token}` }, '/', 404]
    ] as const) {
      const actual = await rawStatus(u.url + suffix, headers);
      assert.equal(actual, status, `${u.id}: ${label}`); evidence.push({ upstream: u.id, securityCase: label, status: actual });
    }
    // Fresh connection after close; there is no reusable authenticated server session.
    const reconnect = new Client({ name: 'relay-reconnect', version: '0.0.0' });
    await reconnect.connect(new StreamableHTTPClientTransport(new URL(u.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    await call(reconnect, 'info', {}, infoSchema); await reconnect.close();
  }
  const table = routes(catalogs); assert.equal(table.size, 12);
  const infoRoutes = [...table].filter(([, route]) => route.toolName === 'info'); assert.equal(infoRoutes.length, 3);
  assert.equal(new Set(infoRoutes.map(([alias]) => alias)).size, 3);
  for (const [alias, route] of infoRoutes) {
    assert(alias.length <= 64);
    const c = clients.get(route.upstreamId); assert(c);
    const info = await call(c, route.toolName, {}, infoSchema);
    assert.equal(info.service, upstreams.find(u => u.id === route.upstreamId)?.name);
  }
  evidence.push({ collision: 'info', routed: infoRoutes });
  const woo = clients.get('store-0001'); const calendar = clients.get('calendar-0001'); const totals = clients.get('totals-0001'); assert(woo && calendar && totals);
  const products = z.strictObject({ products: z.array(productSchema), pagination });
  const page1 = await call(woo, 'list_products', { per_page: 1 }, products); assert(page1.pagination.total >= 2); assert.equal(page1.pagination.next_page, 2);
  const page2 = await call(woo, 'list_products', { per_page: 1, page: 2 }, products); assert.notEqual(page1.products[0]?.id, page2.products[0]?.id);
  const sku = `RELAY-M2-${randomUUID()}`;
  const created = await call(woo, 'create_product', { name: 'Synthetic Demo — M2 Protocol Product', sku, regular_price: '12.30' }, z.strictObject({ product: productSchema }));
  assert.equal(created.product.regular_price, '12.30'); assert.equal(created.product.status, 'publish'); assert.equal(created.product.catalog_visibility, 'visible');
  assert.equal((await call(woo, 'list_products', { sku }, products)).products[0]?.id, created.product.id);
  await errorCall(woo, 'create_product', { name: 'Synthetic Duplicate', sku, regular_price: '12.30' }, 'UPSTREAM_REJECTED');
  await errorCall(woo, 'create_product', { name: 'Invalid precision', sku: 'RELAY-M2-INVALID', regular_price: '1.001' }, 'INVALID_AMOUNT');
  const singleOrder = z.strictObject({ order: orderSchema });
  const fixtureIds: number[] = z.array(z.number().int().positive()).length(3).parse(JSON.parse(process.env['M2_ORDER_IDS'] ?? '[]'));
  const firstId = fixtureIds[0]; assert(firstId);
  const original = await call(woo, 'get_order', { order_id: firstId }, singleOrder);
  try {
    const changed = await call(woo, 'update_order_status', { order_id: firstId, status: 'completed' }, singleOrder); assert.equal(changed.order.status, 'completed');
    assert.equal((await call(woo, 'get_order', { order_id: firstId }, singleOrder)).order.status, 'completed');
  } finally { await call(woo, 'update_order_status', { order_id: firstId, status: original.order.status }, singleOrder); }
  const rangeSchema = z.strictObject({ date: z.string(), timezone: z.string(), start_inclusive: z.string(), end_exclusive: z.string(), seconds: z.number() });
  const range = await call(calendar, 'day_range', { timezone: 'Asia/Kolkata', date: '2026-10-10' }, rangeSchema); assert.equal(range.seconds, 86400);
  await call(calendar, 'now', { timezone: 'Asia/Kolkata' }, z.strictObject({ instant: z.string(), local: z.string(), timezone: z.string() }));
  assert.equal((await call(calendar, 'day_range', { timezone: 'America/New_York', date: '2026-03-08' }, rangeSchema)).seconds, 82800);
  assert.equal((await call(calendar, 'day_range', { timezone: 'America/New_York', date: '2026-11-01' }, rangeSchema)).seconds, 90000);
  await errorCall(calendar, 'day_range', { timezone: 'Pacific/Apia', date: '2011-12-30' }, 'NONEXISTENT_LOCAL_DATE');
  const ordersOutput = z.strictObject({ orders: z.array(orderSchema), pagination });
  const collected = []; let page: number | null = 1;
  while (page !== null) {
    assert(page <= 100); const r: z.infer<typeof ordersOutput> = await call(woo, 'list_orders', { per_page: 1, page, after: range.start_inclusive, before: range.end_exclusive }, ordersOutput);
    collected.push(...r.orders); page = r.pagination.next_page;
  }
  assert(collected.some(o => o.id === fixtureIds[0]), 'midnight must be included');
  assert(collected.some(o => o.id === fixtureIds[1]), 'last second must be included');
  assert(!collected.some(o => o.id === fixtureIds[2]), 'next midnight must be excluded');
  const totalsOutput = z.strictObject({ currency, total: amount, minor_units: z.string(), count: z.number() });
  assert.equal((await call(totals, 'sum_amounts', { currency: 'INR', amounts: ['0.10', '0.20'] }, totalsOutput)).total, '0.30');
  const sum = await call(totals, 'sum_orders', { currency: 'INR', orders: collected.map(o => ({ id: o.id, currency: o.currency, total: o.total })) }, totalsOutput);
  assert.equal(sum.count, collected.length);
  await errorCall(totals, 'sum_orders', { currency: 'INR', orders: [{ id: 1, currency: 'USD', total: '1.00' }] }, 'MIXED_CURRENCIES');
  await errorCall(totals, 'sum_orders', { currency: 'INR', orders: [{ id: 1, currency: 'INR', total: '1' }, { id: 1, currency: 'INR', total: '1' }] }, 'DUPLICATE_ORDER');
  await errorCall(totals, 'sum_amounts', { currency: 'JPY', amounts: ['1.01'] }, 'INVALID_AMOUNT');
  await errorCall(woo, 'get_order', { order_id: 999999999 }, 'NOT_FOUND');
  for (const [c, tool, args] of [[woo, 'list_products', { per_page: 101 }], [woo, 'get_order', { order_id: -1 }],
    [woo, 'update_order_status', { order_id: firstId, status: 'invented' }], [calendar, 'day_range', { timezone: 'bad-zone' }],
    [totals, 'sum_amounts', { currency: 'INR', amounts: [0.1] }], [woo, 'info', { extra: true }],
    [woo, 'list_orders', { after: range.end_exclusive, before: range.start_inclusive }]] as const) await errorCall(c, tool, args);
  const parallel = await Promise.all([call(woo, 'info', {}, infoSchema), call(calendar, 'info', {}, infoSchema), call(totals, 'info', {}, infoSchema)]);
  assert.equal(parallel.length, 3);
  console.log(JSON.stringify({ at: new Date().toISOString(), passed: true, fixtureIds, productId: created.product.id, evidence,
    limitation: 'Privileged gateway-labelled acceptance fixture; no M3 production gateway or M4 autonomous LLM prompt is claimed.' }));
} finally { await Promise.all([...clients.values()].map(c => c.close())); }
