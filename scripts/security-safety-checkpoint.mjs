// Private pre-migration safety copy of owned resources; not a disaster-recovery acceptance claim.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,chmodSync,statSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {kube,env} from './mcp-kube.mjs';
const stamp=new Date().toISOString().replaceAll(':','-');
const dir=`.local/m6-safety-${stamp}`;mkdirSync(dir,{mode:0o700});chmodSync(dir,0o700);
const namespaces=JSON.parse(kube(['get','namespace','-o','json'])).items.filter(n=>n.metadata.labels?.['relay-owned']&&n.metadata.name.startsWith('relay')).map(n=>n.metadata.name);
const artifacts=[];
function save(name,bytes,type){const p=dir+'/'+name;writeFileSync(p,bytes,{mode:0o600});chmodSync(p,0o600);artifacts.push({name,type,bytes:statSync(p).size,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')});}
for(const ns of namespaces){
 save(ns+'-resources.json',kube(['get','secret,configmap,pvc,deploy,statefulset,service,ingress,networkpolicy,resourcequota,limitrange,serviceaccount,role,rolebinding','-n',ns,'-o','json']),'private resources');
 const pods=JSON.parse(kube(['get','pod','-n',ns,'-o','json'])).items.filter(p=>p.status.phase==='Running');
 for(const p of pods){
  const containers=p.spec.containers.map(c=>c.name);
  if(containers.includes('postgres'))save(ns+'-postgres.sql',kube(['exec','-n',ns,p.metadata.name,'-c','postgres','--','pg_dump','-U','postgres','-d','relay','--no-owner']),'PostgreSQL logical');
  if(containers.includes('mariadb'))save(ns+'-'+p.metadata.name+'-db.sql',kube(['exec','-n',ns,p.metadata.name,'-c','mariadb','--','sh','-c','MYSQL_PWD="$(cat /run/store/root-password)" mariadb-dump -u root --single-transaction --databases wordpress']),'MariaDB logical');
  if(containers.includes('wordpress')){
   const bytes=execFileSync('.tools/bin/kubectl',['exec','-n',ns,p.metadata.name,'-c','wordpress','--','tar','czf','-','-C','/var/www/html','.'],{env,encoding:null,stdio:['ignore','pipe','pipe'],maxBuffer:384*1024*1024});
   save(ns+'-'+p.metadata.name+'-content.tar.gz',bytes,'WordPress content');
  }
 }
}
save('persistent-volumes.json',kube(['get','pv','-o','json']),'private storage inventory');
writeFileSync(dir+'/manifest.json',JSON.stringify({at:new Date().toISOString(),artifacts},null,2)+'\n',{mode:0o600});
const result={at:new Date().toISOString(),passed:true,privateDirectory:dir,artifacts:artifacts.map(({name,type,bytes})=>({name,type,bytes})),restorationTested:false,scope:'Owned project pre-migration copy; no DR or RPO/RTO claim'};
writeFileSync('docs/evidence/m6/safety-checkpoint.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,artifacts:artifacts.length,bytes:artifacts.reduce((n,a)=>n+a.bytes,0),privateDirectory:dir,restorationTested:false}));
