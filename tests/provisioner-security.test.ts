import {describe,it,expect} from 'vitest';
import {owned,Fault,type Resource} from '../apps/provisioner/src/kubernetes.js';
import {destination} from '../packages/auth/src/destinations.js';
describe('store controller boundaries',()=>{
 it('rejects unlabeled and foreign resources before reuse',()=>{
  for(const labels of [undefined,{}, {'relay.store/id':'foreign'}]){
   const resource:Resource={apiVersion:'v1',kind:'Namespace',metadata:{name:'relay-store-abc',...(labels?{labels}:{})}};
   expect(()=>owned(resource,'owner')).toThrowError(Fault);
  }
 });
 it('allows only the generated store DNS shape at the private MCP port/path',()=>{
  const ns='relay-store-'+'a'.repeat(32);
  expect(destination(`http://store-mcp.${ns}.svc.cluster.local:3000/mcp`).hostname).toContain(ns);
  for(const url of [`http://store-wp.${ns}.svc.cluster.local:80/mcp`,`http://store-mcp.relay-store-arbitrary.svc.cluster.local:3000/mcp`,`http://store-mcp.${ns}.svc.cluster.local:3000/admin`,`http://store-mcp.${ns}.svc.cluster.local:3000/mcp?target=metadata`,`http://169.254.169.254:3000/mcp`])expect(()=>destination(url)).toThrow();
 });
});
