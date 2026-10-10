import { request } from 'node:http';
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
 if(authenticated){const c=secret('store-adapter');const oauth={oauth_consumer_key:c['consumer-key'],oauth_nonce:randomBytes(16).toString('hex'),oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA256'};
 const params=[...url.searchParams,...Object.entries(oauth)].map(([k,v])=>[enc(k),enc(v)]).sort(([a,av],[b,bv])=>a===b?av.localeCompare(bv):a.localeCompare(b));
 const base=['GET',enc(url.origin+url.pathname),enc(params.map(([k,v])=>`${k}=${v}`).join('&'))].join('&');
 oauth.oauth_signature=createHmac('sha256',`${c['consumer-secret']}&`).update(base).digest('base64');
 headers.Authorization='OAuth '+Object.entries(oauth).map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ');
 }
 const transport=new URL(url);transport.hostname='127.0.0.1';return await new Promise((resolve,reject)=>{
 const req=request(transport,{headers},response=>{let raw='';response.setEncoding('utf8');response.on('data',chunk=>{raw+=chunk;});response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(raw)});}catch{reject(new Error(`REST returned non-JSON status ${response.statusCode}`));}});});
 req.setTimeout(30000,()=>req.destroy(new Error('REST timeout')));req.on('error',reject);req.end();
 });
}
