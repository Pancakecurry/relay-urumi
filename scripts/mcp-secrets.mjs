import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const env = {...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
const kube = args => execFileSync('.tools/bin/kubectl',args,{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
export function apply(object) { return execFileSync('.tools/bin/kubectl',['apply','--server-side','--field-manager=relay-m2','-f','-'],{env,input:JSON.stringify(object),encoding:'utf8',stdio:['pipe','pipe','pipe']}); }
const targets = [['woo','relay-store-m1','woo-mcp-auth'],['calendar','relay-upstreams','calendar-mcp-auth'],['totals','relay-upstreams','totals-mcp-auth']];
for (const name of ['relay-upstreams','relay-platform']) {
  let current;try{current=JSON.parse(kube(['get','namespace',name,'-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
  if(current && current.metadata.labels?.['relay-owned']!=='m2')throw new Error('Namespace ownership conflict');
  if(!current)apply({apiVersion:'v1',kind:'Namespace',metadata:{name,labels:{'relay-owned':'m2'}}});
}
const path = '.local/m2-upstream-tokens.json';
let tokens;
try{tokens=JSON.parse(readFileSync(path,'utf8'));}catch(e){
  if(e.code!=='ENOENT')throw e;
  for(const [,ns,name] of targets){try{kube(['get','secret',name,'-n',ns]);throw new Error('Recover existing private token backup; refusing rotation');}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}}
  tokens=Object.fromEntries(targets.map(([key])=>[key,randomBytes(32).toString('hex')]));
  writeFileSync(path,JSON.stringify(tokens)+'\n',{mode:0o600,flag:'wx'});
}
chmodSync(path,0o600);
for (const [key,ns,name] of targets) {
  if(!/^[a-f0-9]{64}$/.test(tokens[key]))throw new Error('Invalid private token');
  const data={token:Buffer.from(tokens[key]).toString('base64')};
  let current;try{current=JSON.parse(kube(['get','secret',name,'-n',ns,'-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
  if(current && (current.metadata.labels?.['relay-owned']!=='m2'||current.data.token!==data.token))throw new Error('Secret ownership/value conflict');
  apply({apiVersion:'v1',kind:'Secret',type:'Opaque',metadata:{name,namespace:ns,labels:{'relay-owned':'m2'}},data});
}
// Privileged, short-lived acceptance client receives only upstream tokens, never store credentials.
apply({apiVersion:'v1',kind:'Secret',type:'Opaque',metadata:{name:'m2-acceptance-tokens',namespace:'relay-platform',labels:{'relay-owned':'m2'}},
  data:Object.fromEntries(Object.entries(tokens).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))});
console.log(JSON.stringify({upstreamSecrets:targets.map(([,namespace,name])=>({namespace,name})),valuesPrinted:false}));
