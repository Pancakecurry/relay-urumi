// Local owned single-server k3d only. Credential bytes stay in private memory/files.
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';
const cluster=process.env.RELAY_ROTATION_CLUSTER;
assert(['relay-m4-clean','relay-m0'].includes(cluster),'Only specifically owned local clusters');
if(cluster==='relay-m0')assert(JSON.parse(readFileSync('docs/evidence/m4/clean-token-rotation.json')).passed,'Disposable restart proof must pass first');
const config=resolve(process.env.RELAY_ROTATION_KUBECONFIG||'.local/kubeconfig'),node=`k3d-${cluster}-server-0`;
const run=(file,args,input)=>{try{return execFileSync(file,args,{encoding:'utf8',input,timeout:180000,maxBuffer:33554432,stdio:['pipe','pipe','pipe'],env:{...process.env,KUBECONFIG:config}});}catch{throw new Error('Private local rotation operation failed: '+file+' '+args.slice(0,2).join(' '));}};
const docker=(args,input)=>run('docker',args,input),kube=args=>run('.tools/bin/kubectl',args);
const members=JSON.parse(run('.tools/bin/k3d',['cluster','list','-o','json'])).find(c=>c.name===cluster);assert(members&&members.nodes.filter(n=>n.role==='server').length===1&&members.nodes.every(n=>n.role!=='agent'));
const privateDir=mkdtempSync(resolve(`.local/cluster-rotation-${cluster}-`));chmodSync(privateDir,0o700);
const oldToken=docker(['exec',node,'cat','/var/lib/rancher/k3s/server/token']).trim();writeFileSync(privateDir+'/old-token',oldToken,{mode:0o600});
const oldConfig=docker(['exec',node,'sh','-c','test ! -f /etc/rancher/k3s/config.yaml || cat /etc/rancher/k3s/config.yaml']);assert(!/^token(-file)?:/m.test(oldConfig),'Review existing token configuration instead of overriding');
writeFileSync(privateDir+'/old-config.yaml',oldConfig,{mode:0o600});
const address=new URL(JSON.parse(kube(['config','view','--minify','-o','json'])).clusters[0].cluster.server);
const bindings=JSON.parse(docker(['inspect',`k3d-${cluster}-serverlb`,'--format','{{json .NetworkSettings.Ports}}']))['6443/tcp'];
assert(['127.0.0.1','0.0.0.0'].includes(address.hostname)&&bindings?.length&&bindings.every(b=>b.HostIp==='127.0.0.1'&&b.HostPort===address.port),'Actual Docker API bindings must be loopback only');
address.hostname='127.0.0.1';const endpoint=address.href;
const ca=docker(['exec',node,'cat','/var/lib/rancher/k3s/server/tls/server-ca.crt']);
const check=token=>new Promise((yes,no)=>{const password=token.split('::').at(-1).replace(/^server:/,'');const request=https.get(new URL('/v1-k3s/encrypt/status',endpoint),{ca,auth:'server:'+password},response=>{response.resume();response.on('end',()=>yes(response.statusCode));});request.on('error',no);request.setTimeout(10000,()=>request.destroy(Error('Local token validation timeout')));});
assert.equal(await check(oldToken),200,'Old token should initially authenticate');
const pvcBefore=JSON.parse(kube(['get','pvc','-A','-o','json'])).items.map(x=>({namespace:x.metadata.namespace,name:x.metadata.name,uid:x.metadata.uid}));
// Quiesce the owned server before copying SQLite, WAL, bootstrap credentials and TLS for recovery.
docker(['stop','--time','30',node]);docker(['cp',node+':/var/lib/rancher/k3s/server',privateDir+'/server']);docker(['start',node]);
let restored=false;for(let n=0;n<90;n++){try{kube(['get','--raw=/readyz','--request-timeout=3s']);restored=true;break;}catch{await new Promise(r=>setTimeout(r,2000));}}assert(restored,'API must return after backup restart');
kube(['wait','--for=condition=Ready','nodes','--all','--timeout=120s']);
// Exact selected K3s source reads TokenFile after K3S_TOKEN; persistent config survives Docker restart.
docker(['exec','-i',node,'sh','-c','mkdir -p /etc/rancher/k3s; umask 077; cat > /etc/rancher/k3s/config.yaml'],oldConfig+'\ntoken-file: /var/lib/rancher/k3s/server/token\n');
assert(docker(['exec',node,'cat','/etc/rancher/k3s/config.yaml']).includes('token-file: /var/lib/rancher/k3s/server/token'),'Read back persisted startup configuration before rotation');
docker(['exec',node,'k3s','token','rotate']); // Never log command stdout: it can contain the new token.
const newToken=docker(['exec',node,'cat','/var/lib/rancher/k3s/server/token']).trim();assert(oldToken!==newToken,'Rotation must change credential');writeFileSync(privateDir+'/new-token',newToken,{mode:0o600});
docker(['restart','--time','30',node]);
// Docker restart starts a new process; explicitly wait for API and readiness, not stale Ready cache.
let ready=false;for(let n=0;n<90;n++){try{kube(['get','--raw=/readyz','--request-timeout=3s']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,2000));}}assert(ready,'Restarted API must become healthy');
kube(['wait','--for=condition=Ready','nodes','--all','--timeout=120s']);
assert(docker(['exec',node,'cat','/var/lib/rancher/k3s/server/token']).trim()===newToken,'Restart must preserve rotated credential');
const oldStatus=await check(oldToken),newStatus=await check(newToken);assert.equal(oldStatus,401);assert.equal(newStatus,200);
const pvcAfter=JSON.parse(kube(['get','pvc','-A','-o','json'])).items.map(x=>({namespace:x.metadata.namespace,name:x.metadata.name,uid:x.metadata.uid}));assert.deepEqual(pvcAfter,pvcBefore);
const path=process.env.RELAY_ROTATION_EVIDENCE||'docs/evidence/m4/token-rotation.json';mkdirSync(dirname(path),{recursive:true});
const result={at:new Date().toISOString(),passed:true,cluster,version:docker(['exec',node,'k3s','--version']).trim(),oldTokenStatus:oldStatus,newTokenStatus:newStatus,actualDockerRestart:true,pvcIdentitiesPreserved:true,privateQuiescedBackup:privateDir,credentialValuesPrinted:false,startup:'persisted token-file overrides immutable stale K3S_TOKEN; k3d label retains invalid old token; future node additions require explicit new private token',sources:['https://docs.k3s.io/cli/token','https://raw.githubusercontent.com/k3s-io/k3s/v1.37.1%2Bk3s1/pkg/cli/server/server.go']};writeFileSync(path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
