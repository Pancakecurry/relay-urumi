import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
const violations = [];
const username = homedir().split('/').filter(Boolean).at(-1);
function inspect(text, file) {
  if (/\/Users\/[^/\s"<>]+/.test(text)) violations.push({ file, reason: 'Workstation home path' });
  if (username && username.length >= 6 && text.toLowerCase().includes(username.toLowerCase())) violations.push({ file, reason: 'Local workstation identifier' });
  for (const match of text.matchAll(/[A-Za-z0-9_.+%-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    const domain = match[1].toLowerCase();
    if (!/(?:^|\.)(?:example\.(?:com|org|net|test|invalid)|test|invalid|localhost|cluster\.local)$/.test(domain)) violations.push({ file, reason: 'Non-synthetic email address' });
  }
}
for (const file of files) {
  if (/(?:^|\/)(?:delivery|private-release-materials|\.local|\.tools|node_modules)(?:\/|$)|interview|handoff/i.test(file)) violations.push({ file, reason: 'Private preparation path' });
  if (lstatSync(file).isSymbolicLink()) { inspect(readlinkSync(file), file); continue; }
  const bytes = readFileSync(file);
  if (!bytes.includes(0)) inspect(bytes.toString('utf8'), file);
}
inspect(git(['log', '--all', '-p', '--format=%H%n%an <%ae>%n%cn <%ce>%n%B']), 'Reachable Git history');
const report = { filesChecked: files.length, historyChecked: true, personalValuesPrinted: false, violations, passed: violations.length === 0 };
mkdirSync('docs/evidence/publication', { recursive: true });
writeFileSync('docs/evidence/publication/privacy.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
