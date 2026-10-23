import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
function markdown(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? markdown(directory + '/' + entry.name) : entry.name.endsWith('.md') ? [directory + '/' + entry.name] : []);
}
const files = ['README.md', 'AGENTS.md', ...markdown('docs')], issues = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:https?:|mailto:|app:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) issues.push({ file, reason: 'Missing documentation link', target });
  }
  for (const match of source.matchAll(/\bscripts\/[\w.-]+\.(?:mjs|sh)\b/g)) if (!existsSync(match[0])) issues.push({ file, reason: 'Missing script', target: match[0] });
}
const ledger = readFileSync('docs/REQUIREMENTS.md', 'utf8'), inventory = readFileSync('docs/release/FEATURE_INVENTORY.md', 'utf8');
const ids = new Set([...ledger.matchAll(/^\| ([KWGTUAEBDS]\d\d|C\d{1,2}) \|/gm)].map(match => match[1]));
if (ids.size !== 61) issues.push({ reason: 'Requirement inventory must retain 51 requirements and 10 expansion gates' });
for (const id of ids) if (!inventory.includes('| ' + id + ' |')) issues.push({ reason: 'Missing inventory ID', id });
const report = { documents: files.length, requirementIDs: ids.size, issues, passed: issues.length === 0 };
writeFileSync('docs/evidence/publication/documentation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!report.passed) process.exitCode = 1;
