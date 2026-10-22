// Reviewed operator migration/rewrap. Never emits plaintext, keys, or ciphertext.
import {readFileSync,writeFileSync} from 'node:fs';
import {kube} from './mcp-kube.mjs';
import {keyring,seal,unseal} from '../dist/packages/auth/src/sealed.js';
import {headerSchema} from '../dist/packages/auth/src/secret-vault.js';
const secrets=JSON.parse(readFileSync('.local/m3-runtime-secrets.json','utf8'));
const ring=keyring(JSON.parse(secrets['credential-keyring']));
let done=false,result;
for(let n=0;n<5;n++){
 const s=JSON.parse(kube(['get','secret','gateway-upstream-credentials','-n','relay-platform','-o','json']));
 if(s.metadata.labels?.['relay-owned']!=='m3')throw new Error('Vault ownership mismatch');
 const before=JSON.parse(Buffer.from(s.data['credentials.json'],'base64').toString());
 const encrypted=before.format===1;const entries=encrypted?before.entries:before;
 const next={format:1,entries:{}};let count=0;
 for(const [ref,e] of Object.entries(entries)){
  const headers=headerSchema.parse(encrypted?unseal(e.encrypted,e.team,ref,ring):e.headers);
  const envelope=seal(headers,e.team,ref,ring);
  // Read back every actual value before atomic replacement.
  if(JSON.stringify(unseal(envelope,e.team,ref,ring))!==JSON.stringify(headers))throw new Error('Rewrap verification failed');
  next.entries[ref]={team:e.team,createdAt:e.createdAt??new Date().toISOString(),...(e.retiredAt?{retiredAt:e.retiredAt}:{}),encrypted:envelope};count++;
 }
 const serialized=JSON.stringify(next);if(Buffer.byteLength(serialized)>700000)throw new Error('Vault capacity exceeded');
 const oldVersion=s.metadata.resourceVersion;s.data['credentials.json']=Buffer.from(serialized).toString('base64');
 // replace reads stdin: no Secret value goes into process arguments.
 const {execFileSync}=await import('node:child_process');
 try{execFileSync('.tools/bin/kubectl',['replace','-f','-'],{env:{...process.env,KUBECONFIG:process.cwd()+'/.local/kubeconfig'},input:JSON.stringify(s),stdio:['pipe','ignore','pipe']});done=true;result={at:new Date().toISOString(),passed:true,entries:count,previousFormat:encrypted?'encrypted-v1':'legacy-plaintext',format:'AES-256-GCM-v1',activeKeyId:ring.active,atomicResourceVersionCheck:!!oldVersion,everyEntryRoundTrip:true,privateValuesPrinted:false};break;}
 catch(e){if(!e.stderr?.includes('Conflict')||n===4)throw e;}
}
if(!done)throw new Error('Vault migration not committed');
writeFileSync(process.env.RELAY_VAULT_EVIDENCE_FILE??'docs/evidence/m6/vault-operator-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
