// Operator acceptance adapter for an owned kubectl port-forward. This proves
// service TLS/authentication, not NetworkPolicy. No key is written to disk.
import {kube} from './mcp-kube.mjs';
import {request} from 'node:https';
import {Readable} from 'node:stream';
import assert from 'node:assert/strict';
export function forwardFetch({port,role,clientRole}){
 assert(['api','gateway','provisioner'].includes(role));
 return verifiedFetch({port,hostname:`relay-${role}`,authority:`relay-${role}:${{api:3001,gateway:3000,provisioner:3003}[role]}`,clientRole});
}
export function upstreamForwardFetch({port,hostname,clientRole='gateway',onTls}){
 assert(/^[a-z0-9-]+\.(relay-store-clean|relay-store-m1|relay-store-[a-f0-9]{32}|relay-upstreams)\.svc\.cluster\.local$/.test(hostname));
 return verifiedFetch({port,hostname,authority:hostname,clientRole,onTls});
}
function verifiedFetch({port,hostname,authority,clientRole,onTls}){
 if(clientRole)assert(['api','gateway','provisioner'].includes(clientRole));
 const secret=name=>JSON.parse(kube(['get','secret',name,'-n','relay-platform','-o','json'])).data;
 const ca=Buffer.from(secret('relay-trust')['ca.crt'],'base64');
 const peer=clientRole?secret(`relay-${clientRole}-tls`):undefined;
 return async(input,init={})=>{
  const u=new URL(input instanceof Request?input.url:String(input));
  assert.equal(u.hostname,'127.0.0.1');assert.equal(Number(u.port),port);assert.equal(u.protocol,'https:');
  const headers=new Headers(init.headers);headers.set('host',authority);
  return new Promise((resolve,reject)=>{
   const r=request({hostname:'127.0.0.1',port,servername:hostname,path:u.pathname+u.search,method:init.method??'GET',headers:Object.fromEntries(headers),ca,...(peer?{cert:Buffer.from(peer['tls.crt'],'base64'),key:Buffer.from(peer['tls.key'],'base64')}:{}),rejectUnauthorized:true,minVersion:'TLSv1.3',agent:false,signal:AbortSignal.any([AbortSignal.timeout(15000),...(init.signal?[init.signal]:[])])},res=>{
    const h=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)h.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response([204,205,304].includes(res.statusCode)?null:Readable.toWeb(res),{status:res.statusCode,headers:h}));
   });if(onTls)r.on('socket',socket=>socket.once('secureConnect',()=>onTls({protocol:socket.getProtocol(),authorized:socket.authorized,hostname})));r.on('error',reject);r.end(init.body?.toString());
  });
 };
}
