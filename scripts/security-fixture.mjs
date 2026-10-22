import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import assert from 'node:assert/strict';
export const origin=process.env.RELAY_TEST_ORIGIN??'http://relay.localhost:18080';
const path='.local/m6-identity.json';
export async function securityFixture(){
 const f=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{users:Object.fromEntries(['A','B','C'].map(w=>[w,{name:`Synthetic M6 ${w==='A'?'Owner':`Member ${w}`}`,email:`relay-m6-${w.toLowerCase()}-${randomUUID().slice(0,8)}@example.invalid`,password:randomBytes(24).toString('hex')}]))};
 const save=()=>writeFileSync(path,JSON.stringify(f,null,2),{mode:0o600});save();
 const auth=async(w,endpoint)=>{
  const u=f.users[w];let r;
  for(let attempt=0;attempt<3;attempt++){
   r=await ingressFetch(origin+'/api/auth/'+endpoint,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:u.email,password:u.password,...(endpoint.startsWith('sign-up')?{name:u.name}:{})})});
   if(r.status!==429)break;
   await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.min(60,Number(r.headers.get('retry-after')??60)))*1000));
  }
  if(endpoint.startsWith('sign-up')&&r.status!==200)return auth(w,'sign-in/email');
  assert.equal(r.status,200,'Synthetic M6 authentication');const d=await r.json();u.user=d.user.id;u.cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');save();
 };
 for(const w of ['A','B','C']){
  if(!f.users[w].user)await auth(w,'sign-up/email');
  else{const r=await ingressFetch(origin+'/api/teams',{headers:{cookie:f.users[w].cookie??''}});if(r.status===401)await auth(w,'sign-in/email');else assert.equal(r.status,200);}
 }
 async function api(w,p,method='GET',body,status=200,team=f.team){
  const r=await ingressFetch(origin+'/api/'+p,{method,headers:{origin,cookie:f.users[w].cookie,'x-relay-team':team??'',...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,p);return r.json();
 }
 if(!f.team){f.team=(await api('A','teams','POST',{name:'M6 Security Acceptance'})).id;save();}
 const members=(await api('A','members')).members;
 for(const w of ['B','C'])if(!members.some(m=>m.user_id===f.users[w].user)){
  const invitation=await api('A','invitations','POST',{email:f.users[w].email,role:'member'});
  await api(w,'invitations/accept','POST',{token:invitation.token});
 }
 for(const w of ['A','B','C'])if(!f.users[w].key){
  const old=(await api(w,'api-keys')).keys.filter(k=>k.user_id===f.users[w].user&&k.name==='M6 acceptance'&&!k.revoked_at);
  for(const k of old)await api(w,`api-keys/${k.id}`,'DELETE');
  const key=await api(w,'api-keys','POST',{name:'M6 acceptance'});f.users[w].key=key.key;f.users[w].keyId=key.id;save();
 }
 const tokens=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8'));
 const definitions=[['woocommerce','https://relay-woocommerce.relay-store-m1.svc.cluster.local:3000/mcp','woo'],['calendar','https://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp','calendar'],['totals','https://relay-totals.relay-upstreams.svc.cluster.local:3000/mcp','totals']];
 f.upstreams??={};
 for(const[name,url,key]of definitions){const existing=(await api('A','upstreams')).upstreams.find(u=>u.name===name);f.upstreams[name]=existing?.id??(await api('A','upstreams','POST',{name,url,credentials:{kind:'bearer',token:tokens[key]}})).id;save();}
 if(!f.otherTeam){f.otherTeam=(await api('A','teams','POST',{name:'M6 Separate Scope'})).id;save();}
 if(!f.foreignUpstream){f.foreignUpstream=(await api('A','upstreams','POST',{name:'outside-calendar',url:definitions[1][1],credentials:{kind:'bearer',token:tokens.calendar}},200,f.otherTeam)).id;save();}
 return{f,api,save};
}
