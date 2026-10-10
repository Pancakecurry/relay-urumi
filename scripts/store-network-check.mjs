import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { kube, namespace, release } from '../tests/store/client.mjs';
const env={...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
const apply=x=>execFileSync('.tools/bin/kubectl',['apply','--server-side','-f','-'],{input:JSON.stringify(x),env,stdio:['pipe','pipe','pipe']});
const name='m1-denied-client';
if(JSON.parse(kube(['get','pods','-n',namespace,'-o','json'])).items.some(x=>x.metadata.name===name))throw new Error('Previous test pod exists; inspect before replacing');
const image=JSON.parse(kube(['get','deployment','relay-m0-proof','-n','relay-m0','-o','json'])).spec.template.spec.containers[0].image;
const code=`const net=require('node:net');async function check(host,port){return await new Promise(resolve=>{const s=net.createConnection({host,port});s.on('connect',()=>{s.destroy();resolve({host,port,connected:true});});s.on('error',e=>resolve({host,port,connected:false,error:e.code}));s.setTimeout(2500,()=>{s.destroy();resolve({host,port,connected:false,error:'timeout'});});});}(async()=>{const r=await Promise.all([check('${release}-db',3306),check('${release}-wp',80)]);console.log(JSON.stringify(r));if(r.some(x=>x.connected))process.exitCode=1;})();`;
try{
 apply({apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name,namespace,labels:{'relay-owned':'m1-test'}},spec:{podSelector:{matchLabels:{'relay-network-test':'m1'}},policyTypes:['Egress'],egress:[{to:[{podSelector:{}}]}]}});
 apply({apiVersion:'v1',kind:'Pod',metadata:{name,namespace,labels:{'relay-network-test':'m1','relay-owned':'m1-test'}},spec:{restartPolicy:'Never',automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:1000,seccompProfile:{type:'RuntimeDefault'}},containers:[{name:'check',image,command:['node','-e',code],resources:{requests:{cpu:'50m',memory:'32Mi'},limits:{cpu:'250m',memory:'128Mi'}}}]}});
 kube(['wait','pod',name,'-n',namespace,'--for=jsonpath={.status.phase}=Succeeded','--timeout=90s']);
 const denied=JSON.parse(kube(['logs',name,'-n',namespace]));
 const services=JSON.parse(kube(['get','svc','-n',namespace,'-o','json'])).items.map(x=>({name:x.metadata.name,type:x.spec.type,ports:x.spec.ports.map(p=>p.port)}));
 const ingress=JSON.parse(kube(['get','ingress','-n',namespace,'-o','json'])).items.flatMap(x=>x.spec.rules.flatMap(r=>r.http.paths.map(p=>({host:r.host,path:p.path,service:p.backend.service.name}))));
 if(services.some(x=>x.type!=='ClusterIP')||ingress.some(x=>x.service!==`${release}-wp`))throw new Error('Unexpected public store route');
 const result={at:new Date().toISOString(),untrustedPodHasExplicitServiceEgress:true,denied,services,ingress,databaseHasNoPublicServiceOrIngress:true};writeFileSync('docs/evidence/m1/network.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{
 kube(['delete','pod',name,'-n',namespace,'--ignore-not-found']);kube(['delete','networkpolicy',name,'-n',namespace,'--ignore-not-found']);
}
