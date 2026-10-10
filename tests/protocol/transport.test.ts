import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProofApp } from '../../apps/gateway/src/proof-server.js';
import { probe } from '../../packages/mcp-client/src/probe.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const secret = randomBytes(32).toString('hex');
const app = createProofApp(secret);
let url: string;
beforeAll(async () => { url = `${await app.listen({host:'127.0.0.1',port:0})}/mcp`; });
afterAll(async () => { await app.close(); });
describe('real loopback Streamable HTTP (not a mocked MCP transport)', () => {
  it.each(['auto', 'legacy'] as const)('discovers and calls ping in %s mode', async mode => {
    const result = await probe(url, secret, mode);
    expect(result.result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text', text: expect.stringContaining(`relay-${mode}-ingress`) })]));
    expect(result.wire.some(request => request.method === 'tools/call')).toBe(true);
    expect(result.era).toBe(mode === 'auto' ? 'modern' : 'legacy');
  });
  it('rejects missing and invalid credentials before tool handling', async () => {
    for (const authorization of ['', 'Bearer wrong', `Bearer ${'é'.repeat(64)}`]) {
      const response = await fetch(url, {method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
      expect(response.status).toBe(401);
    }
  });
  it('rejects malformed tool input with a real client', async () => {
    const client = new Client({name:'invalid-input-proof',version:'0.0.0'});
    await client.connect(new StreamableHTTPClientTransport(new URL(url), {requestInit:{headers:{Authorization:`Bearer ${secret}`}}}));
    try { const result = await client.callTool({name:'ping',arguments:{message:''}}); expect(result.isError).toBe(true); }
    finally { await client.close(); }
  });
  it('rejects an unapproved Host and Origin', async () => {
    const response = await app.inject({method:'POST',url:'/mcp',headers:{host:'malicious.invalid',authorization:`Bearer ${secret}`}});
    expect(response.statusCode).toBe(403);
    const origin = await app.inject({method:'POST',url:'/mcp',headers:{host:'localhost',origin:'https://malicious.invalid',authorization:`Bearer ${secret}`,'content-type':'application/json'},payload:{jsonrpc:'2.0',id:1,method:'tools/list'}});
    expect(origin.statusCode).toBe(403);
  });
});
