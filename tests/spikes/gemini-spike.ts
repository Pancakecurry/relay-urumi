import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync,renameSync,chmodSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {policy,reserve,estimateUSD} from './model-budget.js';
import type {Budget} from './model-budget.js';

const record=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Malformed object in provider/ledger response');
  return value as Record<string,unknown>;
};
const number=(value:unknown)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid numeric metadata');return value;};
const config=parseEnv(readFileSync('.local/gemini.env','utf8'));
const verified=config['GEMINI_CREDIT_VERIFIED']==='true';
const approved=Number(config['GEMINI_APPROVED_ALLOWANCE_INR']);
const setupKey=config['GEMINI_API_KEY']?.trim();
if(!verified||approved!==200||!setupKey||config['GEMINI_MODEL']!==policy.model)throw new Error('M0 provider configuration/confirmed credit is missing');
const secretPath='.local/model-budget.json';
const lockPath='.local/model-budget.lock';
const mcpKey=readFileSync('.local/m0-token','utf8').trim();
const lock=openSync(lockPath,'wx',0o600); // Reject concurrent execution; no unsafe lock stealing.
const client=new Client({name:'relay-m0-gemini-spike',version:'0.0.0'},{versionNegotiation:{mode:'auto'}});
let runtimeKey=setupKey;
let budget:Budget={requests:0,reservedINR:0};
const evidence:Record<string,unknown>={at:new Date().toISOString(),model:policy.model,approvedAllowanceINR:approved,
  creditVerification:'Owner confirmed existing Gemini API prepaid credit on 2026-10-10',policy,
  currencyGuardNote:'INR 200/USD is a conservative cost guard, not an observed exchange rate or billing amount; includes 50% margin.',
  identity:'M0 Secret bearer credential; logged-in user identity is not implemented',gatewayURL:'http://127.0.0.1:18080/mcp',
  providerRequests:[],wire:[],passed:false,scope:'Isolated M0 spike, not product chat'};
