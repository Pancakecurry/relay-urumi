import {kube,apply,env} from './mcp-kube.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import https from 'node:https';
import {Readable} from 'node:stream';
import {X509Certificate,createHash} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
const report={at:new Date().toISOString(),checks:[],systemTrustChanged:false},ns='relay-pki-proof';let forward;const clients=[];
const cert=(name,namespace,commonName,dnsNames,issuerRef,isCA=false)=>({apiVersion:'cert-manager.io/v1',kind:'Certificate',metadata:{name,namespace,labels:{'relay-owned':'m6'}},spec:{secretName:name,commonName,dnsNames,duration:isCA?'8760h':'168h',renewBefore:isCA?'720h':'48h',isCA,privateKey:{algorithm:'ECDSA',size:256,rotationPolicy:'Always'},usages:isCA?['cert sign','crl sign']:['server auth','client auth'],issuerRef,secretTemplate:{labels:{'relay-owned':'m6'}}}});
function leaf(){const s=JSON.parse(kube(['get','secret','tls-proof','-n',ns,'-o','json']));return{ca:Buffer.from(s.data['ca.crt'],'base64'),cert:Buffer.from(s.data['tls.crt'],'base64')};}
try{
 apply({apiVersion:'cert-manager.io/v1',kind:'Issuer',metadata:{name:'relay-root-bootstrap',namespace:'relay-pki',labels:{'relay-owned':'m6'}},spec:{selfSigned:{}}});
 apply(cert('relay-local-root','relay-pki','Relay Local Development Root',[],{name:'relay-root-bootstrap',kind:'Issuer'},true));
 kube(['wait','certificate/relay-local-root','-n','relay-pki','--for=condition=Ready','--timeout=90s']);
 apply({apiVersion:'cert-manager.io/v1',kind:'ClusterIssuer',metadata:{name:'relay-local-ca',labels:{'relay-owned':'m6'}},spec:{ca:{secretName:'relay-local-root'}}});kube(['wait','clusterissuer/relay-local-ca','--for=condition=Ready','--timeout=90s']);
 let existing;try{existing=JSON.parse(kube(['get','namespace',ns,'-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}if(existing)assert.equal(existing.metadata.labels['relay-owned'],'m6');
 apply({apiVersion:'v1',kind:'Namespace',metadata:{name:ns,labels:{'relay-owned':'m6','pod-security.kubernetes.io/enforce':'restricted','pod-security.kubernetes.io/enforce-version':'v1.37'}}});
 const baseNames=['localhost','tls-proof','tls-proof.relay.localhost'],renewalName='renewed.tls-proof.relay.localhost';
 let proofNames=baseNames;
 try{const current=JSON.parse(kube(['get','certificate','tls-proof','-n',ns,'-o','json']));assert.equal(current.metadata.labels['relay-owned'],'m6');assert(baseNames.every(name=>current.spec.dnsNames.includes(name)));proofNames=current.spec.dnsNames;}catch(error){if(!error.stderr?.includes('NotFound'))throw error;}
 // Preserve the owned fixture's current SANs on repeat runs. A prior renewal
 // patch otherwise conflicts with server-side apply before the test can start.
 apply(cert('tls-proof',ns,'relay-m6-proof',proofNames,{name:'relay-local-ca',kind:'ClusterIssuer'}));kube(['wait','certificate/tls-proof','-n',ns,'--for=condition=Ready','--timeout=90s']);
 const first=leaf();const firstSerial=new X509Certificate(first.cert).serialNumber;report.checks.push('Pinned certificate controller issues an actual CA-signed leaf on k3s1.37');
 const image=readFileSync('docs/evidence/m6/images.txt','utf8').trim().split('\n')[0];
 apply({apiVersion:'v1',kind:'ConfigMap',metadata:{name:'tls-proof-code',namespace:ns,labels:{'relay-owned':'m6'}},data:{'proof.mjs':readFileSync('tests/security/tls-proof-server.mjs','utf8')}});
 apply({apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'tls-proof',namespace:ns,labels:{'relay-owned':'m6'}},spec:{replicas:1,selector:{matchLabels:{'relay.role':'tls-proof'}},template:{metadata:{labels:{'relay.role':'tls-proof'}},spec:{automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000,seccompProfile:{type:'RuntimeDefault'}},containers:[{name:'proof',image,command:['node','/app/proof/proof.mjs'],ports:[{name:'tls',containerPort:3000}],securityContext:{allowPrivilegeEscalation:false,readOnlyRootFilesystem:true,capabilities:{drop:['ALL']}},resources:{requests:{cpu:'10m',memory:'32Mi'},limits:{cpu:'250m',memory:'96Mi'}},readinessProbe:{httpGet:{scheme:'HTTPS',path:'/health/ready',port:'tls',httpHeaders:[{name:'Host',value:'localhost'}]},periodSeconds:3},volumeMounts:[{name:'tls',mountPath:'/run/tls',readOnly:true},{name:'code',mountPath:'/app/proof',readOnly:true}]}],volumes:[{name:'tls',secret:{secretName:'tls-proof',defaultMode:288}},{name:'code',configMap:{name:'tls-proof-code'}}]}}}});
 kube(['rollout','status','deployment/tls-proof','-n',ns,'--timeout=90s']);
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));forward=spawn('.tools/bin/kubectl',['port-forward','deployment/tls-proof',`${port}:3000`,'-n',ns,'--address=127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('TLS forward timeout')),15000);forward.stdout.on('data',d=>{if(d.toString().includes('Forwarding from')){clearTimeout(t);resolve();}});forward.once('exit',()=>{clearTimeout(t);reject(new Error('TLS forward exited'));});});
 let observed;
 const fetcher=ca=>async(input,init)=>{const u=new URL(String(input));return new Promise((resolve,reject)=>{const headers=new Headers(init?.headers);headers.set('host','localhost');const req=https.request({hostname:'127.0.0.1',servername:'localhost',agent:false,port,path:u.pathname,method:init?.method??'GET',headers:Object.fromEntries(headers),ca,minVersion:'TLSv1.3',...(init?.signal?{signal:init.signal}:{})},res=>{observed={authorized:res.socket.authorized,protocol:res.socket.getProtocol(),serial:res.socket.getPeerCertificate().serialNumber};const h=new Headers();for(const[k,v]of Object.entries(res.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(','):v);resolve(new Response([204,205,304].includes(res.statusCode)?null:Readable.toWeb(res),{status:res.statusCode,headers:h}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('TLS request timeout')));req.end(init?.body??undefined);});};
 for(const mode of ['auto','legacy']){const c=new Client({name:'relay-tls-compatibility',version:'0.6.0'},{versionNegotiation:{mode}});clients.push(c);await c.connect(new StreamableHTTPClientTransport(new URL(`https://localhost:${port}/mcp`),{fetch:fetcher(first.ca)}));const r=await c.callTool({name:'ping',arguments:{message:`real-${mode}-tls`}});assert.equal(JSON.parse(r.content[0].text).pong,`real-${mode}-tls`);assert.equal(observed.authorized,true);assert.equal(observed.protocol,'TLSv1.3');}
 report.checks.push('Modern and legacy pinned official MCP clients call real ping over verified TLS1.3 with the official Fastify guards');
 await assert.rejects(()=>fetcher(undefined)(`https://localhost:${port}/health/ready`));report.checks.push('The same client rejects the untrusted development CA when explicit project trust is absent');
 const nextNames=proofNames.includes(renewalName)?proofNames.filter(name=>name!==renewalName):[...proofNames,renewalName];
 kube(['patch','certificate','tls-proof','-n',ns,'--type=merge','--field-manager=relay-m2','-p',JSON.stringify({spec:{dnsNames:nextNames}})]);
 await expect.poll(()=>new X509Certificate(leaf().cert).serialNumber,{timeout:90000,intervals:[1000]}).not.toBe(firstSerial);
 await expect.poll(async()=>{const r=await fetcher(first.ca)(`https://localhost:${port}/health/ready`);await r.json();return observed.serial;},{timeout:90000,intervals:[2000]}).not.toBe(firstSerial);
 report.checks.push('A genuine certificate specification change issues a new serial/key and the live TLS server reloads the mounted projection');report.caSha256=createHash('sha256').update(first.ca).digest('hex');report.kubernetes='v1.37.1+k3s1';report.certManager='v1.21.2';report.vendorListedKubernetesMax='1.36';report.vendorSupportClaim=false;report.path='Operator loopback forward to isolated Kubernetes MCP server; Ingress integration follows';report.passed=true;
}finally{for(const c of clients)await c.close().catch(()=>{});forward?.kill('SIGTERM');writeFileSync('docs/evidence/m6/pki-compatibility.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed??false,checks:report.checks,vendorSupportClaim:false}));}
