import {parseEnv} from 'node:util';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {kube} from './mcp-kube.mjs';
const settings=parseEnv(readFileSync('.local/gemini.env','utf8'));
const old=JSON.parse(readFileSync('.local/model-budget.json','utf8'));
if(settings.GEMINI_CREDIT_VERIFIED!=='true'||settings.GEMINI_APPROVED_ALLOWANCE_INR!=='200'||!(settings.GEMINI_API_KEY?.trim().length>20))throw new Error('Verified prepaid settings missing');
// Do not reset the original ledger. The conservative M4 ceiling assumes its full ₹100 is retained.
if(old.requests!==2||old.reservedINR!==100||old.approvedINR!==200)throw new Error('M0 budget reconciliation required');
let existing;try{existing=JSON.parse(kube(['get','secret','relay-model','-n','relay-platform','-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
if(existing&&existing.metadata.labels?.['relay-owned']!=='m4')throw new Error('Secret ownership mismatch');
const data={'api-key':Buffer.from(settings.GEMINI_API_KEY.trim()).toString('base64')};
if(existing&&existing.data['api-key']!==data['api-key'])throw new Error('Refusing silent model-key rotation');
const object={apiVersion:'v1',kind:'Secret',metadata:{name:'relay-model',namespace:'relay-platform',labels:{'relay-owned':'m4'}},type:'Opaque',data};
execFileSync('.tools/bin/kubectl',['apply','--server-side','--field-manager=relay-m4-model','-f','-'],{env:{...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`},input:JSON.stringify(object),stdio:['pipe','ignore','pipe']});
console.log('Verified prepaid model Secret prepared; key redacted; M0 ledger preserved.');
