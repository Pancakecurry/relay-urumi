// External model host: MCP setup contains only gateway URL and B's personal key.
// The operator supplies the model credential/budget separately, as in any LLM host.
import {runAgent} from '../dist/packages/model-provider/src/agent.js';
import {kube} from './mcp-kube.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const output='docs/evidence/m4/external-agent.json';
if(existsSync(output))throw new Error('Existing external model evidence retained; use a new explicitly reviewed run instead of silently spending again');
const i=JSON.parse(readFileSync('.local/m4-acceptance-identity.json','utf8'));
const order=JSON.parse(readFileSync('docs/evidence/m4/checkout.json','utf8'));
const modelSecret=JSON.parse(kube(['get','secret','relay-model','-n','relay-platform','-o','json']));
const key=Buffer.from(modelSecret.data['api-key'],'base64').toString().trim();
const sql=(s)=>kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-v','ON_ERROR_STOP=1','-Atc',s]).trim();
const runId=randomUUID();const report={at:new Date().toISOString(),host:'Relay external CLI model host 0.4.0',gateway:'http://relay.localhost:18080/mcp',userId:i.users.B,identitySource:'personal API key',runId,events:[]};
try{
 report.answer=await runAgent({prompt:`Use Calendar day_range to get today's Asia/Kolkata bounds, then WooCommerce list_orders to list actual orders in that interval. Include actual IDs and decimal totals. Confirm whether COD order ${order.orderId} is present. Do not modify any data.`,key,gateway:report.gateway,credential:async()=>i.memberKey,signal:AbortSignal.timeout(180000),reserve:async()=>sql(`SELECT app.reserve_model('${runId}'::uuid)`),usage:async(r,u)=>{sql(`SELECT app.model_usage('${r}'::uuid,'${JSON.stringify(u).replaceAll("'","''")}'::jsonb)`);},event:async e=>{report.events.push({...e,at:new Date().toISOString()});}});
 assert(report.answer.includes(String(order.orderId)),'External answer must include actual checkout order');assert(report.events.some(e=>e.kind==='tool.finish'&&e.data.result?.structuredContent?.orders?.some(o=>o.id===order.orderId)), 'Actual today list must contain checkout order');
 assert.equal(report.events.find(e=>e.kind==='discovery').data.count,12);
 assert(report.events.filter(e=>e.kind==='tool.finish'&&e.data.status==='success').length>=2);
 report.passed=true;
}catch(e){report.passed=false;report.error=e.name;report.code=e.statusCode??null;report.message=String(e.message).replaceAll(key,'[redacted]').replaceAll(i.memberKey,'[redacted]');process.exitCode=1;}finally{
 const raw=JSON.stringify(report,null,2);assert(![key,i.memberKey,...Object.values(JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')))].some(v=>raw.includes(v)));writeFileSync(output,raw+'\n');console.log(JSON.stringify({passed:report.passed,runId,userId:report.userId,tools:report.events.filter(e=>e.kind==='tool.finish').length,error:report.error,code:report.code}));
}
