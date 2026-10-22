import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { privateValues as collectPrivateValues } from './private-values.mjs';

const git = args => execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:128*1024*1024});
const tracked=process.env.RELAY_SCAN_SCOPE==='tracked';
const files=git(tracked?['ls-files','-z']:['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean);
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
try{const d=JSON.parse(readFileSync('.local/m4-cluster-token-exposure.json','utf8'));for(const value of d.values)secrets.push(value,Buffer.from(value).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const directory of readdirSync('.local').filter(n=>n.startsWith('cluster-rotation-relay-')))for(const name of ['old-token','new-token']){try{const value=readFileSync('.local/'+directory+'/'+name,'utf8').trim();secrets.push(value,Buffer.from(value).toString('base64'));const password=value.split('::').at(-1).replace(/^server:/,'');secrets.push(password,Buffer.from(password).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}}
// Include this run's independently generated disposable-cluster credentials in the final evidence scan.
try {
 const clean=JSON.parse(readFileSync('docs/evidence/m4/clean-install.json','utf8'));
 if(clean.passed){
  const base=clean.destination+'/.local';
  for(const name of readdirSync(base).filter(n=>n.endsWith('-credentials.json'))){const d=JSON.parse(readFileSync(base+'/'+name,'utf8'));for(const v of [...Object.values(d.runtime),d.admin.password,...Object.values(d.adapter)])if(typeof v==='string'&&v.length>=8)secrets.push(v,Buffer.from(v).toString('base64'));}
  for(const name of ['m3-runtime-secrets.json','m2-upstream-tokens.json','m4-acceptance-identity.json','console-owner.json']){const d=JSON.parse(readFileSync(base+'/'+name,'utf8'));const values=(name.includes('runtime')||name.includes('upstream-tokens'))?Object.values(d):[d.password,d.A?.password,d.B?.password,d.memberKey,d.adminCookie,d.memberCookie];for(const v of values)if(typeof v==='string'&&v.length>=8)secrets.push(v,Buffer.from(v).toString('base64'));}
  for(const directory of readdirSync(base).filter(n=>n.startsWith('cluster-rotation-relay-')))for(const name of ['old-token','new-token']){const v=readFileSync(base+'/'+directory+'/'+name,'utf8').trim();const password=v.split('::').at(-1).replace(/^server:/,'');for(const value of [v,password])secrets.push(value,Buffer.from(value).toString('base64'));}
 }
}catch(error){if(error.code!=='ENOENT')throw error;}
try{const d=JSON.parse(readFileSync('.local/m3-runtime-secrets.json','utf8'));if(d['credential-keyring'])for(const v of Object.values(JSON.parse(d['credential-keyring']).keys))secrets.push(v,Buffer.from(v).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
try{const d=JSON.parse(readFileSync('.local/m6-vault-rotation-state.json','utf8'));for(const v of [...Object.values(d.old?.keys??{}),d.newKey])if(typeof v==='string'&&v.length>=16)secrets.push(v,Buffer.from(v).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
try{const d=JSON.parse(readFileSync('.local/demo-client.json','utf8'));if(d.key?.length>=20)secrets.push(d.key,Buffer.from(d.key).toString('base64'));}catch(error){if(error.code!=='ENOENT')throw error;}
const violations=[];
// Match the actual Authorization header, not public authorizationServerUrl metadata.
// Include current M5 identities, revoked synthetic test passwords and generated
// store Secrets. Values stay in memory; report filenames and reasons only.
function privateValues(value,field=''){
 collectPrivateValues(value,secrets,field);
}
for(const file of readdirSync('.local').filter(n=>/^(?:m[56]|m10)-.*\.json$/.test(n))){try{privateValues(JSON.parse(readFileSync('.local/'+file,'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}}
if(process.env.RELAY_SCAN_CLUSTER==='1'){
 const {kube}=await import('./mcp-kube.mjs');
 const namespaces=JSON.parse(kube(['get','namespace','-o','json'])).items.filter(n=>n.metadata.name.startsWith('relay')).map(n=>n.metadata.name);
 for(const namespace of namespaces)for(const object of JSON.parse(kube(['get','secrets','-n',namespace,'-o','json'])).items)for(const [key,encoded] of Object.entries(object.data??{})){
  if(object.type==='helm.sh/release.v1')continue;
  const value=Buffer.from(encoded,'base64').toString('utf8');
  if(key==='credentials.json'){
   // team is public routing metadata; only the nested headers contain credentials.
   for(const entry of Object.values(JSON.parse(value)))for(const v of Object.values(entry.headers??{}))if(typeof v==='string'&&v.length>=8){
    for(const candidate of [v,...(/^Bearer\s+(.+)$/i.exec(v)?.slice(1)??[])])secrets.push(candidate,Buffer.from(candidate).toString('base64'));
   }
  }
  else if(value.length>=16){secrets.push(value,encoded);}
 }
}
try {
 const tokens=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8'));
 for(const value of Object.values(tokens))secrets.push(value,Buffer.from(value).toString('base64'));
} catch(error) {if(error.code!=='ENOENT')throw error;}
for(const file of files){
  if(/(^|\/)(\.local|\.tools|node_modules)(\/|$)|(^|\/)\.env($|\.)/.test(file))violations.push({file,reason:'private/runtime path staged'});
  const content=git(['show',`:${file}`]);
  if(secrets.some(secret=>content.includes(secret)))violations.push({file,reason:'private credential value found'});
  if(/ro[ar]_[A-Za-z0-9_-]{20,}|r[kid]\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[a-f0-9]{64}|AIza[A-Za-z0-9_-]{30,}|K10[a-f0-9]{64}::server:[^\s"']+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))violations.push({file,reason:'credential pattern found'});
}
let historyChecked=false;if(process.env.RELAY_SCAN_HISTORY==='1'){const patch=git(['log','-p','--all','--format=%H']);historyChecked=true;if(secrets.some(secret=>patch.includes(secret))||/ro[ar]_[A-Za-z0-9_-]{20,}|r[kid]\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[a-f0-9]{64}|AIza[A-Za-z0-9_-]{30,}|K10[a-f0-9]{64}::server:[^\s"']+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(patch))violations.push({file:'Git history',reason:'private credential value or pattern in historical text patch'});}
const result={at:new Date().toISOString(),scope:tracked?'All tracked Git-index files plus optional historical text patches':'Staged Git-index files',historyChecked,filesChecked:files.length,privateValuesPrinted:false,passed:violations.length===0,violations};
writeFileSync(process.env.SECRET_SCAN_OUTPUT || 'docs/evidence/credential-scan.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
