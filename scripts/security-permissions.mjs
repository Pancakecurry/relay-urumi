import {forwardFetch} from './security-forward-fetch.mjs';
import {securityFixture,origin} from './security-fixture.mjs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {kube,env} from './mcp-kube.mjs';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
const{f,api,save}=await securityFixture();const clients=[];const report={at:new Date().toISOString(),checks:[],modelTraffic:false};let forward;
const original=await api('A','permissions');f.policyTest??={ids:[],defaultEffect:original.defaultEffect};save();
async function cleanup(){
 await api('A',`members/${f.users.B.user}`,'PATCH',{role:'member',active:true});
 const rows=(await api('A','permissions')).rules;
 for(const id of new Set(f.policyTest.ids))if(rows.some(r=>r.id===id))await api('A',`permissions/${id}`,'DELETE');
 const p=await api('A','permissions');if(p.defaultEffect!==f.policyTest.defaultEffect)await api('A','permissions/default','PATCH',{defaultEffect:f.policyTest.defaultEffect,revision:p.revision});
 f.policyTest.ids=[];save();
}
async function client(token,mode='auto'){
 const c=new Client({name:'relay-m6-permissions',version:'0.6.0'},{versionNegotiation:{mode}});clients.push(c);
 await c.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:ingressFetch,requestInit:{headers:{Authorization:`Bearer ${token}`}}}));return c;
}
async function policy(body){const r=await api('A','permissions','POST',body);f.policyTest.ids.push(r.id);save();return r.id;}
const check=name=>report.checks.push(name);
try{
 await cleanup();
 const A=await client(f.users.A.key),B=await client(f.users.B.key),C=await client(f.users.C.key);
 await expect.poll(async()=>(await A.listTools()).tools.length,{timeout:30000,intervals:[1000]}).toBe(12);assert.equal((await B.listTools()).tools.length,12);
 const catalog=(await api('A','tools')).tools;const alias=(server,name)=>catalog.find(t=>t.upstreamName===server&&t.name===name).alias;
 const sku=`M6-ALLOWED-${randomUUID().slice(0,8)}`;const positive=await A.callTool({name:alias('woocommerce','create_product'),arguments:{name:'[SYNTHETIC M6] Permission control',sku,regular_price:'0.30'}});assert.notEqual(positive.isError,true);report.productId=positive.structuredContent.product.id;check('Existing key clients discover twelve real tools and execute a real WooCommerce write');
 // Obtain exactly the server-derived identity used by chat, through the real private API.
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 forward=spawn('.tools/bin/kubectl',['port-forward','service/relay-api',`${port}:3001`,'-n','relay-platform','--address=127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned API port-forward deadline')),15000);forward.stdout.on('data',d=>{if(d.toString().includes('Forwarding from')){clearTimeout(timer);resolve();}});forward.once('exit',()=>{clearTimeout(timer);reject(new Error('Owned API port-forward exited'));});});
 const secret=JSON.parse(kube(['get','secret','platform-api','-n','relay-platform','-o','json']));const internal=Buffer.from(secret.data['internal-token'],'base64').toString();
 const delegated=await forwardFetch({port,role:'api',clientRole:'gateway'})(`https://127.0.0.1:${port}/internal/chat-identity`,{method:'POST',headers:{authorization:`Bearer ${internal}`,cookie:f.users.B.cookie,'x-relay-team':f.team}});assert.equal(delegated.status,200);const D=await client((await delegated.json()).token);assert.equal((await D.listTools()).tools.length,12);
 const config=await api('A','permissions');await api('A','permissions/default','PATCH',{defaultEffect:'deny',revision:config.revision});
 await policy({subject:'role:admin',effect:'allow'});
 const allowCalendar=await policy({subject:'role:member',upstreamId:f.upstreams.calendar,effect:'allow'});
 assert.equal((await B.listTools()).tools.length,3);assert.equal((await C.listTools()).tools.length,3);assert.equal((await A.listTools()).tools.length,12);check('Default deny, role allow and server scope apply to every member without granting management');
 await policy({subject:`user:${f.users.B.user}`,upstreamId:f.upstreams.totals,toolName:'info',effect:'allow'});
 assert.equal((await B.listTools()).tools.length,4);assert.equal((await C.listTools()).tools.length,3);assert.notEqual((await B.callTool({name:alias('totals','info'),arguments:{}})).isError,true);check('User-specific tool allow is scoped to its user and server');
 await policy({subject:`user:${f.users.B.user}`,upstreamId:f.upstreams.woocommerce,toolName:'create_product',effect:'allow'});
 await policy({subject:'role:member',upstreamId:f.upstreams.woocommerce,effect:'deny'});
 const deniedSKU=`M6-DENIED-${randomUUID().slice(0,8)}`,args={name:'[SYNTHETIC M6] Must never exist',sku:deniedSKU,regular_price:'0.30'};
 const denied=await B.callTool({name:alias('woocommerce','create_product'),arguments:args});assert.equal(denied.isError,true);
 const chatDenied=await D.callTool({name:alias('woocommerce','create_product'),arguments:args});assert.equal(chatDenied.isError,true);
 const list=await A.callTool({name:alias('woocommerce','list_products'),arguments:{sku:deniedSKU}});assert.notEqual(list.isError,true);assert.equal(list.structuredContent.products.length,0);
 assert(!(await B.listTools()).tools.some(t=>t.name===alias('woocommerce','create_product')));assert(!(await D.listTools()).tools.some(t=>t.name===alias('woocommerce','create_product')));check('Explicit role deny beats a user allow; cached key and real chat-delegation writes are rejected without side effects');
 const search=await api('B','tools/search?q=&limit=1');assert.equal(search.tools.length,1);assert.equal(search.total,4);assert.equal((await api('B','tools/search?q=create_product')).total,0);assert.equal((await api('B','tools')).tools.length,4);const overview=await api('B','overview');assert.equal(overview.upstreams.reduce((n,u)=>n+u.tool_count,0),4);assert(!overview.upstreams.some(u=>u.id===f.upstreams.woocommerce));await api('B','tools/search?q=x&limit=51','GET',undefined,400);check('Discovery, gateway search, result counts and chat catalog do not disclose denied tools');
 await api('B','permissions','POST',{subject:`user:${f.users.B.user}`,effect:'allow'},403);await api('B','permissions/catalog','GET',undefined,403);await api('B',`members/${f.users.A.user}`,'PATCH',{role:'member'},403);
 await api('A','permissions','POST',{subject:'user:nonexistent-foreign-identity',effect:'allow'},404);await api('A','permissions','POST',{subject:'role:member',upstreamId:f.foreignUpstream,effect:'allow'},404);await api('A','permissions','POST',{subject:'role:member',upstreamId:f.upstreams.calendar,toolName:'nonexistent_tool',effect:'allow'},404);await api('B','permissions','GET',undefined,403,f.otherTeam);check('No management escalation, foreign subject/server targeting or cross-team configuration read');
 const stale=await api('A','permissions');const duplicate=await Promise.all(Array.from({length:5},()=>api('A','permissions','POST',{subject:'role:member',upstreamId:f.upstreams.calendar,effect:'allow'})));assert(duplicate.every(r=>r.id===allowCalendar));assert.equal((await api('A','permissions')).rules.filter(r=>r.id===allowCalendar).length,1);await policy({subject:`user:${f.users.C.user}`,upstreamId:f.upstreams.totals,toolName:'info',effect:'deny'});await api('A','permissions/default','PATCH',{defaultEffect:'allow',revision:stale.revision},409);check('Concurrent duplicate rules converge and stale workspace-default edits fail without overwriting policy');
 await api('A',`members/${f.users.B.user}`,'PATCH',{role:'admin'});assert.equal((await B.listTools()).tools.length,12);await api('A',`members/${f.users.B.user}`,'PATCH',{role:'member'});assert.equal((await B.listTools()).tools.length,4);assert.equal((await B.callTool({name:alias('totals','sum_amounts'),arguments:{currency:'INR',amounts:['0.10','0.20']}})).isError,true);check('Role demotion takes effect on existing client connections and cached aliases');
 const audits=(await api('A','audit')).calls;for(const[result,kind]of[[denied,'key'],[chatDenied,'delegation']])assert(audits.some(a=>a.id===result._meta.relay.auditId&&a.user_id===f.users.B.user&&a.auth_kind===kind&&a.status==='rejected'));check('Rejected external and chat calls are durably attributed to the correct member');
 const legacy=await client(f.users.B.key,'legacy');assert.equal((await legacy.listTools()).tools.length,4);assert.equal((await legacy.callTool({name:alias('woocommerce','create_product'),arguments:args})).isError,true);check('Modern and legacy official MCP transports enforce the same current policy');
 report.passed=true;
}finally{
 try{await cleanup();report.cleanupRestored=true;}catch{report.cleanupRestored=false;report.passed=false;process.exitCode=1;}
 for(const c of clients)await c.close().catch(()=>{});forward?.kill('SIGTERM');mkdirSync('docs/evidence/m6',{recursive:true});writeFileSync('docs/evidence/m6/permissions.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed??false,checks:report.checks,cleanupRestored:report.cleanupRestored}));
}
