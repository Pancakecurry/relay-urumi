import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const namespace = process.env.STORE_NAMESPACE || 'relay-store-m1';
if (!/^relay-store-[a-z0-9-]+$/.test(namespace)) throw new Error('Use a dedicated relay-store namespace');
const kubectl = args => execFileSync('.tools/bin/kubectl', args, {encoding:'utf8', env:{...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`},stdio:['pipe','pipe','pipe']});
let ns;try {ns=JSON.parse(kubectl(['get','namespace',namespace,'-o','json']));} catch(error) {if (!error.stderr?.includes('NotFound')) throw error;}
if(ns && ns.metadata.labels?.['relay-owned'] !== 'm1') throw new Error('Namespace ownership conflict');
if(!ns) execFileSync('.tools/bin/kubectl',['apply','--server-side','-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'Namespace',metadata:{name:namespace,labels:{'relay-owned':'m1'}}}),env:{...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`},stdio:['pipe','pipe','pipe']});
const path=`.local/${namespace}-credentials.json`;
let creds;
try{creds=JSON.parse(readFileSync(path,'utf8'));}catch(error){
 if(error.code!=='ENOENT')throw error;
 // Refuse to replace persisted store secrets if the local backup is missing.
 const existing=JSON.parse(kubectl(['get','secret','-n',namespace,'-o','json'])).items.filter(x=>x.metadata.labels?.['relay-owned']==='m1');
 if(existing.length)throw new Error('Existing store Secrets: recover the private backup; refusing rotation');
 const hex=n=>randomBytes(n).toString('hex');
 creds={runtime:{'db-password':hex(32),'root-password':hex(32)},admin:{username:'relay_admin',password:hex(32)},adapter:{'consumer-key':`ck_${hex(20)}`,'consumer-secret':`cs_${hex(20)}`}};
 for(const key of ['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'])creds.runtime[key]=hex(48);
 mkdirSync('.local',{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(creds,null,2)+'\n',{mode:0o600,flag:'wx'});
}
chmodSync(path,0o600);
for(const [name,values] of Object.entries(creds)){
 let existing;try{existing=JSON.parse(kubectl(['get','secret',`store-${name}`,'-n',namespace,'-o','json']));}catch(error){if(!error.stderr?.includes('NotFound'))throw error;}
 if(existing && (existing.metadata.labels?.['relay-owned']!=='m1' || Object.entries(values).some(([k,v])=>existing.data[k]!==Buffer.from(v).toString('base64'))))throw new Error('Secret ownership/value conflict; refusing overwrite');
 const secret={apiVersion:'v1',kind:'Secret',metadata:{name:`store-${name}`,namespace,labels:{'relay-owned':'m1'}},type:'Opaque',data:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))};
 execFileSync('.tools/bin/kubectl',['apply','--server-side','--field-manager=relay-store-secrets','-f','-'],{input:JSON.stringify(secret),env:{...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`},stdio:['pipe','pipe','pipe']});
}
console.log(JSON.stringify({namespace,privateBackup:path,secrets:['store-runtime','store-admin','store-adapter'],valuesPrinted:false}));
