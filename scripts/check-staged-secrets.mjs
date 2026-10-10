import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';

const git = args => execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const files=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean);
const secrets=[];
for(const path of ['.local/m0-token','.local/gemini.env','.local/m4-admin-key']){
  try {const raw=readFileSync(path,'utf8');const value=path.endsWith('.env')?parseEnv(raw).GEMINI_API_KEY:raw.trim();if(value?.length>=8)secrets.push(value);}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const file of readdirSync('.local').filter(x=>x.endsWith('-credentials.json'))){
 const data=JSON.parse(readFileSync(`.local/${file}`,'utf8'));
 for(const value of [...Object.values(data.runtime),data.admin.password,...Object.values(data.adapter)]){secrets.push(value,Buffer.from(value).toString('base64'));}
}
for(const file of ['.local/m3-runtime-secrets.json','.local/m3-acceptance-identity.json']){
 try{const data=JSON.parse(readFileSync(file,'utf8'));const values=file.includes('runtime')?Object.values(data):[data.adminKey,data.memberKey,data.adminCookie,data.memberCookie,...Object.values(data.passwords??{})];for(const value of values)if(typeof value==='string'&&value.length>=8)secrets.push(value,Buffer.from(value).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const file of ['.local/m4-acceptance-identity.json','.local/console-owner.json']){
 try{const d=JSON.parse(readFileSync(file,'utf8'));for(const value of [d.password,d.A?.password,d.B?.password,d.memberKey,d.previousMemberKey,d.adminCookie,d.memberCookie])if(typeof value==='string'&&value.length>=8)secrets.push(value,Buffer.from(value).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
const violations=[];
try {
 const tokens=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8'));
 for(const value of Object.values(tokens))secrets.push(value,Buffer.from(value).toString('base64'));
} catch(error) {if(error.code!=='ENOENT')throw error;}
for(const file of files){
  if(/(^|\/)(\.local|\.tools|node_modules)(\/|$)|(^|\/)\.env($|\.)/.test(file))violations.push({file,reason:'private/runtime path staged'});
  const content=git(['show',`:${file}`]);
  if(secrets.some(secret=>content.includes(secret)))violations.push({file,reason:'private credential value found'});
  if(/r[kid]\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[a-f0-9]{64}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))violations.push({file,reason:'credential pattern found'});
}
const result={at:new Date().toISOString(),scope:'Git index only; known local credentials and recognizable key/private-key patterns',filesChecked:files.length,privateValuesPrinted:false,passed:violations.length===0,violations};
writeFileSync(process.env.SECRET_SCAN_OUTPUT || 'docs/evidence/credential-scan.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
