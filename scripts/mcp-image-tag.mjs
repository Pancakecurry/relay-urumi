import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const h=createHash('sha256');
const visit=dir=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).forEach(entry=>{
  const path=`${dir}/${entry.name}`;
  if(entry.isDirectory()&&entry.name!=='node_modules')visit(path);
  else if(entry.isFile()&&((entry.name.endsWith('.ts')||entry.name.endsWith('.sql'))||entry.name==='package.json'||entry.name==='Dockerfile'))h.update(path).update(readFileSync(path));
});
for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','tsconfig.json'])h.update(file).update(readFileSync(file));
for(const dir of ['apps','packages'])visit(dir);
console.log(`m2-${h.digest('hex').slice(0,16)}`);
