import {readFileSync,writeFileSync} from 'node:fs';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
export async function authenticatedFixture(){
 const path='.local/m5-identity.json',f=JSON.parse(readFileSync(path,'utf8'));const origin='http://relay.localhost:18080';
 const response=await ingressFetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:f.email,password:f.password})});
 if(response.status!==200)throw new Error(`Synthetic M5 sign-in failed (${response.status}); honor rate limits before retrying`);
 f.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');writeFileSync(path,JSON.stringify(f)+'\n',{mode:0o600});return f;
}
