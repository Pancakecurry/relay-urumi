import { createMcpFastifyApp } from '@modelcontextprotocol/fastify';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import * as z from 'zod/v4';
import { DomainError, empty, infoSchema } from '../../contracts/src/domain.js';

export function result<T extends Record<string, unknown>>(schema: z.ZodType<T>, value: T) {
  const data = schema.parse(value);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data };
}
export async function guarded(call: () => Promise<ReturnType<typeof result>>, write = false) {
  try { return await call(); } catch (error) {
    const e = error instanceof DomainError ? error : new DomainError('UPSTREAM_INVALID_RESPONSE', false, write ? 'unknown' : 'not_executed');
    const data = { error: { code: e.code, retryable: e.retryable, outcome: e.outcome, ...(e.status ? { status: e.status } : {}) } };
    // Error bodies deliberately omit upstream messages, URLs, stacks and credentials.
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data };
  }
}
export function createApp(name: string, secret: string, hosts: string[], register: (server: McpServer) => void) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('A separately generated upstream credential is required');
  const app = createMcpFastifyApp({ host: '0.0.0.0', allowedHosts: hosts, allowedOrigins: ['localhost', '127.0.0.1'] });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/mcp') && Number(request.headers['content-length'] ?? 0) > 262144)
      return reply.code(413).send({ error: 'Request too large' });
  });
  const handler = toNodeHandler(createMcpHandler(() => {
    const server = new McpServer({ name, version: '0.0.0' });
    server.registerTool('info', { description: `Identify the independent ${name} upstream.`, inputSchema: empty,
      outputSchema: infoSchema, annotations: { readOnlyHint: true, openWorldHint: false } },
    async () => result(infoSchema, { service: name, version: '0.0.0', purpose: 'Private Relay MCP upstream' }));
    register(server); return server;
  }));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ok' }));
  app.all('/mcp', { bodyLimit: 262144 }, async (request, reply) => {
    const actual = Buffer.from(request.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply.code(401).send({ error: 'Unauthorized' });
    reply.hijack();
    await handler(Object.assign(request.raw, { method: request.method, url: request.url }), reply.raw, request.body);
  });
  return app;
}
export function runtimeConfig() {
  const file = process.env['MCP_SECRET_FILE']; const host = process.env['MCP_SERVICE_HOST'];
  if (!file || !host) throw new Error('MCP_SECRET_FILE and MCP_SERVICE_HOST are required');
  return { secret: readFileSync(file, 'utf8').trim(), hosts: ['localhost', '127.0.0.1', host, `${host}.${process.env['POD_NAMESPACE']}.svc.cluster.local`] };
}
export async function listen(app: ReturnType<typeof createApp>) {
  await app.listen({ host: '0.0.0.0', port: 3000 });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
}
