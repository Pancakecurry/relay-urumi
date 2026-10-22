import {forwardFetch} from './security-forward-fetch.mjs';
import {securityFixture,origin} from './security-fixture.mjs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {kube,env} from './mcp-kube.mjs';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {keyring,unseal} from '../dist/packages/auth/src/sealed.js';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
const{f,api}=await securityFixture(),report={at:new Date().toISOString(),checks:[]};let upstream,forward,client,tamperedRef,originalEntry;
const read=()=>JSON.parse(kube(['get','secret','gateway-upstream-credentials','-n','relay-platform','-o','json']));
const map=s=>JSON.parse(Buffer.from(s.data['credentials.json'],'base64').toString());
function replace(s){execFileSync('.tools/bin/kubectl',['replace','-f','-'],{env,input:JSON.stringify(s),stdio:['pipe','ignore','pipe']});}
const refFor=id=>kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-Atc',`SELECT credential_ref FROM app.upstreams WHERE id='${id}'`]).trim();
const token=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')).calendar;
try{
 const s=read(),v=map(s);assert.equal(v.format,1);const ring=keyring(JSON.parse(JSON.parse(readFileSync('.local/m3-runtime-secrets.json','utf8'))['credential-keyring']));
 for(const [ref,e] of Object.entries(v.entries)){assert(e.encrypted&&!e.headers);assert(!JSON.stringify(e).includes(token));assert(unseal(e.encrypted,e.team,ref,ring));}
 report.checks.push('All actual vault entries are authenticated envelopes; every live envelope decrypts in its bound scope');report.entries=Object.keys(v.entries).length;
 upstream=(await api('A','upstreams','POST',{name:`m6-vault-${randomUUID().slice(0,8)}`,url:'https://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp',credentials:{kind:'bearer',token}})).id;
 const oldRef=refFor(upstream);assert.notEqual(oldRef,upstream);
 client=new Client({name:'relay-m6-vault',version:'0.6.0'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:ingressFetch,requestInit:{headers:{Authorization:`Bearer ${f.users.A.key}`}}}));
 let tools;await expect.poll(async()=>{tools=(await api('A','tools')).tools;return tools.filter(t=>t.upstreamId===upstream).length;},{timeout:30000}).toBe(3);
 const info=tools.find(t=>t.upstreamId===upstream&&t.name==='info').alias;assert.notEqual((await client.callTool({name:info,arguments:{}})).isError,true);
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 forward=spawn('.tools/bin/kubectl',['port-forward','service/relay-api',`${port}:3001`,'-n','relay-platform','--address=127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Private API forward timeout')),15000);forward.stdout.on('data',d=>{if(d.toString().includes('Forwarding from')){clearTimeout(t);resolve();}});forward.once('exit',()=>{clearTimeout(t);reject(new Error('Private API forward exited'));});});
 const runtime=JSON.parse(kube(['get','secret','platform-api','-n','relay-platform','-o','json'])),internal=Buffer.from(runtime.data['internal-token'],'base64').toString();
 const privateGet=revision=>forwardFetch({port,role:'api',clientRole:'gateway'})(`https://127.0.0.1:${port}/internal/upstream-credential`,{method:'POST',headers:{authorization:`Bearer ${internal}`,'content-type':'application/json'},body:JSON.stringify({team:f.team,upstream,revision})});
 assert.equal((await privateGet(1)).status,200);
 await api('A',`upstreams/${upstream}`,'PATCH',{revision:1,credentials:{kind:'bearer',token}});const newRef=refFor(upstream);assert.notEqual(newRef,oldRef);assert.equal((await privateGet(1)).status,403);const current=await privateGet(2);assert.equal(current.status,200);assert.equal((await current.json()).headers.Authorization,`Bearer ${token}`);
 report.checks.push('Real credential rotation allocates an immutable new reference; stale registry revisions cannot receive current headers');
 const serialized=JSON.stringify(await api('A','upstreams'));assert(!serialized.includes(token));assert(!serialized.includes(oldRef));assert(!serialized.includes(newRef));
 report.checks.push('Public management output reveals neither stored headers nor private credential references');
 const before=read(),m=map(before);tamperedRef=newRef;originalEntry=m.entries[newRef];m.entries[newRef]={...originalEntry,encrypted:{...originalEntry.encrypted,tag:'00'.repeat(16)}};before.data['credentials.json']=Buffer.from(JSON.stringify(m)).toString('base64');replace(before);
 assert.equal((await privateGet(2)).status,503);const healthy=(await api('A','tools')).tools.find(t=>t.upstreamId===f.upstreams.totals&&t.name==='sum_amounts');assert.notEqual((await client.callTool({name:healthy.alias,arguments:{currency:'INR',amounts:['0.10','0.20']}})).isError,true);
 report.checks.push('A genuinely tampered vault entry fails closed while an independent real upstream remains callable');
 const restore=read(),rm=map(restore);rm.entries[newRef]=originalEntry;restore.data['credentials.json']=Buffer.from(JSON.stringify(rm)).toString('base64');replace(restore);tamperedRef=undefined;
 const live=JSON.parse(kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-Atc','SELECT COALESCE(json_agg(ref),\'[]\'::json) FROM app.live_credential_refs()']));assert(live.includes(newRef));assert(!live.includes(oldRef));assert(live.includes('85079ca7-2e6b-440c-96e3-076794da1e31'));
 report.checks.push('Durable reachability retains current and managed-store references while exposing the superseded reference for grace-period collection');
 report.passed=true;
}finally{
 if(tamperedRef){const s=read(),v=map(s);v.entries[tamperedRef]=originalEntry;s.data['credentials.json']=Buffer.from(JSON.stringify(v)).toString('base64');replace(s);}
 if(upstream)await api('A',`upstreams/${upstream}`,'DELETE');
 await client?.close().catch(()=>{});forward?.kill('SIGTERM');report.cleanupRestored=true;report.internalTransportTls=true;
 writeFileSync('docs/evidence/m6/vault.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed??false,checks:report.checks,cleanupRestored:report.cleanupRestored}));
}
