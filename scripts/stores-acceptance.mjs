import {chromium,expect} from '@playwright/test';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {kube} from './mcp-kube.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const origin='http://relay.localhost:18080', dir='docs/evidence/m5';mkdirSync(dir,{recursive:true});
const fixtureFile='.local/m5-identity.json';const fixture=existsSync(fixtureFile)?JSON.parse(readFileSync(fixtureFile,'utf8')):{email:`m5-${randomUUID().slice(0,8)}@example.invalid`,password:randomBytes(24).toString('hex'),name:'Synthetic M5 Owner',stores:[]};
const save=()=>writeFileSync(fixtureFile,JSON.stringify(fixture)+'\n',{mode:0o600});save();
const report={at:new Date().toISOString(),checks:[],stores:[],screenshots:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function api(path,method='GET',body,expected=200){const r=await context.request.fetch(origin+'/api/'+path,{method,headers:{origin,'x-relay-team':fixture.team??''},...(body!==undefined?{data:body}:{})});assert.equal(r.status(),expected,path);return r.json();}
async function shot(name){await page.evaluate(()=>document.fonts.ready);if(await page.getByRole('dialog').count())await expect.poll(()=>page.getByRole('dialog').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});report.screenshots.push(name);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${name}`);}
const check=name=>report.checks.push(name);
try{
 await page.goto(origin);
 if(!fixture.team){await page.getByRole('button',{name:'New here? Create an account'}).click();await page.getByLabel('Name',{exact:true}).fill(fixture.name);}
 await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:fixture.team?'Sign in':'Create account',exact:true}).click();
 if(!fixture.team){await expect(page.getByRole('heading',{name:'Give your tools a home.'})).toBeVisible();await page.getByLabel('Team name').fill('M5 Lifecycle Acceptance');await page.getByRole('button',{name:'Create workspace'}).click();await expect(page.getByRole('heading',{name:'Control room',exact:true})).toBeVisible();fixture.team=await page.evaluate(()=>localStorage.getItem('relay.team'));save();}
 await expect(page.getByRole('heading',{name:'Control room',exact:true})).toBeVisible();fixture.cookie=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');fixture.user=(await api('me')).user.id;save();
 await page.getByRole('link',{name:'Stores',exact:true}).click();await expect(page.getByRole('heading',{name:'Stores',exact:true})).toBeVisible();
 if(!fixture.stores.length){
  await shot('stores-empty-desktop');
  for(const name of ['Aurora Synthetic Store','Boreal Synthetic Store']){
   await page.getByRole('button',{name:'Create store',exact:true}).click();await page.getByLabel('Store name').fill(name);
   const response=page.waitForResponse(r=>r.url()===origin+'/api/stores'&&r.request().method()==='POST');await page.getByRole('button',{name:'Provision store',exact:true}).click();const r=await response;assert.equal(r.status(),202);const row=(await r.json()).store;const request=r.request().postDataJSON();fixture.stores.push(row);fixture.createIntents??=[];fixture.createIntents.push(request);save();await expect(page.getByRole('dialog')).toBeHidden();
  }
 }
 assert.equal(fixture.stores.length,2);
 const duplicate=await api('stores','POST',fixture.createIntents[0],202);assert.equal(duplicate.store.id,fixture.stores[0].id);check('Dashboard accepted two asynchronous creates; duplicate request returns the same store');
 await api('stores','POST',{name:'Over cap',idempotencyId:randomUUID()},409);check('Third concurrent request rejected by owner admission cap');
 await shot('stores-provisioning-desktop');
 // Worker death while Helm owns a pending install must be recoverable, not require a reset.
 if(!fixture.interrupted){await expect.poll(async()=>{const rows=(await api('stores')).stores;return rows.filter(r=>['StoreInstall','AdapterInstall'].includes(r.phase)).length;},{timeout:90000,intervals:[1000]}).toBeGreaterThan(0);
  const pods=JSON.parse(kube(['get','pods','-n','relay-platform','-l','relay.role=provisioner','-o','json']));kube(['delete','pod',pods.items[0].metadata.name,'-n','relay-platform','--grace-period=0','--force','--wait=false']);fixture.interrupted=true;save();check('Killed real provisioner during Helm lifecycle; desired state retained');}
 let rows;
 await expect.poll(async()=>{rows=(await api('stores')).stores;return rows.filter(r=>fixture.stores.some(s=>s.id===r.id)).map(r=>`${r.status}:${r.error_code??''}`).join(',');},{timeout:660000,intervals:[2000,3000,5000]}).toBe('Ready:,Ready:');
 fixture.stores=fixture.stores.map(s=>rows.find(r=>r.id===s.id));save();report.stores=fixture.stores;check('Both real stores converge Ready following provisioner restart');
 const tools=(await api('tools')).tools;for(const s of fixture.stores){assert.equal(tools.filter(t=>t.upstreamId===s.id).length,6);assert(tools.filter(t=>t.upstreamId===s.id).every(t=>t.alias.startsWith(`store_${s.id.replaceAll('-','')}_`)));}check('Twelve automatically registered, identifiable store tools without registry edits');
 if(!fixture.key){fixture.key=(await api('api-keys','POST',{name:'M5 acceptance gateway'})).key;save();}
 const client=new Client({name:'relay-m5-acceptance',version:'0.5.0'});try{await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{fetch:ingressFetch,requestInit:{headers:{Authorization:`Bearer ${fixture.key}`}}}));assert.equal((await client.listTools()).tools.length,12);
 for(const s of fixture.stores){const tool=tools.find(t=>t.upstreamId===s.id&&t.name==='list_products');const r=await client.callTool({name:tool.alias,arguments:{per_page:100}});assert.notEqual(r.isError,true);assert(r.structuredContent.products.some(p=>p.sku==='RELAY-DEMO-MUG'));}
 check('Official MCP client calls actual synthetic products in both independent stores');}finally{await client.close();}
 for(const s of fixture.stores){const resources=JSON.parse(kube(['get','deploy,sts,svc,pvc,ingress,secret,resourcequota,limitrange,networkpolicy','-n',s.namespace,'-o','json']));const summary=resources.items.map(x=>({kind:x.kind,name:x.metadata.name,...(x.kind==='PersistentVolumeClaim'?{volume:x.spec.volumeName,status:x.status.phase}:{}),...(x.kind==='Secret'?{keys:Object.keys(x.data)}:{}),...(x.kind==='ResourceQuota'?{hard:x.spec.hard,used:x.status.used}:{}),...(x.kind==='Deployment'||x.kind==='StatefulSet'?{ready:x.status.readyReplicas,containers:x.spec.template.spec.containers.map(c=>({name:c.name,image:c.image,resources:c.resources,readiness:!!c.readinessProbe,liveness:!!c.livenessProbe})),token:x.spec.template.spec.automountServiceAccountToken}: {})}));writeFileSync(`${dir}/resources-${s.id.slice(0,8)}.json`,JSON.stringify(summary,null,2)+'\n');assert(summary.filter(x=>x.kind==='PersistentVolumeClaim').length===2);assert(summary.filter(x=>x.kind==='Ingress').length===1);assert(summary.find(x=>x.kind==='ResourceQuota'));assert(summary.find(x=>x.kind==='LimitRange'));
 await page.goto(s.url+'/shop/');await expect(page.getByRole('heading',{name:'Shop',exact:true})).toBeVisible();}
 check('Both Ingress storefronts load with separate database/content PVCs, Secrets, quotas, limits and policies');
 await page.goto(origin+'/stores');await expect(page.getByRole('heading',{name:'Stores',exact:true})).toBeVisible();await shot('stores-ready-desktop');await page.getByRole('button',{name:'Inspect',exact:true}).first().click();await expect(page.getByRole('dialog')).toContainText('Actual lifecycle events');await shot('store-lifecycle-desktop');await page.getByLabel('Close dialog').click();
 await page.setViewportSize({width:390,height:844});await shot('stores-ready-mobile');await page.getByRole('button',{name:'Inspect',exact:true}).first().click();await shot('store-lifecycle-mobile');await page.getByLabel('Close dialog').click();await page.emulateMedia({reducedMotion:'reduce'});check('Desktop/mobile stores and lifecycle drawer have real state, readable spacing and no page overflow');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;await page.screenshot({path:'.local/m5-browser-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();writeFileSync(`${dir}/provisioning.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks,failure:report.failure}));}
