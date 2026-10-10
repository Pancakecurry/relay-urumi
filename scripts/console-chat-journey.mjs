import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const identity=JSON.parse(readFileSync('.local/m4-acceptance-identity.json','utf8'));
const file='.local/m4-chat-progress.json';
const progress=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{team:identity.team,sku:`RELAY-M4-${randomUUID().slice(0,8)}`};
assert.equal(progress.team,identity.team,'Do not reuse another workspace journey');
const phase=process.argv[2];assert(['create','orders'].includes(phase));
const origin='http://relay.localhost:18080';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
async function api(path){const r=await context.request.get(origin+'/api/'+path,{headers:{'x-relay-team':identity.team}});assert.equal(r.status(),200);return r.json();}
const save=()=>writeFileSync(file,JSON.stringify(progress)+'\n',{mode:0o600});
try{
 await page.goto(origin);await page.getByLabel('Email',{exact:true}).fill(identity.A.email);await page.getByLabel('Password',{exact:true}).fill(identity.A.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Control room',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Agent workspace',exact:true}).click();
 if(!progress[phase]){
  const checkout=phase==='orders'?JSON.parse(readFileSync('docs/evidence/m4/checkout.json','utf8')):null;
  const prompt=phase==='create'?`Explicitly create and publish one simple synthetic demo product named Urumi Demo Mug, regular price 199.00 INR, SKU ${progress.sku}. Set description to Synthetic assessment demo; not a real shipment. Use the WooCommerce create_product tool. Report the actual product ID, price and storefront link.`:`What orders came in today in Asia/Kolkata? Use Calendar day_range with timezone Asia/Kolkata and OMIT the optional date argument so the server computes today. Then use WooCommerce list_orders with the returned after/before bounds. This is a real demonstration: include actual order IDs and decimal totals, and confirm whether COD order ${checkout.orderId} is present. Do not modify any order.`;
  await page.getByLabel('Message Relay').fill(prompt);
  const response=page.waitForResponse(r=>r.url()===origin+'/api/chat/runs'&&r.request().method()==='POST');await page.getByRole('button',{name:'Run',exact:true}).click();const r=await response;assert.equal(r.status(),202);progress[phase]=(await r.json()).id;save();
 }else{await page.getByLabel('Conversation history').selectOption(progress[phase]);}
 let result;
 await expect.poll(async()=>{result=await api('chat/runs/'+progress[phase]);return result.run.status;},{timeout:190000,intervals:[1000,2000,3000]}).not.toBe('running');
 const secrets=[identity.memberKey,identity.adminCookie,identity.memberCookie,identity.A.password,identity.B.password,...Object.values(JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')))];assert(!secrets.some(s=>s&&JSON.stringify(result).includes(s)),'Private credential in chat');
 writeFileSync(`docs/evidence/m4/chat-${phase}.json`,JSON.stringify({at:new Date().toISOString(),userId:identity.users.A,sku:progress.sku,...result},null,2)+'\n');
 assert.equal(result.run.status,'success',`Real model run failed: ${result.run.error_code}`);
 assert(result.events.some(e=>e.kind==='tool.finish'&&e.data.status==='success'),'No successful real gateway execution');
 await expect(page.locator('.message.assistant')).toBeVisible({timeout:15000});await page.screenshot({path:`docs/evidence/m4/09-chat-${phase}-desktop.png`,fullPage:true});
 if(phase==='orders'){const checkout=JSON.parse(readFileSync('docs/evidence/m4/checkout.json','utf8'));assert(result.run.answer.includes(String(checkout.orderId)));assert(result.events.filter(e=>e.kind==='tool.finish'&&e.data.status==='success').length>=2);assert(result.events.some(e=>e.kind==='tool.finish'&&e.data.result?.structuredContent?.orders?.some(o=>o.id===checkout.orderId)), "Checkout order must be in today’s actual list_orders page, not a compensating get_order");await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/evidence/m4/10-chat-orders-mobile.png',fullPage:true});}
 console.log(JSON.stringify({passed:true,phase,runId:result.run.id,tools:result.events.filter(e=>e.kind==='tool.finish').length,sku:progress.sku}));
}finally{await browser.close();}
