import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const hash = createHash('sha256');
for (const file of ['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','.npmrc','tsconfig.json','apps/gateway/package.json','apps/gateway/Dockerfile','apps/gateway/src/proof-server.ts','packages/mcp-client/package.json','packages/mcp-client/src/probe.ts']) {
  hash.update(file); hash.update(readFileSync(file));
}
console.log(`m0-${hash.digest('hex').slice(0,16)}`);
