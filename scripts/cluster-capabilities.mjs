import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const env = { ...process.env, KUBECONFIG: `${process.cwd()}/.local/kubeconfig` };
const k = (...args) => execFileSync('.tools/bin/kubectl', args, { env, encoding: 'utf8', timeout: 100000, stdio: ['pipe','pipe','pipe'] }).trim();
const apply = obj => execFileSync('.tools/bin/kubectl', ['apply','-f','-'], {env, input:JSON.stringify(obj),encoding:'utf8',timeout:30000}).trim();
const namespace = 'relay-m0';
const image = JSON.parse(k('get','deployment/relay-m0-proof','-n',namespace,'-o','json')).spec.template.spec.containers[0].image;
const results = { at: new Date().toISOString(), image, checks: [] };
const evidence = 'docs/evidence/cluster-capabilities.json';
function record(name, details) { results.checks.push({name,passed:true,details}); writeFileSync(evidence,JSON.stringify(results,null,2)+'\n'); console.log(name, 'PASS'); }
function ownResource(kind, name) {
  const raw=k('get',kind,name,'-n',namespace,'--ignore-not-found','-o','json');
  if (raw && JSON.parse(raw).metadata.labels?.['relay-m0-test'] !== 'capabilities') throw new Error(`Refusing to modify unowned ${kind}/${name}`);
}
function pod(name, access, storage = false) {
  ownResource('pod',name);
  if(k('get','pod',name,'-n',namespace,'--ignore-not-found','-o','name')) k('delete',`pod/${name}`,'-n',namespace,'--grace-period=5','--wait=true','--timeout=30s');
  const mounts=storage?[{name:'data',mountPath:'/data'}]:[];
  const volumes=storage?[{name:'data',persistentVolumeClaim:{claimName:'relay-m0-storage-proof'}}]:[];
  apply({apiVersion:'v1',kind:'Pod',metadata:{name,namespace,labels:{'relay-m0-test':'capabilities','relay-m0-access':access}},spec:{automountServiceAccountToken:false,terminationGracePeriodSeconds:5,
    securityContext:{runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000,seccompProfile:{type:'RuntimeDefault'}},
    containers:[{name:'probe',image,imagePullPolicy:'IfNotPresent',command:['node','-e',"process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],
      resources:{requests:{cpu:'25m',memory:'32Mi'},limits:{cpu:'100m',memory:'96Mi'}},
      securityContext:{allowPrivilegeEscalation:false,readOnlyRootFilesystem:true,capabilities:{drop:['ALL']}},volumeMounts:mounts}],volumes}});
  k('wait',`pod/${name}`,'-n',namespace,'--for=condition=Ready','--timeout=90s');
}
const run = (name, code) => k('exec',name,'-n',namespace,'--','node','--input-type=module','-e',code);
const url = 'http://relay-m0-proof.relay-m0.svc.cluster.local:3000/health/ready';
const created=[];
try {
  const nodes=JSON.parse(k('get','nodes','-o','json'));
  if (!nodes.items.every(n=>n.status.conditions.some(c=>c.type==='Ready'&&c.status==='True'))) throw new Error('Unhealthy node');
  record('healthy-node',nodes.items.map(n=>({name:n.metadata.name,version:n.status.nodeInfo.kubeletVersion})));
  const encryption=execFileSync('docker',['exec','k3d-relay-m0-server-0','k3s','secrets-encrypt','status'],{encoding:'utf8',timeout:15000});
  if(!/Encryption Status:\s*Enabled/i.test(encryption)) throw new Error('Secret encryption not enabled');
  record('secret-encryption-enabled',encryption.trim());
  const proofPod=JSON.parse(k('get','pods','-n',namespace,'-l','app.kubernetes.io/name=relay-m0-proof','-o','json')).items.find(p=>p.status.phase==='Running');
  if(!proofPod)throw new Error('Proof pod absent');
  const secretMounted=run(proofPod.metadata.name,"import {readFileSync} from 'node:fs';console.log(JSON.stringify({mounted:readFileSync('/run/relay-secret/token','utf8').trim().length>=32,uid:process.getuid()}))");
  if(!JSON.parse(secretMounted).mounted||JSON.parse(secretMounted).uid!==1000)throw new Error('Secret mount/non-root check failed');
  record('secret-volume-and-non-root',JSON.parse(secretMounted));
  for(const [name,access] of [['relay-m0-network-allowed','allowed'],['relay-m0-network-denied','denied']]) {
    created.push(name);pod(name,access);
    const dns=JSON.parse(run(name,"import {lookup} from 'node:dns/promises';console.log(JSON.stringify(await lookup('relay-m0-proof.relay-m0.svc.cluster.local')))"));
    record(`dns-${access}`,dns);
  }
  const allowed=JSON.parse(run('relay-m0-network-allowed',`const r=await fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({status:r.status,body:await r.json()}));`));
  if(allowed.status!==200)throw new Error(`Allowed service request failed: ${JSON.stringify(allowed)}`);record('service-network-allowed',allowed);
  const denied=JSON.parse(run('relay-m0-network-denied',`try{await fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(3000)});console.log(JSON.stringify({blocked:false}));}catch(e){console.log(JSON.stringify({blocked:true,reason:e.name}));}`));
  if(!denied.blocked)throw new Error('NetworkPolicy failed to deny');record('networkpolicy-denied',denied);
  ownResource('pvc','relay-m0-storage-proof');
  apply({apiVersion:'v1',kind:'PersistentVolumeClaim',metadata:{name:'relay-m0-storage-proof',namespace,labels:{'relay-m0-test':'capabilities'}},spec:{accessModes:['ReadWriteOnce'],storageClassName:'local-path',resources:{requests:{storage:'16Mi'}}}});
  const marker=randomUUID();created.push('relay-m0-storage-writer');pod('relay-m0-storage-writer','denied',true);
  run('relay-m0-storage-writer',`import {writeFileSync} from 'node:fs';writeFileSync('/data/marker',${JSON.stringify(marker)});console.log('marker written');`);
  k('delete','pod/relay-m0-storage-writer','-n',namespace,'--wait=true','--timeout=30s');
  created.push('relay-m0-storage-reader');pod('relay-m0-storage-reader','denied',true);
  const retained=run('relay-m0-storage-reader',"import {readFileSync} from 'node:fs';console.log(readFileSync('/data/marker','utf8'))");
  if(retained!==marker)throw new Error('PVC failed to retain data');
  record('pvc-survives-pod-replacement',{markerMatched:true,pvc:JSON.parse(k('get','pvc/relay-m0-storage-proof','-n',namespace,'-o','json')).status});
  const negative=await fetch('http://127.0.0.1:18080/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer wrong'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  if(negative.status!==401)throw new Error('Ingress invalid credential not rejected');record('ingress-rejects-invalid-credential',{status:negative.status});
  const bindings=JSON.parse(execFileSync('docker',['inspect','k3d-relay-m0-serverlb'],{encoding:'utf8'}))[0].NetworkSettings.Ports;
  if(!bindings['80/tcp'].every(b=>b.HostIp==='127.0.0.1'))throw new Error('Ingress is not loopback bound');record('loopback-only-ingress-binding',bindings['80/tcp']);
  if(!bindings['6443/tcp']?.length||!bindings['6443/tcp'].every(b=>b.HostIp==='127.0.0.1'))throw new Error('Kubernetes API is not loopback bound');record('loopback-only-kubernetes-api-binding',bindings['6443/tcp']);
  results.passed=true;
} catch(error) { results.passed=false;results.error=error.message;writeFileSync(evidence,JSON.stringify(results,null,2)+'\n');throw error; }
finally {
  results.cleanupErrors=[];
  for(const name of created){try{ownResource('pod',name);k('delete',`pod/${name}`,'-n',namespace,'--ignore-not-found','--wait=true','--timeout=60s');}catch(error){results.cleanupErrors.push({name,error:error.message});results.passed=false;}}
  results.cleanup='Only labelled capability-test pods removed; test PVC retained. Unrelated resources preserved.';
  writeFileSync(evidence,JSON.stringify(results,null,2)+'\n');
}
