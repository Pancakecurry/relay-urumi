import { createMcpFastifyApp } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import * as z from 'zod/v4';

// M0 transport proof only. Team identity, aggregation and durable audit belong to M3.
export function createProofApp(secret: string) {
  if (secret.length < 32) throw new Error('M0 credential must have at least 32 characters');
  const app = createMcpFastifyApp({ host: '0.0.0.0', allowedHosts: ['127.0.0.1', 'localhost', 'relay.localhost', 'relay-m0-proof.relay-m0.svc.cluster.local'],
    allowedOrigins: ['127.0.0.1', 'localhost', 'relay.localhost'] });
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'relay-m0-proof', version: '0.0.0' });
    server.registerTool('ping', {
      description: 'Verify the real M0 Kubernetes MCP request path.',
      inputSchema: z.object({ message: z.string().min(1).max(256) })
    }, async ({ message }) => ({ content: [{ type: 'text', text: JSON.stringify({ pong: message, pod: hostname() }) }] }));
    return server;
  });
  const nodeHandler = toNodeHandler(handler);
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ok' }));
  app.all('/mcp', async (request, reply) => {
    const candidate = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    const authorized = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    if (!authorized) return reply.code(401).send({ error: 'Unauthorized' });
    reply.hijack();
    // Node declares method/url optional; a routed Fastify request has both.
    const raw = Object.assign(request.raw, { method: request.method, url: request.url });
    await nodeHandler(raw, reply.raw, request.body);
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secretPath = process.env['M0_SECRET_FILE'];
  if (!secretPath) throw new Error('M0_SECRET_FILE is required; no default credential exists');
  const app = createProofApp(readFileSync(secretPath, 'utf8').trim());
  await app.listen({ host: '0.0.0.0', port: 3000 });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
}
