// Review the live console without new model traffic or overwriting the acceptance identities.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const origin='http://relay.localhost:18080';
const dir='docs/evidence/m4/visual';mkdirSync(dir,{recursive:true});
const i=JSON.parse(readFileSync('.local/m4-acceptance-identity.json','utf8'));
const progress=JSON.parse(readFileSync('.local/m4-chat-progress.json','utf8'));
const report={at:new Date().toISOString(),screenshots:[],checks:[],errors:[],modelTraffic:false};
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();const p=await context.newPage();
p.on('pageerror',e=>report.errors.push(e.message));
async function capture(name){
 await expect.poll(()=>p.evaluate(()=>document.fonts.status)).toBe('loaded');
 await p.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 await expect.poll(()=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const dialogs=await p.getByRole('dialog').count();
 if(dialogs){const box=await p.getByRole('dialog').boundingBox();assert(box.x>=0&&box.x+box.width<=(await p.evaluate(()=>innerWidth))+1,'Dialog extends beyond viewport');}
 await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});report.screenshots.push(name);report.checks.push(`${name}: loaded fonts, no page overflow${dialogs?', dialog within viewport':''}`);
}
async function close(){await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toBeHidden();}
try{
 await p.setViewportSize({width:1440,height:1000});await p.goto(origin);await capture('auth-desktop');
 await p.setViewportSize({width:390,height:844});await capture('auth-mobile');
 await p.getByRole('button',{name:'New here? Create an account'}).click();await capture('signup-mobile');
 await p.getByRole('button',{name:'Already have an account? Sign in'}).click();
 await p.getByLabel('Email',{exact:true}).fill(i.A.email);await p.getByLabel('Password',{exact:true}).fill(i.A.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await expect(p.getByRole('heading',{name:'Control room',exact:true})).toBeVisible();
 for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  await p.setViewportSize(size);
  for(const [route,heading] of [['','Control room'],['servers','MCP servers'],['tools','Tool library'],['agent','Agent workspace'],['audit','Audit explorer'],['team','Team'],['keys','API keys'],['settings','Settings']]){
   await p.goto(`${origin}/${route}`);await expect(p.locator('h1').filter({hasText:heading})).toBeVisible();
   if(route==='tools')await expect(p.getByRole('button',{name:/WooCommerce.*create_product/})).toBeVisible();
   if(route==='servers')await expect(p.getByRole('heading',{name:'Calendar UTC',exact:true})).toBeVisible();
   if(route==='agent'){await expect(p.getByLabel('Conversation history')).toBeVisible();await p.getByLabel('Conversation history').selectOption(progress.orders);await expect(p.locator('.message.assistant')).toBeVisible();await p.locator('details').first().evaluate(e=>e.open=true);}
   await capture(`${route||'overview'}-${size.name}`);
   if(route==='agent'){await p.locator('summary').filter({hasText:'Arguments'}).first().click();await p.locator('summary').filter({hasText:'Gateway result & audit correlation'}).first().click();await capture(`agent-inspection-${size.name}`);}
   if(route===''){await p.getByRole('button',{name:/Calendar UTC.*Connected/}).click();await capture(`overview-selected-${size.name}`);}
  }
  await p.goto(origin+'/servers');await p.getByRole('button',{name:'Connect server',exact:true}).click();await capture(`connect-${size.name}`);
  await p.getByLabel('Credential mode').selectOption('headers');await capture(`connect-headers-${size.name}`);await close();
  const row=p.locator('article.server-row').filter({has:p.getByRole('heading',{name:'Calendar UTC',exact:true})});await row.getByRole('button',{name:'Configure'}).click();await capture(`configure-${size.name}`);await close();
  await row.getByRole('button',{name:'Disable',exact:true}).click();await capture(`disable-confirm-${size.name}`);await close();await row.getByRole('button',{name:'Remove',exact:true}).click();await capture(`remove-confirm-${size.name}`);await close();
  await p.goto(origin+'/tools');await p.getByLabel('Search tools').fill('create_product');await p.getByRole('button',{name:/WooCommerce.*create_product/}).click();await capture(`schema-${size.name}`);await close();
  await p.goto(origin+'/team');const member=p.getByRole('row').filter({hasText:i.B.email}).first();await member.getByRole('button',{name:'Deactivate',exact:true}).click();await capture(`member-confirm-${size.name}`);await close();await p.getByRole('button',{name:'Invite member'}).click();await capture(`invitation-${size.name}`);await close();await p.getByRole('button',{name:'Add policy',exact:true}).click();await capture(`policy-${size.name}`);await close();
  await p.goto(origin+'/keys');await p.getByRole('button',{name:'Generate key',exact:true}).click();await capture(`generate-key-${size.name}`);await p.keyboard.press('Tab');assert(await p.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),'Dialog keyboard focus escaped');await close();
  const active=p.getByRole('row').filter({hasText:'M4 regression admin'}).filter({has:p.getByRole('button',{name:'Revoke',exact:true})}).first();await active.getByRole('button',{name:'Revoke',exact:true}).click();await capture(`revoke-confirm-${size.name}`);await close();
  await p.keyboard.press('Meta+k');await capture(`command-palette-${size.name}`);await p.getByLabel('Search navigation').fill('refresh');await p.getByRole('dialog').getByRole('button',{name:'Refresh workspace data',exact:true}).click();await expect(p.getByRole('dialog')).toBeHidden();report.checks.push(`${size.name}: authorized palette refresh executes real tools API`);
 }
 await p.emulateMedia({reducedMotion:'reduce'});await p.goto(origin+'/agent');await p.getByLabel('Conversation history').selectOption(progress.create);await capture('agent-create-mobile');
 const runs=await context.request.get(origin+'/api/chat/runs',{headers:{'x-relay-team':i.team}});const failed=(await runs.json()).runs.find(r=>r.status==='failed')?.id;
 if(failed){await p.getByLabel('Conversation history').selectOption(failed);await capture('agent-error-mobile');}
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.message;await p.screenshot({path:'.local/m4-visual-failure.png',fullPage:true});throw e;}finally{writeFileSync(`${dir}/review.json`,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({passed:report.passed,screenshots:report.screenshots.length,error:report.error}));}
