import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { kube, env } from './mcp-kube.mjs';
const image=readFileSync('docs/evidence/m2/image.txt','utf8').trim();
const deployments=[]; const rendered=[];
for(const [kind,namespace]of [['woocommerce','relay-store-m1'],['calendar','relay-upstreams'],['totals','relay-upstreams']]){
 const name=`relay-${kind}`;
 const d=JSON.parse(kube(['get','deployment',name,'-n',namespace,'-o','json']));
 const pods=JSON.parse(kube(['get','pods','-n',namespace,'-l',`relay.upstream=${name}`,'-o','json'])).items;
 const resources=d.spec.template.spec.containers[0].resources;
 if(!d.spec.template.spec.containers[0].readinessProbe||!d.spec.template.spec.containers[0].livenessProbe||!resources.requests||!resources.limits||d.spec.template.spec.automountServiceAccountToken!==false)throw new Error('Missing workload protection');
 const spec=d.spec.template.spec;
 const isolation=JSON.parse(kube(['exec','-n',namespace,`deployment/${name}`,'--','node','--input-type=module','-e',
  `import{existsSync,statSync}from'node:fs';console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),serviceAccountToken:existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token'),wooCredential:existsSync('/secrets/woo/consumer-key'),mcpSecretMode:(statSync('/secrets/mcp/token').mode&511).toString(8),rssBytes:process.memoryUsage().rss,node:process.version}));`]));
 if(isolation.uid!==1000||isolation.serviceAccountToken||isolation.wooCredential!==(kind==='woocommerce'))throw new Error('Credential/identity isolation failed');
 deployments.push({name,namespace,status:d.status,spec,pods:pods.map(p=>({name:p.metadata.name,uid:p.metadata.uid,phase:p.status.phase,containers:p.status.containerStatuses})),isolation});
 const args=['template',name,'charts/hosted-mcp','-n',namespace,'-f',`infra/local/mcp-${kind}.yaml`,'--set-string',`image=${image}`];
 const manifest=execFileSync('.tools/bin/helm',args,{env,encoding:'utf8'}).split('\n').map(l=>l.trimEnd()).join('\n');
 writeFileSync(`docs/evidence/m2/rendered-${kind}.yaml`,manifest);
 const validation=execFileSync('.tools/bin/kubectl',['apply','--dry-run=server','-f','-'],{input:manifest,env,encoding:'utf8',stdio:['pipe','pipe','pipe']});rendered.push({kind,serverDryRun:validation.trim()});
}
const imageData=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
const top=kube(['top','pods','-A']);
const nodeStats=JSON.parse(execFileSync('docker',['stats','k3d-relay-m0-server-0','--no-stream','--format','{{json .}}'],{encoding:'utf8'}));
const ingress=JSON.parse(kube(['get','ingress','-A','-o','json'])).items.map(i=>({namespace:i.metadata.namespace,name:i.metadata.name,spec:i.spec}));
writeFileSync('docs/evidence/m2/inventory.json',JSON.stringify({at:new Date().toISOString(),deployments,rendered,ingress,image:{tag:image,id:imageData.Id,architecture:imageData.Architecture,sizeBytes:imageData.Size},nodeStats,top},null,2)+'\n');
console.log(JSON.stringify({deployments:deployments.map(d=>({name:d.name,namespace:d.namespace,isolation:d.isolation})),rendered:rendered.length,nodeStats}));
