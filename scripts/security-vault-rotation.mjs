import {kube,env} from './mcp-kube.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {keyring,seal,unseal} from '../dist/packages/auth/src/sealed.js';
import {securityFixture,origin} from './security-fixture.mjs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
const report={at:new Date().toISOString(),checks:[]};const path='.local/m3-runtime-secrets.json',statePath='.local/m6-vault-rotation-state.json';
const values=JSON.parse(readFileSync(path,'utf8'));let old=keyring(JSON.parse(values['credential-keyring']));
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{old,active:'v2',newKey:randomBytes(32).toString('hex')};writeFileSync(statePath,JSON.stringify(state),{mode:0o600});old=state.old;
const overlap=keyring({active:state.active,keys:{...old.keys,[state.active]:state.newKey}}),retired=keyring({active:state.active,keys:{[state.active]:state.newKey}});
const writeRing=async ring=>{
 for(const name of ['platform-api','platform-provisioner']){
  const s=JSON.parse(kube(['get','secret',name,'-n','relay-platform','-o','json']));assert.equal(s.metadata.labels['relay-owned'],'m3');
  const current=JSON.parse(Buffer.from(s.data['credential-keyring'],'base64').toString());assert([old,overlap,retired].some(r=>JSON.stringify(r)===JSON.stringify(current)),'Only the recorded source/overlap/target keyring may rotate');
  s.data['credential-keyring']=Buffer.from(JSON.stringify(ring)).toString('base64');execFileSync('.tools/bin/kubectl',['replace','-f','-'],{env,input:JSON.stringify(s),stdio:['pipe','ignore','pipe']});
 }
 values['credential-keyring']=JSON.stringify(ring);writeFileSync(path,JSON.stringify(values)+'\n',{mode:0o600});
 const hash=createHash('sha256').update(JSON.stringify(ring)).digest('hex');
 for(const role of ['api','provisioner'])await expect.poll(()=>kube(['exec','-n','relay-platform',`deployment/relay-${role}`,'--','node','--input-type=module','-e',`import{readFileSync}from'node:fs';import{createHash}from'node:crypto';process.stdout.write(createHash('sha256').update(readFileSync('/run/platform/credential-keyring','utf8').trim()).digest('hex'));`]).trim(),{timeout:150000,intervals:[3000]}).toBe(hash);
};
let client;
try{
 const{f,api}=await securityFixture();client=new Client({name:'relay-vault-rotation',version:'0.6.0'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:ingressFetch,requestInit:{headers:{authorization:`Bearer ${f.users.A.key}`}}}));
 const live=async()=>{const tools=(await api('A','tools')).tools;const tool=tools.find(t=>t.upstreamId===f.upstreams.calendar&&t.name==='info');assert(tool);assert.notEqual((await client.callTool({name:tool.alias,arguments:{}})).isError,true);};
 await writeRing(overlap);await live();report.checks.push('API and provisioner both observe an explicit overlapping keyring; existing real MCP credentials remain readable');
 execFileSync(process.execPath,['scripts/security-vault-migrate.mjs','--rewrap'],{env:{...env,RELAY_VAULT_EVIDENCE_FILE:'docs/evidence/m6/vault-rewrap.json'},stdio:['ignore','ignore','pipe']});
 let secret=JSON.parse(kube(['get','secret','gateway-upstream-credentials','-n','relay-platform','-o','json'])),v=JSON.parse(Buffer.from(secret.data['credentials.json'],'base64').toString());
 for(const[ref,e]of Object.entries(v.entries)){assert.equal(e.encrypted.keyId,state.active);unseal(e.encrypted,e.team,ref,retired);assert.throws(()=>unseal(e.encrypted,e.team,ref,old));}
 report.checks.push('All actual credential envelopes rewrap to the active key and the previous key alone cannot decrypt them');
 await writeRing(retired);await live();report.checks.push('The previous key is retired from both runtime mounts; the same live gateway client still executes successfully');
 const orphan=randomUUID(),liveRefs=JSON.parse(kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-Atc',"SELECT COALESCE(json_agg(ref),'[]'::json) FROM app.live_credential_refs()"]));assert(liveRefs.length>0);
 v.entries[orphan]={team:f.team,createdAt:new Date(Date.now()-7200000).toISOString(),encrypted:seal({Authorization:'Bearer synthetic-orphan-only'},f.team,orphan,retired)};
 secret.data['credentials.json']=Buffer.from(JSON.stringify(v)).toString('base64');execFileSync('.tools/bin/kubectl',['replace','-f','-'],{env,input:JSON.stringify(secret),stdio:['pipe','ignore','pipe']});
 const code=`import{SecretVault}from'./dist/packages/auth/src/secret-vault.js';import{pool}from'./dist/packages/db/src/store.js';const p=pool('app');try{const r=await p.query('SELECT ref FROM app.live_credential_refs()');const removed=await new SecretVault().collect(new Set(r.rows.map(x=>x.ref)));console.log(JSON.stringify({removed}));}finally{await p.end();}`;
 const collected=JSON.parse(kube(['exec','-n','relay-platform','deployment/relay-api','--','node','--input-type=module','-e',code]));assert(collected.removed>=1);
 secret=JSON.parse(kube(['get','secret','gateway-upstream-credentials','-n','relay-platform','-o','json']));v=JSON.parse(Buffer.from(secret.data['credentials.json'],'base64').toString());assert(!v.entries[orphan]);for(const ref of liveRefs)assert(v.entries[ref]);await live();
 report.checks.push('Actual production maintenance removes an aged encrypted orphan while retaining every durable live or managed-store reference');report.activeKeyId=state.active;report.entries=Object.keys(v.entries).length;report.previousRuntimeKeyRemoved=true;report.privateSafetyCopyRetained=true;report.passed=true;
}finally{await client?.close().catch(()=>{});writeFileSync('docs/evidence/m6/vault-rotation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed??false,checks:report.checks}));}
