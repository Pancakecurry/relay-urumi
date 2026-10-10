import { mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { arch, platform } from 'node:os';
import './local-cache.mjs';
if (platform() !== 'darwin' || arch() !== 'arm64') throw new Error('This pinned bootstrap currently supports macOS arm64 only; see versions.md');
await mkdir('.tools/bin', { recursive: true });
async function download(url, path) {
  const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
async function verify(path, expected) {
  const digest = createHash('sha256').update(await readFile(path)).digest('hex');
  if (digest !== expected) throw new Error(`Checksum mismatch: ${path}`);
  console.log(JSON.stringify({ path, sha256: digest }));
}
await download('https://github.com/k3d-io/k3d/releases/download/v5.9.0/checksums.txt', '.tools/k3d-checksums.txt');
await download('https://github.com/k3d-io/k3d/releases/download/v5.9.0/k3d-darwin-arm64', '.tools/bin/k3d');
const sum = (await readFile('.tools/k3d-checksums.txt', 'utf8')).split('\n').find(line => line.trim().endsWith('k3d-darwin-arm64'))?.split(/\s+/)[0];
if (!sum) throw new Error('No k3d checksum');
await verify('.tools/bin/k3d', sum); await chmod('.tools/bin/k3d', 0o755);
await download('https://get.helm.sh/helm-v4.3.0-darwin-arm64.tar.gz', '.tools/helm.tar.gz');
await download('https://get.helm.sh/helm-v4.3.0-darwin-arm64.tar.gz.sha256sum', '.tools/helm.sha256');
await verify('.tools/helm.tar.gz', (await readFile('.tools/helm.sha256', 'utf8')).split(/\s+/)[0]);
execFileSync('tar', ['-xzf', '.tools/helm.tar.gz', '-C', '.tools']);
await writeFile('.tools/bin/helm', await readFile('.tools/darwin-arm64/helm')); await chmod('.tools/bin/helm', 0o755);
await download('https://dl.k8s.io/release/v1.37.1/bin/darwin/arm64/kubectl', '.tools/bin/kubectl');
await download('https://dl.k8s.io/release/v1.37.1/bin/darwin/arm64/kubectl.sha256', '.tools/kubectl.sha256');
await verify('.tools/bin/kubectl', (await readFile('.tools/kubectl.sha256', 'utf8')).trim());
await chmod('.tools/bin/kubectl', 0o755);
