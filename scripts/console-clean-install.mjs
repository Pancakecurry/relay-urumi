// A separate, disposable local cluster. Never targets/removes the existing core or user volumes.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,symlinkSync,statfsSync,copyFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),evidence=join(root,'docs/evidence/m4');const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const destination=mkdtempSync(join(homedir(),'Library/Caches/relay-m4-clean-'));const cluster='relay-m4-clean',origin='http://relay.localhost:19080';const log=[];
const platformImage=readFileSync(join(evidence,'image.txt'),'utf8').trim();let created=false;
const run=(file,args,cwd=destination,extra={})=>{log.push(`$ ${file} ${args.join(' ')}`);try{const output=execFileSync(file,args,{cwd,encoding:'utf8',maxBuffer:33554432,timeout:900000,env:{...process.env,...extra},stdio:['ignore','pipe','pipe']});log.push(output);writeFileSync(join(evidence,'clean-install.txt'),log.join('\n'));return output;}catch(e){log.push(e.stdout?.toString()??'',e.stderr?.toString()??'');writeFileSync(join(evidence,'clean-install.txt'),log.join('\n'));throw new Error(`Clean installation failed during ${file} ${args.slice(0,2).join(' ')}`);}};
const disk=statfsSync(root);assert(disk.bavail*disk.bsize>2.5*1024**3,'Need 2.5 GiB free before a second local cluster; preserve current core');
// Raw k3d JSON includes join tokens in node labels/env. Read privately; log safe names/counts only.
const existing=JSON.parse(execFileSync(join(root,'.tools/bin/k3d'),['cluster','list','-o','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
log.push('Existing cluster names/counts: '+JSON.stringify(existing.map(c=>({name:c.name,servers:c.serversCount,agents:c.agentsCount}))));assert(!existing.some(c=>c.name===cluster),'Existing acceptance cluster retained; review it instead of overwriting');
const archive=execFileSync('git',['archive','--format=tar',sourceCommit],{cwd:root,maxBuffer:67108864});execFileSync('tar',['-xf','-','-C',destination],{input:archive});
mkdirSync(join(destination,'.local'),{mode:0o700});symlinkSync(join(root,'.tools'),join(destination,'.tools'),'dir');run(process.execPath,['scripts/local-cache.mjs']);run('pnpm',['install','--frozen-lockfile']);const check=run('pnpm',['check']);assert(/Tests\s+24 passed/.test(check));const fingerprint=run(process.execPath,['scripts/mcp-image-tag.mjs']).trim().replace(/^m2-/,'m4-');assert.equal(platformImage,`relay/platform:${fingerprint}`);
let config=readFileSync(join(destination,'infra/local/k3d.yaml'),'utf8').replace('name: relay-m0','name: '+cluster).replace('18080:80','19080:80');writeFileSync(join(destination,'.local/clean-k3d.yaml'),config);
try{
 run(join(root,'.tools/bin/k3d'),['cluster','create','--config',join(destination,'.local/clean-k3d.yaml'),'--servers-memory','2500M','--timeout','180s']);created=true;
 // Kubeconfig contains private client credentials; it must never enter the command/evidence log.
 writeFileSync(join(destination,'.local/kubeconfig'),execFileSync(join(root,'.tools/bin/k3d'),['kubeconfig','get',cluster],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),{mode:0o600});const env={KUBECONFIG:join(destination,'.local/kubeconfig')};
 const kube=(args)=>run(join(root,'.tools/bin/kubectl'),args,destination,env);const helm=(args)=>run(join(root,'.tools/bin/helm'),args,destination,env);
 kube(['wait','--for=condition=Ready','node','--all','--timeout=120s']);
 run(process.execPath,['scripts/cluster-token-rotation.mjs'],destination,{RELAY_ROTATION_CLUSTER:cluster,RELAY_ROTATION_KUBECONFIG:join(destination,'.local/kubeconfig'),RELAY_ROTATION_EVIDENCE:'docs/evidence/m4-clean/token-rotation.json'});
 copyFileSync(join(destination,'docs/evidence/m4-clean/token-rotation.json'),join(evidence,'clean-token-rotation.json'));
 const nodeIp=run('docker',['inspect','k3d-'+cluster+'-server-0','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}']).trim();
 // Reuse immutable tested images; independent upstream programs are present in the same runtime image.
 for(const image of [platformImage,'relay/store:m1-2374b9c0c5f86c48','mariadb:11.8.9-noble','postgres:18.6-alpine3.23','redis:8.2.10-alpine3.22']){
  // Digest-pinned base images may be stored by digest only; obtain the matching Docker repository identity.
  let selected=image;try{run('docker',['image','inspect',selected,'--format','{{.Id}}']);}catch{const chart=image.startsWith('mariadb:')?'charts/store/values.yaml':'charts/platform/values.yaml';const content=readFileSync(join(destination,chart),'utf8');selected=content.match(new RegExp(image.split(':')[0]+':[^\\s]+'))?.[0];assert(selected);}
  run(join(root,'.tools/bin/k3d'),['image','import',selected,'--cluster',cluster]);
 }
 run(process.execPath,['scripts/store-secrets.mjs']);run(process.execPath,['scripts/mcp-secrets.mjs']);run(process.execPath,['scripts/platform-secrets.mjs']);
 helm(['upgrade','--install','demo-store','charts/store','-n','relay-store-m1','-f','infra/local/store-values.yaml','--set-string','site.url=http://store.relay.localhost:19080','--wait','--timeout','600s']);
 for(const kind of ['woocommerce','calendar','totals']){const ns=kind==='woocommerce'?'relay-store-m1':'relay-upstreams';helm(['upgrade','--install','relay-'+kind,'charts/hosted-mcp','-n',ns,'-f',`infra/local/mcp-${kind}.yaml`,'--set-string','image='+platformImage,...(kind==='woocommerce'?['--set-string','store.canonicalUrl=http://store.relay.localhost:19080']:[]),'--wait','--timeout','180s']);}
 helm(['upgrade','--install','relay-core','charts/platform','-n','relay-platform','-f','infra/local/platform-values.yaml','--set-string','platformImage='+platformImage,'--set-string','publicOrigin='+origin,'--set-string','kubeApiCidr='+nodeIp+'/32','--set-string','storefrontUrl=http://store.relay.localhost:19080/shop/','--set','modelEnabled=false','--wait','--wait-for-jobs','--timeout','300s']);
 run(process.execPath,['scripts/console-bootstrap.mjs'],destination,{RELAY_ORIGIN:origin});run(process.execPath,['scripts/console-browser.mjs'],destination,{RELAY_ORIGIN:origin,RELAY_EVIDENCE_DIR:'docs/evidence/m4-clean'});
 run(process.execPath,['tests/store/checkout.mjs'],destination,{STORE_URL:'http://store.relay.localhost:19080',STORE_EVIDENCE_DIR:'docs/evidence/m4-clean'});
 // Actual official MCP client against the new cluster, using its fresh B personal key only.
 const checkScript=`import{readFileSync}from'node:fs';import{Client,StreamableHTTPClientTransport}from'@modelcontextprotocol/client';const i=JSON.parse(readFileSync('.local/m4-acceptance-identity.json','utf8'));const c=new Client({name:'relay-clean-client',version:'0.4.0'});await c.connect(new StreamableHTTPClientTransport(new URL('${origin}/mcp'),{requestInit:{headers:{Authorization:'Bearer '+i.memberKey}}}));const t=(await c.listTools()).tools;if(t.length!==12)throw Error('Expected three upstreams');const info=t.filter(x=>x.title?.endsWith(': info'));if(info.length!==3)throw Error('Expected three independent info aliases');for(const x of info){const r=await c.callTool({name:x.name,arguments:{}});if(r.isError)throw Error('Actual upstream info failed');}await c.close();console.log(JSON.stringify({tools:t.length,actualUpstreams:3,passed:true}));`;
 writeFileSync(join(destination,'.local/check.mjs'),checkScript);run(process.execPath,['.local/check.mjs']);
 const resources=JSON.parse(kube(['get','pods,pvc,ingress','-A','-o','json']));const safe=resources.items.filter(r=>r.metadata.namespace?.startsWith('relay-')).map(r=>({kind:r.kind,name:r.metadata.name,namespace:r.metadata.namespace,phase:r.status?.phase,uid:r.metadata.uid,ready:r.status?.containerStatuses?.map(c=>c.ready)}));
 for(const file of ['browser.json','checkout.json'])copyFileSync(join(destination,'docs/evidence/m4-clean',file),join(evidence,'clean-'+file));
 writeFileSync(join(evidence,'clean-install.json'),JSON.stringify({at:new Date().toISOString(),passed:true,sourceCommit,destination,cluster,origin,platformImage,sourceFingerprint:fingerprint,checks:'fresh frozen online install, lint/typecheck/24 tests/build, empty cluster/PVCs, store bootstrap/COD/admin, two browser users, three real MCP upstreams via Ingress',resources:safe,modelTraffic:false,existingCoreTouched:false,architecture:'native arm64; same Helm charts with values overrides',teardown:'only newly created disposable cluster removed after evidence; existing clusters/volumes untouched'},null,2)+'\n');
 console.log(JSON.stringify({passed:true,sourceCommit,cluster,modelTraffic:false}));
}finally{if(created)run(join(root,'.tools/bin/k3d'),['cluster','delete',cluster]);}