const save=()=>{
  const json=JSON.stringify(evidence,null,2)+'\n';
  if([setupKey,runtimeKey,mcpKey].some(key=>key.length>=8&&json.includes(key)))throw new Error('Refusing credential-bearing evidence');
  writeFileSync('docs/evidence/gemini-spike.json',json);
};
const persistBudget=()=>{
  writeFileSync(secretPath+'.tmp',JSON.stringify({...budget,policyModel:policy.model,approvedINR:approved,updatedAt:new Date().toISOString()})+'\n',{mode:0o600});
  chmodSync(secretPath+'.tmp',0o600);renameSync(secretPath+'.tmp',secretPath);
};
try {
  try {const old=record(JSON.parse(readFileSync(secretPath,'utf8')));budget={requests:number(old['requests']),reservedINR:number(old['reservedINR'])};}
  catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
  // Validate the preflight before any credential upload or provider request.
  reserve(budget,verified,approved,1);
  const env={...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
  // Bootstrap the server-side runtime key in the dedicated encrypted cluster.
  const existing=execFileSync('.tools/bin/kubectl',['get','secret/relay-m0-gemini','-n','relay-m0','--ignore-not-found','-o','jsonpath={.metadata.name}:{.metadata.labels.relay-m0-purpose}'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});
  if(existing&&existing!=='relay-m0-gemini:model-spike')throw new Error('Refusing to update an unowned model Secret');
  execFileSync('.tools/bin/kubectl',['apply','--server-side','--field-manager=relay-m0-model-spike','-f','-'],{env,input:JSON.stringify({apiVersion:'v1',kind:'Secret',metadata:{name:'relay-m0-gemini',namespace:'relay-m0',labels:{'relay-m0-purpose':'model-spike'}},type:'Opaque',data:{key:Buffer.from(setupKey).toString('base64')}}),stdio:['pipe','pipe','pipe'],timeout:15000});
  const encoded=execFileSync('.tools/bin/kubectl',['get','secret/relay-m0-gemini','-n','relay-m0','-o','jsonpath={.data.key}'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000});
  runtimeKey=Buffer.from(encoded,'base64').toString('utf8');
  if(runtimeKey!==setupKey)throw new Error('Runtime Secret does not match supplied credential');
  evidence['runtimeCredentialSource']='Kubernetes Secret relay-m0/relay-m0-gemini (key); bootstrap file excluded from Git/Docker';
  await client.connect(new StreamableHTTPClientTransport(new URL(String(evidence['gatewayURL'])),{
    requestInit:{headers:{Authorization:`Bearer ${mcpKey}`}},fetch:async(input,init)=>{
      const response=await fetch(input,init);
      const method=typeof init?.body==='string'?record(JSON.parse(init.body))['method']:init?.method;
      (evidence['wire'] as unknown[]).push({method,status:response.status,protocol:new Headers(init?.headers).get('MCP-Protocol-Version')});return response;
    }}));
  const catalog=await client.listTools();const ping=catalog.tools.find(t=>t.name==='ping');
  if(!ping)throw new Error('Real gateway ping tool is missing');
  // Use the real catalog's JSON schema; provider accepts parametersJsonSchema.
  const { $schema: omittedSchema, ...schema }=ping.inputSchema;void omittedSchema;
  const tools=[{functionDeclarations:[{name:ping.name,description:ping.description,parametersJsonSchema:schema}]}];
  const marker=`relay-model-${Date.now()}`;
  const contents:unknown[]=[{role:'user',parts:[{text:`Call ping with message ${marker}, then tell me the returned pong and exact pod name. You must use the tool to learn the pod name.`}]}];
  const request=async(mode:'AUTO'|'NONE')=>{
    const body=JSON.stringify({contents,tools,toolConfig:{functionCallingConfig:{mode}},generationConfig:{candidateCount:1,maxOutputTokens:policy.maxOutputTokens,thinkingConfig:{thinkingLevel:'MINIMAL',includeThoughts:false}},store:false});
    budget=reserve(budget,verified,approved,Buffer.byteLength(body));persistBudget();
    const requests=evidence['providerRequests'] as unknown[];
    const entry:Record<string,unknown>={number:budget.requests,bodyBytes:Buffer.byteLength(body),reservationINR:policy.reservationINR,state:'reserved-before-send'};
    requests.push(entry);save();
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${policy.model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':runtimeKey},body,signal:AbortSignal.timeout(45000),redirect:'error'});
    entry['status']=response.status;
    const data=record(await response.json());
    if(!response.ok){entry['state']='provider-error-reservation-retained';const err=record(data['error']);entry['providerCode']=err['status'];save();throw new Error(`Gemini HTTP ${response.status}; ${String(err['status']??'provider error')}`);}
    const usage=record(data['usageMetadata']);const prompt=number(usage['promptTokenCount']);const output=number(usage['candidatesTokenCount']??0);const thoughts=number(usage['thoughtsTokenCount']??0);
    entry['usage']={promptTokenCount:prompt,candidatesTokenCount:output,thoughtsTokenCount:thoughts,totalTokenCount:usage['totalTokenCount']};
    entry['estimatedStandardUSD']=estimateUSD(prompt,output,thoughts);entry['state']='response-received-reservation-retained';entry['modelVersion']=data['modelVersion'];save();
    const candidates=data['candidates'];if(!Array.isArray(candidates)||candidates.length!==1)throw new Error('Expected exactly one provider candidate');
    const candidate=record(candidates[0]);entry['finishReason']=candidate['finishReason'];
    if(candidate['finishReason']!=='STOP')throw new Error('Provider response incomplete or blocked; no retry');
    return record(candidate['content']);
  };
  const first=await request('AUTO');const firstParts=first['parts'];if(!Array.isArray(firstParts))throw new Error('No model parts');
  const calls=firstParts.map(record).filter(p=>p['functionCall']);if(calls.length!==1)throw new Error('Model did not choose exactly one real tool call');
  const call=record(calls[0]?.['functionCall']);const args=record(call['args']);
  if(call['name']!=='ping'||args['message']!==marker||Object.keys(args).length!==1)throw new Error('Unexpected tool or arguments; not executed');
  const result=await client.callTool({name:'ping',arguments:{message:marker}});
  if(result.isError)throw new Error('Real MCP call failed');
  const part=result.content.find(p=>p.type==='text');if(!part||part.type!=='text')throw new Error('No actual MCP text result');
  const output=record(JSON.parse(part.text));if(output['pong']!==marker||typeof output['pod']!=='string')throw new Error('Invalid real tool response');
  evidence['toolCall']={name:'ping',arguments:args,result:output};
  // Keep the complete model content, including opaque signatures, in memory.
  contents.push(first,{role:'user',parts:[{functionResponse:{name:'ping',...(typeof call['id']==='string'?{id:call['id']}:{}),response:output}}]});
  const last=await request('NONE');const lastParts=last['parts'];if(!Array.isArray(lastParts))throw new Error('No final model answer');
  const answer=lastParts.map(record).filter(p=>!p['thought']).map(p=>typeof p['text']==='string'?p['text']:'').join('');
  if(!answer.includes(marker)||!answer.includes(output['pod']))throw new Error('Final model answer does not substantiate the actual pong/pod');
  evidence['answer']=answer;evidence['passed']=true;evidence['budget']=budget;save();
  console.log(JSON.stringify({passed:true,model:policy.model,requests:budget.requests,reservedINR:budget.reservedINR,tool:output}));
} catch(error) {
  // Never persist raw child-process stderr/request objects, which may contain credentials.
  evidence['budget']=budget;evidence['error']=error instanceof Error?error.message.replaceAll(setupKey,'[redacted]').replaceAll(runtimeKey,'[redacted]').replaceAll(mcpKey,'[redacted]').slice(0,300):'Spike failed';save();
  console.log('M0 model spike failed; sanitized evidence saved; reservations retained.');process.exitCode=1;
} finally {try{await client.close();}finally{closeSync(lock);unlinkSync(lockPath);}}
