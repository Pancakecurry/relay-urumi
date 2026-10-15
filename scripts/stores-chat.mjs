import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const f=JSON.parse(readFileSync('.local/m5-identity.json','utf8')),file='.local/m5-identity.json';
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const p=await context.newPage();const origin='http://relay.localhost:18080';
async function api(path){const r=await context.request.get(origin+'/api/'+path,{headers:{'x-relay-team':f.team}});assert.equal(r.status(),200);return r.json();}
try{
 await p.goto(origin);await p.getByLabel('Email',{exact:true}).fill(f.email);await p.getByLabel('Password',{exact:true}).fill(f.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await expect(p.getByRole('heading',{name:'Control room',exact:true})).toBeVisible();await p.getByRole('link',{name:'Agent workspace',exact:true}).click();
 const orders=f.stores.map(s=>JSON.parse(readFileSync(`docs/evidence/m5/${s.id.slice(0,8)}/checkout.json`,'utf8')));
 if(!f.compareRun){
  const budget=(await api('overview')).budget;assert(Number(budget.remaining_paise)>=500,'No authorized provider reservation available');
  const prompt=`Compare today's orders for Aurora Synthetic Store (${f.stores[0].id}) and Boreal Synthetic Store (${f.stores[1].id}) in Asia/Kolkata. Call Calendar day_range with timezone Asia/Kolkata and omit the optional date. Then retrieve both stores' list_orders using those bounds, preferably in one step. Report actual order IDs, count, currency and exact total for EACH named store. These are independent stores, so order IDs may overlap. Follow pagination if necessary. Use Decimal Totals sum_orders separately for each store if needed. Do not create or change anything. Report partial failures honestly.`;
  await p.getByLabel('Message Relay').fill(prompt);const response=p.waitForResponse(r=>r.url()===origin+'/api/chat/runs'&&r.request().method()==='POST');await p.getByRole('button',{name:'Run',exact:true}).click();const r=await response;assert.equal(r.status(),202);f.compareRun=(await r.json()).id;writeFileSync(file,JSON.stringify(f)+'\n',{mode:0o600});
 }else await p.getByLabel('Conversation history').selectOption(f.compareRun);
 let result;await expect.poll(async()=>{result=await api('chat/runs/'+f.compareRun);return result.run.status;},{timeout:190000,intervals:[1000,3000]}).not.toBe('running');
 writeFileSync('docs/evidence/m5/chat-comparison.json',JSON.stringify({at:new Date().toISOString(),userId:f.user,...result},null,2)+'\n');assert.equal(result.run.status,'success',result.run.error_code);
 const finishes=result.events.filter(e=>e.kind==='tool.finish'&&e.data.status==='success');
 for(let index=0;index<2;index++){const store=f.stores[index],order=orders[index];assert(finishes.some(e=>e.data.alias.startsWith(`store_${store.id.replaceAll('-','')}_list_orders`)&&e.data.result?.structuredContent?.orders.some(o=>o.id===order.orderId&&o.total===order.total)),'Missing actual store order');assert(result.run.answer.includes(store.name.split(' ')[0]));assert(result.run.answer.includes(order.total));}
 const audits=(await api('audit')).calls;for(const event of finishes){const id=event.data.result?._meta?.relay?.auditId;assert(audits.some(a=>a.id===id&&a.user_id===f.user&&a.status==='success'),'Wrong actor attribution');}
 await expect(p.locator('.message.assistant')).toBeVisible({timeout:15000});await p.screenshot({path:'docs/evidence/m5/chat-comparison-desktop.png',fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'docs/evidence/m5/chat-comparison-mobile.png',fullPage:true});
 writeFileSync('docs/evidence/m5/chat-verification.json',JSON.stringify({at:new Date().toISOString(),passed:true,run:f.compareRun,actor:f.user,stores:f.stores.map(s=>s.id),toolCalls:finishes.length,auditIds:finishes.map(e=>e.data.result?._meta?.relay?.auditId),realModel:true,gatewayOnly:true},null,2)+'\n');console.log(JSON.stringify({passed:true,run:f.compareRun,realGatewayCalls:finishes.length}));
}finally{await browser.close();}
