import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import * as z from 'zod/v4';
const clients: Client[] = [];
const observations: Record<string, unknown>[] = [];
try {
  for (const [key, url] of [['woo', 'http://relay-woocommerce.relay-store-m1.svc.cluster.local:3000/mcp'],
    ['calendar', 'http://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp'], ['totals', 'http://relay-totals.relay-upstreams.svc.cluster.local:3000/mcp']]) {
    const c = new Client({ name: 'relay-m2-fault', version: '0.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(url!), { requestInit: { headers: { Authorization: `Bearer ${readFileSync(`/secrets/${key}`, 'utf8').trim()}` } } }));
    await c.listTools(); clients.push(c);
  }
  const [woo, calendar, totals] = clients; assert(woo && calendar && totals);
  const start = Date.now();
  const stuck = woo.callTool({ name: 'list_products', arguments: {} }, { timeout: 10000 });
  const healthy = await Promise.all([calendar.callTool({ name: 'info', arguments: {} }), totals.callTool({ name: 'sum_amounts', arguments: { currency: 'INR', amounts: ['0.1', '0.2'] } })]);
  const healthyMs = Date.now() - start; assert(healthy.every(r => r.isError !== true)); assert(healthyMs < 2000);
  observations.push({ case: 'healthy utilities during blocked Woo REST', durationMs: healthyMs, results: healthy.map(r => r.structuredContent) });
  const failure = await stuck; assert.equal(failure.isError, true);
  const error = z.object({ error: z.object({ code: z.string(), retryable: z.boolean(), outcome: z.string() }) }).parse(failure.structuredContent).error;
  assert(['TIMEOUT', 'UPSTREAM_UNAVAILABLE'].includes(error.code ?? '')); assert.equal(error.retryable, true); assert.equal(error.outcome, 'not_executed');
  assert(Date.now() - start < 10000);
  observations.push({ case: 'real production REST network rejection', durationMs: Date.now() - start, result: failure.structuredContent });
  // Same real adapter image in an isolated fault pod: TCP to an unused pod-subnet
  // address hangs instead of K3s NetworkPolicy's immediate ICMP rejection. No fake results.
  const slow = new Client({ name: 'relay-m2-timeout', version: '0.0.0' }); clients.push(slow);
  const url = process.env['M2_TIMEOUT_URL']; assert(url);
  await slow.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${readFileSync('/secrets/woo', 'utf8').trim()}` } } }));
  await slow.listTools(); const timeoutStart = Date.now();
  const timedOut = await slow.callTool({ name: 'list_products', arguments: {} }, { timeout: 10000 });
  assert.equal(timedOut.isError, true);
  assert.deepEqual(timedOut.structuredContent, { error: { code: 'TIMEOUT', retryable: true, outcome: 'not_executed' } });
  const timeoutMs = Date.now() - timeoutStart; assert(timeoutMs >= 450 && timeoutMs < 2000);
  observations.push({ case: 'deployed adapter 500ms deadline to unused cluster IP (isolated fault configuration)', durationMs: timeoutMs, result: timedOut.structuredContent });
  const controller = new AbortController(); const cancelStart = Date.now();
  const pending = slow.callTool({ name: 'list_orders', arguments: {} }, { timeout: 10000, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 100);
  try { await assert.rejects(pending); } finally { clearTimeout(timer); }
  assert(Date.now() - cancelStart < 2000);
  observations.push({ case: 'modern MCP client cancellation', durationMs: Date.now() - cancelStart, rejected: true,
    limitation: 'Client cancellation and direct REST abort are tested; no distributed tracing claim.' });
  assert.notEqual((await woo.callTool({ name: 'info', arguments: {} })).isError, true);
  console.log(JSON.stringify({ at: new Date().toISOString(), passed: true, observations }));
} finally { await Promise.all(clients.map(c => c.close())); }
