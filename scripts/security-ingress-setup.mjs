import {kube,env} from './mcp-kube.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=JSON.parse(kube(['get','secret','relay-local-root','-n','relay-pki','-o','json']));assert.equal(root.metadata.labels['relay-owned'],'m6');
const ca=Buffer.from(root.data['tls.crt'],'base64');writeFileSync('.local/relay-ca.crt',ca,{mode:0o600});
let existing;try{existing=JSON.parse(kube(['get','secret','relay-trust','-n','relay-platform','-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
if(existing){assert.equal(existing.metadata.labels['relay-owned'],'m6');assert.equal(existing.data['ca.crt'],ca.toString('base64'));}
else execFileSync('.tools/bin/kubectl',['create','-f','-'],{env,input:JSON.stringify({apiVersion:'v1',kind:'Secret',metadata:{name:'relay-trust',namespace:'relay-platform',labels:{'relay-owned':'m6'}},data:{'ca.crt':ca.toString('base64')}}),stdio:['pipe','ignore','pipe']});
const lb=JSON.parse(execFileSync('docker',['inspect','k3d-relay-m0-serverlb'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];assert.equal(lb.Config.Labels['k3d.cluster'],'relay-m0');
const ports=lb.HostConfig.PortBindings;if(!ports['443/tcp']?.some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='18443')){
 if(ports['443/tcp'])throw new Error('Existing TLS mapping differs; refusing to broaden or overwrite it');
 execFileSync('.tools/bin/k3d',['cluster','edit','relay-m0','--port-add','127.0.0.1:18443:443@loadbalancer'],{env,stdio:['ignore','ignore','pipe']});
}
const after=JSON.parse(execFileSync('docker',['inspect','k3d-relay-m0-serverlb'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0].HostConfig.PortBindings;
assert(after['80/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='18080'));assert(after['443/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='18443'));
console.log(JSON.stringify({passed:true,httpsLoopbackPort:18443,originalHttpPortPreserved:true,projectCaFile:'.local/relay-ca.crt',systemTrustChanged:false}));
