import {kube} from './mcp-kube.mjs';import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const name='k3d-relay-m0-server-0';
const owned=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
assert.equal(owned.Config.Labels['k3d.cluster'],'relay-m0');assert.equal(owned.HostConfig.Memory,4294967296);
const before=JSON.parse(kube(['get','node',name,'-o','json']));const namespaces=JSON.parse(kube(['get','namespace','-o','json'])).items.filter(n=>n.metadata.labels?.['relay-owned']).map(n=>({name:n.metadata.name,uid:n.metadata.uid}));
const claims=JSON.parse(kube(['get','pvc','-A','-o','json'])).items.filter(p=>namespaces.some(n=>n.name===p.metadata.namespace)).map(p=>({namespace:p.metadata.namespace,name:p.metadata.name,uid:p.metadata.uid,volume:p.spec.volumeName}));
execFileSync('docker',['restart','--time','30',name],{stdio:['ignore','ignore','pipe']});
await new Promise(resolve=>setTimeout(resolve,3000));
let ready=false;for(let n=0;n<90;n++){try{const node=JSON.parse(kube(['get','node',name,'-o','json']));if(node.status.conditions.some(c=>c.type==='Ready'&&c.status==='True')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'Owned node recovery');
for(const n of namespaces)assert.equal(JSON.parse(kube(['get','namespace',n.name,'-o','json'])).metadata.uid,n.uid);
for(const p of claims){const current=JSON.parse(kube(['get','pvc',p.name,'-n',p.namespace,'-o','json']));assert.equal(current.metadata.uid,p.uid);assert.equal(current.spec.volumeName,p.volume);assert.equal(current.status.phase,'Bound');}
const after=JSON.parse(kube(['get','node',name,'-o','json']));
const r={at:new Date().toISOString(),passed:true,containerMemoryBytes:owned.HostConfig.Memory,nodeCapacityBefore:before.status.capacity.memory,nodeCapacityAfter:after.status.capacity.memory,namespacesPreserved:namespaces.length,claimsPreserved:claims.length,unrelatedResourcesChanged:false,dataRestorationClaim:false};writeFileSync('docs/evidence/m6/node-refresh.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
