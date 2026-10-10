import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { env } from './mcp-kube.mjs';
const tokens=JSON.parse(readFileSync('.local/m2-upstream-tokens.json','utf8'));
const records=[];
mkdirSync('.local/m2-inspector',{recursive:true,mode:0o700});
for(const [key,namespace,service]of [['woo','relay-store-m1','relay-woocommerce'],['calendar','relay-upstreams','relay-calendar'],['totals','relay-upstreams','relay-totals']]){
 // Loopback-only operator diagnostic, bypassing pod networking with Kubernetes admin rights.
 // Never used as the product request path or evidence of gateway/team isolation.
 const forward=spawn('.tools/bin/kubectl',['port-forward','-n',namespace,`service/${service}`,'19091:3000','--address=127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 let output='';forward.stdout.on('data',data=>{output+=data});forward.stderr.on('data',data=>{output+=data});
 try{
  const start=Date.now();while(!output.includes('Forwarding from')){if(Date.now()-start>10000||forward.exitCode!==null)throw new Error('Loopback diagnostic forwarding failed');await new Promise(resolve=>setTimeout(resolve,100));}
  const config='.local/m2-inspector/config.json';
  writeFileSync(config,JSON.stringify({mcpServers:{upstream:{type:'http',url:'http://127.0.0.1:19091/mcp',headers:{Authorization:`Bearer ${tokens[key]}`},protocolEra:'auto'}}}),{mode:0o600});
  for(const method of ['initialize','tools/list','tools/call']){
   const args=['node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js','--cli','--config',config,'--server','upstream','--stored-auth-only','--format','json','--method',method];
   if(method==='tools/call')args.push('--tool-name','info','--tool-args-json','{}');
   const raw=execFileSync(process.execPath,args,{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...env,MCP_STORAGE_DIR:`${process.cwd()}/.local/m2-inspector`,MCP_INSPECTOR_OAUTH_STATE_PATH:`${process.cwd()}/.local/m2-inspector/oauth.json`,MCP_CLIENT_CONFIG_PATH:`${process.cwd()}/${config}`,MCP_INSPECTOR_SECRET_STORE:'memory'},stdio:['ignore','pipe','pipe']});
   if(Object.values(tokens).some(token=>raw.includes(token)))throw new Error('Inspector output contains private token');
   records.push({upstream:service,method,response:JSON.parse(raw)});
  }
 }finally{
  forward.kill('SIGTERM');await new Promise(resolve=>forward.once('exit',resolve));
  // Replace the diagnostic file immediately with credential-free content.
  writeFileSync('.local/m2-inspector/config.json','{}\n',{mode:0o600});
 }
}
writeFileSync('docs/evidence/m2/inspector.json',JSON.stringify({at:new Date().toISOString(),passed:true,client:'MCP Inspector 2.10.1 CLI',path:'temporary loopback Kubernetes administrator port-forward',records},null,2)+'\n');
console.log(JSON.stringify({passed:true,calls:records.length,evidence:'docs/evidence/m2/inspector.json'}));
