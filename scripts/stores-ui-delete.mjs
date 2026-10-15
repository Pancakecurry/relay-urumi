import {chromium,expect} from '@playwright/test';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {kube} from './mcp-kube.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('.local/m5-identity.json','utf8'));
const s=JSON.parse(readFileSync('.local/m5-ui-store.json','utf8'));
const origin='http://relay.localhost:18080';
const inventory=JSON.parse(kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-At','-c',`SELECT resources FROM app.stores WHERE id='${s.id}'`]).trim());
const alreadyDeleted=kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-At','-c',`SELECT status FROM app.stores WHERE id='${s.id}'`]).trim()==='Deleted';
const absent=(kind,name)=>{try{kube(['get',kind,name]);return false;}catch(e){if(String(e.stderr).includes('NotFound'))return true;throw e;}};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const p=await context.newPage();
const client=new Client({name:'relay-m5-ui-cleanup',version:'0.5.0'});
try{
 await p.goto(origin+'/stores');await p.getByLabel('Email',{exact:true}).fill(f.email);await p.getByLabel('Password',{exact:true}).fill(f.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await expect(p.getByRole('heading',{name:'Stores',exact:true})).toBeVisible();if(await p.getByLabel('Team workspace').inputValue()!==f.team)await p.getByLabel('Team workspace').selectOption(f.team);
 if(alreadyDeleted)await p.getByLabel('Include deleted').check();
 await p.getByRole('button',{name:`Select ${s.name}`,exact:true}).click();
 if(!alreadyDeleted){await p.getByRole('button',{name:`Delete ${s.name}`,exact:true}).click();await p.getByLabel('Type the store name to confirm').fill(s.name);
 const response=p.waitForResponse(r=>r.url()===origin+`/api/stores/${s.id}/delete`&&r.request().method()==='POST');await p.getByRole('button',{name:'Delete permanently',exact:true}).click();assert.equal((await response).status(),202);await expect(p.getByRole('dialog')).toBeHidden();await expect(p.getByRole('tab',{name:'Lifecycle',exact:true})).toHaveAttribute('aria-selected','true');await p.screenshot({path:'docs/evidence/m5/visual/13-cleanup-in-progress-desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'docs/evidence/m5/visual/14-cleanup-in-progress-mobile.png',fullPage:true});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 let row;await expect.poll(async()=>{const r=await context.request.get(origin+'/api/stores',{headers:{'x-relay-team':f.team}});assert.equal(r.status(),200);row=(await r.json()).stores.find(x=>x.id===s.id);return row.status;},{timeout:240000,intervals:[1000,3000]}).toBe('Deleted');
 assert(absent('namespace',s.namespace));for(const v of inventory.volumes){assert(absent('pv',v.name));if(v.path)execFileSync('docker',['exec','k3d-relay-m0-server-0','test','!','-e',v.path],{stdio:['ignore','pipe','pipe']});}
 const vault=JSON.parse(kube(['get','secret','gateway-upstream-credentials','-n','relay-platform','-o','json']));assert(!JSON.parse(Buffer.from(vault.data['credentials.json'],'base64').toString())[s.id]);
 await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:ingressFetch,requestInit:{headers:{Authorization:`Bearer ${f.key}`}}}));const tools=(await client.listTools()).tools;assert.equal(tools.length,12);assert(!tools.some(t=>t.name.startsWith(`store_${s.id.replaceAll('-','')}_`)));assert.equal((await client.callTool({name:`store_${f.stores[1].id.replaceAll('-','')}_list_orders`,arguments:{per_page:1}})).isError??false,false);
 await p.setViewportSize({width:390,height:844});await p.getByLabel('Include deleted').check();await p.getByRole('button',{name:`Select ${s.name}`,exact:true}).click();await p.getByRole('tab',{name:'Lifecycle',exact:true}).click();await expect(p.getByRole('region',{name:'Deletion lifecycle'})).toContainText('verified');await p.screenshot({path:'docs/evidence/m5/visual/15-cleanup-verified-mobile.png',fullPage:true});
 const events=await context.request.get(origin+`/api/stores/${s.id}/events`,{headers:{'x-relay-team':f.team}});assert.equal(events.status(),200);const history=await events.json();for(const phase of ['NamespaceRemoved','VolumesRemoved','CredentialsRemoved','Deleted'])assert(history.events.some(e=>e.phase===phase&&!e.code));
 writeFileSync('docs/evidence/m5/ui-deletion.json',JSON.stringify({at:new Date().toISOString(),passed:true,resumedAfterScreenshotLocatorFailure:alreadyDeleted,storeId:s.id,namespace:s.namespace,volumes:inventory.volumes,events:history.events,namespaceAbsent:true,volumesAndDataAbsent:true,credentialRemoved:true,survivingStoreCallable:true,remainingTools:tools.length},null,2));console.log(JSON.stringify({passed:true,store:s.id,remainingTools:tools.length}));
}finally{await client.close();await browser.close();}
