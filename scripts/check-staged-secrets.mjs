import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const git = args => execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const files=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean);
const secrets=[];
for(const path of ['.local/m0-token','.local/gemini.env']){
  try {const raw=readFileSync(path,'utf8');const value=path.endsWith('.env')?parseEnv(raw).GEMINI_API_KEY:raw.trim();if(value?.length>=8)secrets.push(value);}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const violations=[];
for(const file of files){
  if(/(^|\/)(\.local|\.tools|node_modules)(\/|$)|(^|\/)\.env($|\.)/.test(file))violations.push({file,reason:'private/runtime path staged'});
  const content=git(['show',`:${file}`]);
  if(secrets.some(secret=>content.includes(secret)))violations.push({file,reason:'private credential value found'});
  if(/AIza[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))violations.push({file,reason:'credential pattern found'});
}
const result={at:new Date().toISOString(),scope:'Git index only; known local credentials and recognizable key/private-key patterns',filesChecked:files.length,privateValuesPrinted:false,passed:violations.length===0,violations};
writeFileSync('docs/evidence/credential-scan.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
