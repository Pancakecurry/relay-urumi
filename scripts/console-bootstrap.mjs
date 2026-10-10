import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
const origin=process.env.RELAY_ORIGIN || 'http://relay.localhost:18080';const path='.local/console-owner.json';
const owner=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{name:'Relay Operator',email:'relay-operator@example.invalid',password:randomBytes(24).toString('hex')};
writeFileSync(path,JSON.stringify(owner)+'\n',{mode:0o600});chmodSync(path,0o600);let cookie='';
async function api(p,m='GET',b){const r=await ingressFetch(origin+'/api/'+p,{method:m,headers:{origin,cookie,'content-type':'application/json',...(owner.team?{'x-relay-team':owner.team}:{})},...(b?{body:JSON.stringify(b)}:{})});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const d=await r.json();if(!r.ok)throw new Error(d.error?.code??d.code??'Bootstrap failed');return d;}
try{await api('auth/sign-in/email','POST',{email:owner.email,password:owner.password});}catch{await api('auth/sign-up/email','POST',owner);}
const teams=(await api('teams')).teams;owner.team=teams.find(t=>t.name==='Relay local')?.id??(await api('teams','POST',{name:'Relay local'})).id;writeFileSync(path,JSON.stringify(owner)+'\n',{mode:0o600});
const tokens=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8'));const existing=(await api('upstreams')).upstreams;
for(const [name,key,ns]of [['WooCommerce','woo','relay-store-m1'],['Calendar','calendar','relay-upstreams'],['Decimal Totals','totals','relay-upstreams']]){const service=key==='woo'?'woocommerce':key==='calendar'?'calendar':'totals';if(!existing.some(u=>u.name===name))await api('upstreams','POST',{name,url:`http://relay-${service}.${ns}.svc.cluster.local:3000/mcp`,credentials:{kind:'bearer',token:tokens[key]}});}
await api('tools');console.log('Operator workspace and three reviewed upstreams ready. Sign-in details are only in .local/console-owner.json (0600).');
