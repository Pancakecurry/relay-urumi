import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, symlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
// Keep executable downloads/dependency trees out of macOS synced Documents.
const id = createHash('sha256').update(process.cwd()).digest('hex').slice(0,12);
const base = platform() === 'darwin' ? join(homedir(),'Library','Caches',`relay-${id}`) : join(homedir(),'.cache',`relay-${id}`);
for (const name of ['.tools','node_modules']) {
  let existing;
  try { existing = lstatSync(name); } catch (error) { if(error.code !== 'ENOENT') throw error; }
  if(existing) {
    if(existing.isSymbolicLink()) continue;
    throw new Error(`${name} already exists as a directory; preserve it and review migration instead of replacing it automatically`);
  }
  const target=join(base,name === '.tools' ? 'tools' : name);
  mkdirSync(target,{recursive:true});symlinkSync(target,name,'dir');
}
console.log('Project runtime/dependency links prepared; existing links preserved.');
