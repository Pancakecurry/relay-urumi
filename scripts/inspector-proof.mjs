import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base = `${process.cwd()}/.local/inspector`;
mkdirSync(base,{recursive:true,mode:0o700});
const secret=readFileSync('.local/m0-token','utf8').trim();
const config=`${base}/mcp.json`;
writeFileSync(config,JSON.stringify({mcpServers:{relay:{type:'http',url:'http://127.0.0.1:18080/mcp',headers:{Authorization:`Bearer ${secret}`},protocolEra:'auto'}}}),{mode:0o600});
const env={...process.env,MCP_STORAGE_DIR:base,MCP_INSPECTOR_OAUTH_STATE_PATH:`${base}/oauth.json`,MCP_CLIENT_CONFIG_PATH:`${base}/client.json`,MCP_INSPECTOR_SECRET_STORE:'memory'};
const cli='node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js';
const results=[];
for(const method of ['initialize','tools/list','tools/call']) {
  const args=[cli,'--cli','--config',config,'--server','relay','--stored-auth-only','--format','json','--method',method];
  if(method==='tools/call')args.push('--tool-name','ping','--tool-args-json',JSON.stringify({message:'relay-independent-inspector'}));
  const output=execFileSync(process.execPath,args,{env,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  if(output.includes(secret))throw new Error('Inspector output contains credential; refusing to persist');
  const result=JSON.parse(output);results.push({method,result});
}
writeFileSync('docs/evidence/inspector-client.json',JSON.stringify({at:new Date().toISOString(),client:'@modelcontextprotocol/inspector@2.10.1',configuration:'URL + bearer header; private file, memory secret store; auto era',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
