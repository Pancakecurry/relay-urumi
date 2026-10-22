import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const namespace=process.env.STORE_NAMESPACE || 'relay-store-m1';
export const release=process.env.STORE_RELEASE || 'demo-store';
export const site=process.env.STORE_URL || 'http://store.relay.localhost:18080';
export const kube=args=>execFileSync('.tools/bin/kubectl',args,{encoding:'utf8',env:{...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`},stdio:['ignore','pipe','pipe']});
export function secret(name){const x=JSON.parse(kube(['get','secret',name,'-n',namespace,'-o','json']));return Object.fromEntries(Object.entries(x.data).map(([k,v])=>[k,Buffer.from(v,'base64').toString()]));}
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export async function api(path,authenticated=true){
 const url=new URL(`${site}/wp-json/wc/v3/${path}`);const headers={Host:url.host};
 if(authenticated){const c=secret('store-adapter');if(url.protocol==='https:')headers.Authorization='Basic '+Buffer.from(`${c['consumer-key']}:${c['consumer-secret']}`).toString('base64');else{const oauth={oauth_consumer_key:c['consumer-key'],oauth_nonce:randomBytes(16).toString('hex'),oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA256'};
 const params=[...url.searchParams,...Object.entries(oauth)].map(([k,v])=>[enc(k),enc(v)]).sort(([a,av],[b,bv])=>a===b?av.localeCompare(bv):a.localeCompare(b));
 const base=['GET',enc(url.origin+url.pathname),enc(params.map(([k,v])=>`${k}=${v}`).join('&'))].join('&');
 oauth.oauth_signature=createHmac('sha256',`${c['consumer-secret']}&`).update(base).digest('base64');
 headers.Authorization='OAuth '+Object.entries(oauth).map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ');
 }}
 const transport=new URL(url);transport.hostname='127.0.0.1';let tls={};if(url.protocol==='https:'){if(!process.env.STORE_PRIVATE_PORT||!process.env.STORE_PRIVATE_TLS_HOST||!process.env.STORE_TLS_CLIENT_SECRET)throw new Error('Explicit private TLS test endpoint and identity are required');transport.port=process.env.STORE_PRIVATE_PORT;const peer=secret(process.env.STORE_TLS_CLIENT_SECRET);tls={servername:process.env.STORE_PRIVATE_TLS_HOST,ca:readFileSync('.local/relay-ca.crt'),cert:peer['tls.crt'],key:peer['tls.key'],rejectUnauthorized:true,minVersion:'TLSv1.3',agent:false};}return await new Promise((resolve,reject)=>{
 const req=(url.protocol==='https:'?httpsRequest:httpRequest)(transport,{headers,...tls},response=>{let raw='';response.setEncoding('utf8');response.on('data',chunk=>{raw+=chunk;});response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(raw)});}catch{reject(new Error(`REST returned non-JSON status ${response.statusCode}`));}});});
 req.setTimeout(30000,()=>req.destroy(new Error('REST timeout')));req.on('error',reject);req.end();
 });
}

export function storeBrowserOptions(){
 if(new URL(site).protocol!=='https:')return {};
 const peer=secret(process.env.STORE_TLS_SERVER_SECRET??`${release}-wp-tls`);
 const leaf=new X509Certificate(peer['tls.crt']);const pin=createHash('sha256').update(leaf.publicKey.export({type:'spki',format:'der'})).digest('base64');
 return {args:[`--ignore-certificate-errors-spki-list=${pin}`,`--host-resolver-rules=MAP ${new URL(site).hostname} 127.0.0.1`]};
}
