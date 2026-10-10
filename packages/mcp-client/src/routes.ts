import { createHash } from 'node:crypto';
// Pure route-table preparation used by M2's acceptance client; production aggregation is M3.
export function routes(upstreams: { id: string; tools: { name: string }[] }[]) {
  const table = new Map<string, { upstreamId: string; toolName: string }>();
  const identities = new Set<string>();
  for (const upstream of upstreams) {
    if (identities.has(upstream.id)) throw new Error('Duplicate upstream identity');
    identities.add(upstream.id);
    for (const tool of upstream.tools) {
      const alias = `t_${createHash('sha256').update(upstream.id).update('\0').update(tool.name).digest('base64url')}`;
      if (table.has(alias)) throw new Error('Duplicate or colliding route');
      table.set(alias, { upstreamId: upstream.id, toolName: tool.name });
    }
  }
  return table;
}
