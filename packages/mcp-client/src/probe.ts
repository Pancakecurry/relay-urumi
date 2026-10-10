import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function probe(url: string, secret: string, mode: 'auto' | 'legacy' = 'auto') {
  const wire: { method: string; protocol: string | null; status: number; sessionIssued: boolean }[] = [];
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      let method = init?.method ?? 'GET';
      if (typeof init?.body === 'string') {
        const parsed = JSON.parse(init.body) as { method?: string };
        method = parsed.method ?? method;
      }
      wire.push({ method, protocol: new Headers(init?.headers).get('MCP-Protocol-Version'), status: response.status,
        sessionIssued: response.headers.has('mcp-session-id') });
      return response;
    }
  });
  const client = new Client({ name: 'relay-m0-official-client', version: '0.0.0' }, { versionNegotiation: { mode } });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    if (!catalog.tools.some(tool => tool.name === 'ping')) throw new Error('ping tool missing');
    const result = await client.callTool({ name: 'ping', arguments: { message: `relay-${mode}-ingress` } });
    if (result.isError) throw new Error('ping returned a tool error');
    return { mode, era: client.getDiscoverResult() ? 'modern' : 'legacy', server: client.getServerVersion(), catalog, result, wire };
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secretPath = process.env['M0_SECRET_FILE'] ?? '.local/m0-token';
  const secret = readFileSync(secretPath, 'utf8').trim();
  for (const mode of ['auto', 'legacy'] as const) console.log(JSON.stringify(await probe(process.env['MCP_URL'] ?? 'http://127.0.0.1:18080/mcp', secret, mode), null, 2));
}
