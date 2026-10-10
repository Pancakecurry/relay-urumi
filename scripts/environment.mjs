import { execFileSync } from 'node:child_process';
import { cpus, totalmem, freemem, platform, arch } from 'node:os';
import { statfsSync } from 'node:fs';
function run(command, args) { try { return execFileSync(command, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (error) { return { error: error.message.split('\n')[0] }; } }
const disk = statfsSync('.');
const dockerRaw = run('docker', ['info', '--format', '{{json .}}']);
const docker = typeof dockerRaw === 'string' ? JSON.parse(dockerRaw) : dockerRaw;
console.log(JSON.stringify({ at: new Date().toISOString(), platform: platform(), architecture: arch(), cpus: cpus().length,
  ramBytes: totalmem(), availableRamBytes: freemem(), freeDiskBytes: disk.bavail * disk.bsize,
  node: process.version, pnpm: run('pnpm', ['--version']),
  docker: { version: docker.ServerVersion, cpus: docker.NCPU, memoryBytes: docker.MemTotal, containers: docker.Containers, images: docker.Images, error: docker.error },
  tools: { k3d: run('.tools/bin/k3d', ['version']), helm: run('.tools/bin/helm', ['version', '--short']), kubectl: run('.tools/bin/kubectl', ['version', '--client', '-o', 'json']) }
}, null, 2));
