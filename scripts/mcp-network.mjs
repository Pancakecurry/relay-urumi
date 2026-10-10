import { readFileSync, writeFileSync } from 'node:fs';
import { kube, apply, replaceTestPod, finishPod, security, containerSecurity } from './mcp-kube.mjs';
const image=readFileSync('docs/evidence/m2/image.txt','utf8').trim();
const targets=[['woo','relay-woocommerce.relay-store-m1.svc.cluster.local',3000],['calendar','relay-calendar.relay-upstreams.svc.cluster.local',3000],['totals','relay-totals.relay-upstreams.svc.cluster.local',3000]];
const code=(targets)=>`import{createConnection}from'node:net';const results=[];for(const [name,host,port]of ${JSON.stringify(targets)}){
 const reachable=await new Promise(resolve=>{const s=createConnection({host,port});s.setTimeout(1500);s.once('connect',()=>{s.destroy();resolve(true)});s.once('timeout',()=>{s.destroy();resolve(false)});s.once('error',()=>{s.destroy();resolve(false)});});results.push({name,reachable});}console.log(JSON.stringify(results));`;
const cases=[];
for(const [name,namespace,labels,expected] of [
 ['gateway','relay-platform',{'relay.role':'gateway'},true],
 ['unlabelled','relay-platform',{},false],
 ['wrong-namespace','relay-upstreams',{'relay.role':'gateway'},false]
]){
 const pod=`m2-network-${name}`;replaceTestPod(namespace,pod);
 apply({apiVersion:'v1',kind:'Pod',metadata:{name:pod,namespace,labels:{'relay.test':'m2',...labels}},
 spec:{restartPolicy:'Never',activeDeadlineSeconds:30,automountServiceAccountToken:false,securityContext:security,
 containers:[{name:'test',image,imagePullPolicy:'IfNotPresent',command:['node','--input-type=module','-e',code(targets)],securityContext:containerSecurity,
 resources:{requests:{cpu:'10m',memory:'32Mi'},limits:{cpu:'250m',memory:'64Mi'}}}]}});
 const actual=JSON.parse(await finishPod(namespace,pod));
 const passed=actual.every(result=>result.reachable===expected);cases.push({name,namespace,expected,actual,passed});
}
const database=['database','demo-store-db.relay-store-m1.svc.cluster.local',3306];
const wordpress=['wordpress','demo-store-wp.relay-store-m1.svc.cluster.local',80];
for(const [namespace,release,checks] of [
 ['relay-store-m1','relay-woocommerce',[wordpress,database,targets[1]]],
 ['relay-upstreams','relay-calendar',[wordpress,database,targets[0]]],
 ['relay-upstreams','relay-totals',[wordpress,database,targets[0]]]
]){
 const actual=JSON.parse(kube(['exec','-n',namespace,`deployment/${release}`,'--','node','--input-type=module','-e',code(checks)]));
 const passed=actual.every(result=>result.reachable===(release==='relay-woocommerce'&&result.name==='wordpress'));
 cases.push({name:`${release}-egress`,actual,passed});
}
const services=JSON.parse(kube(['get','svc','-n','relay-upstreams','-o','json'])).items.concat(JSON.parse(kube(['get','svc','-n','relay-store-m1','-o','json'])).items)
 .filter(s=>['relay-woocommerce','relay-calendar','relay-totals'].includes(s.metadata.name)).map(s=>({name:s.metadata.name,type:s.spec.type,ports:s.spec.ports,externalIPs:s.spec.externalIPs??[]}));
const ingress=JSON.parse(kube(['get','ingress','-A','-o','json'])).items.map(i=>({namespace:i.metadata.namespace,name:i.metadata.name,rules:i.spec.rules}));
const noPublic=services.length===3&&services.every(s=>s.type==='ClusterIP'&&s.externalIPs.length===0)&&!JSON.stringify(ingress).includes('relay-woocommerce')&&!JSON.stringify(ingress).includes('relay-calendar')&&!JSON.stringify(ingress).includes('relay-totals');
const report={at:new Date().toISOString(),passed:cases.every(c=>c.passed)&&noPublic,cases,services,ingress,noPublic,
 limitation:'Namespace+pod labels are a Kubernetes administrative trust boundary. Production gateway user/team authorization is M3. Cluster admins can exec/port-forward.'};
writeFileSync('docs/evidence/m2/network.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,cases:cases.map(c=>({name:c.name,passed:c.passed})),noPublic}));if(!report.passed)process.exitCode=1;
