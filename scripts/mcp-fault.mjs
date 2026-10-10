import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { kube, apply, replaceTestPod, finishPod, security, containerSecurity } from './mcp-kube.mjs';
const image=readFileSync('docs/evidence/m2/image.txt','utf8').trim();
execFileSync(process.execPath,['scripts/mcp-secrets.mjs'],{stdio:['ignore','pipe','pipe']});
const before=JSON.parse(kube(['get','networkpolicy','relay-woocommerce-private','-n','relay-store-m1','-o','json']));
if(before.spec.egress.length!==2)throw new Error('Unexpected owned policy; refusing fault injection');
replaceTestPod('relay-platform','m2-fault');
const node=JSON.parse(kube(['get','nodes','-o','json'])).items[0];
const cidr=node.spec.podCIDR;
if(!/^10\.42\.\d+\.0\/24$/.test(cidr))throw new Error('Fault IP requires inspected single-node /24 pod CIDR');
const unused=cidr.replace('0/24','254');
const assigned=JSON.parse(kube(['get','pods','-A','-o','json'])).items.map(p=>p.status.podIP);
if(assigned.includes(unused))throw new Error('Fault address already assigned; refusing test');
replaceTestPod('relay-store-m1','m2-timeout');
const template=JSON.parse(kube(['get','deployment','relay-woocommerce','-n','relay-store-m1','-o','json'])).spec.template.spec;
const container=template.containers[0];
container.env=container.env.map(v=>v.name==='STORE_CONNECTION_URL'?{name:v.name,value:`http://${unused}`}:v.name==='MCP_SERVICE_HOST'?{name:v.name,value:'m2-timeout'}:v.name==='REST_TIMEOUT_MS'?{name:v.name,value:'500'}:v);
for(const kind of ['service','networkpolicy']){
 let existing;try{existing=JSON.parse(kube(['get',kind,'m2-timeout','-n','relay-store-m1','-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
 if(existing&&existing.metadata.labels?.['relay.test']!=='m2')throw new Error('Fault resource ownership conflict');
}
apply({apiVersion:'v1',kind:'Pod',metadata:{name:'m2-timeout',namespace:'relay-store-m1',labels:{'relay.test':'m2','relay.fault':'timeout',role:'adapter'}},spec:{...template,containers:[container],restartPolicy:'Never',activeDeadlineSeconds:120}});
apply({apiVersion:'v1',kind:'Service',metadata:{name:'m2-timeout',namespace:'relay-store-m1',labels:{'relay.test':'m2'}},spec:{type:'ClusterIP',selector:{'relay.fault':'timeout'},ports:[{port:3000,targetPort:3000}]}});
apply({apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name:'m2-timeout',namespace:'relay-store-m1',labels:{'relay.test':'m2'}},spec:{podSelector:{matchLabels:{'relay.fault':'timeout'}},policyTypes:['Ingress','Egress'],ingress:[{from:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':'relay-platform'}},podSelector:{matchLabels:{'relay.role':'gateway'}}}],ports:[{protocol:'TCP',port:3000}]}],egress:[{to:[{ipBlock:{cidr:`${unused}/32`}}],ports:[{protocol:'TCP',port:80}]}]}});
try{
 kube(['wait','pod/m2-timeout','-n','relay-store-m1','--for=condition=Ready','--timeout=30s']);
 kube(['patch','networkpolicy','relay-woocommerce-private','-n','relay-store-m1','--type=json','-p',JSON.stringify([{op:'remove',path:'/spec/egress/1'}])]);
 // Give the Kubernetes network-policy controller time to apply the deny rule.
 await new Promise(resolve=>setTimeout(resolve,3000));
 apply({apiVersion:'v1',kind:'Pod',metadata:{name:'m2-fault',namespace:'relay-platform',labels:{'relay.test':'m2','relay.role':'gateway'}},
 spec:{restartPolicy:'Never',activeDeadlineSeconds:45,automountServiceAccountToken:false,securityContext:security,
 containers:[{name:'client',image,imagePullPolicy:'IfNotPresent',command:['node','dist/packages/mcp-client/src/m2-fault.js'],env:[{name:'M2_TIMEOUT_URL',value:'http://m2-timeout.relay-store-m1.svc.cluster.local:3000/mcp'}],securityContext:containerSecurity,
 resources:{requests:{cpu:'25m',memory:'64Mi'},limits:{cpu:'500m',memory:'192Mi'}},volumeMounts:[{name:'tokens',mountPath:'/secrets',readOnly:true}]}],
 volumes:[{name:'tokens',secret:{secretName:'m2-acceptance-tokens',defaultMode:0o440}}]}});
 const raw=await finishPod('relay-platform','m2-fault',60000);const tokens=Object.values(JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8')));
 if(tokens.some(token=>raw.includes(token)))throw new Error('Fault output contained a secret');
 const report=JSON.parse(raw);if(!report.passed)throw new Error('Fault acceptance failed');
 writeFileSync('docs/evidence/m2/fault.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,observations:report.observations}));
}finally{
 kube(['patch','networkpolicy','relay-woocommerce-private','-n','relay-store-m1','--type=json','-p',JSON.stringify([{op:'replace',path:'/spec/egress',value:before.spec.egress}])]);
 kube(['delete','secret','m2-acceptance-tokens','-n','relay-platform','--ignore-not-found']);
 kube(['delete','pod,service,networkpolicy','m2-timeout','-n','relay-store-m1','--ignore-not-found','--wait=true']);
 const restored=JSON.parse(kube(['get','networkpolicy','relay-woocommerce-private','-n','relay-store-m1','-o','json']));
 if(JSON.stringify(restored.spec)!==JSON.stringify(before.spec))throw new Error('Fault policy recovery mismatch');
 writeFileSync('docs/evidence/m2/fault-recovery.json',JSON.stringify({at:new Date().toISOString(),policyRestored:true,originalSpec:before.spec},null,2)+'\n');
}
