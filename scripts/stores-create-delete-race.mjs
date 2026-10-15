import {authenticatedFixture} from './m5-fixture.mjs';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {kube} from './mcp-kube.mjs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
const f=await authenticatedFixture(),origin='http://relay.localhost:18080';
async function api(path,body){const r=await ingressFetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{cookie:f.cookie,origin,'x-relay-team':f.team,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,body?202:200);return r.json();}
const sql=q=>kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-At','-c',q]).trim();
const creation={name:'Race Cancellation Synthetic Store',idempotencyId:randomUUID()};const s=(await api('stores',creation)).store;
await expect.poll(()=>Number(sql(`SELECT count(*) FROM app.store_events WHERE store_id='${s.id}' AND phase='Namespace'`)),{timeout:90000,intervals:[500,1000]}).toBeGreaterThan(0);
const before=JSON.parse(sql(`SELECT row_to_json(s) FROM app.stores s WHERE id='${s.id}'`));assert.equal(before.status,'Provisioning');
const deletion={idempotencyId:randomUUID()};const answers=await Promise.all([api(`stores/${s.id}/delete`,deletion),api('stores',creation),api(`stores/${s.id}/delete`,deletion)]);assert(answers.every(r=>r.store.id===s.id));
await expect.poll(async()=>{const rows=(await api('stores')).stores;return rows.find(x=>x.id===s.id).status;},{timeout:240000,intervals:[1000,3000]}).toBe('Deleted');
assert.equal(sql(`SELECT count(*) FROM app.operations WHERE store_id='${s.id}'`),'2');assert.equal(sql(`SELECT count(*) FROM app.stores WHERE user_id='${f.user}' AND name='${creation.name}'`),'1');
const resources=JSON.parse(sql(`SELECT resources FROM app.stores WHERE id='${s.id}'`));const absent=(kind,name)=>{try{kube(['get',kind,name]);return false;}catch(e){if(String(e.stderr).includes('NotFound'))return true;throw e;}};assert(absent('namespace',s.namespace));for(const v of resources.volumes??[]){assert(absent('pv',v.name));if(v.path)execFileSync('docker',['exec','k3d-relay-m0-server-0','test','!','-e',v.path],{stdio:['ignore','pipe','pipe']});assert.equal(execFileSync('docker',['exec','k3d-relay-m0-server-0','find','/var/lib/rancher/k3s/storage','-maxdepth','1','-name',v.name+'_*'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'');}
assert.equal(sql(`SELECT count(*) FROM app.store_events WHERE store_id='${s.id}' AND generation>1 AND phase='Ready'`),'0');assert.equal(sql(`SELECT count(*) FROM app.upstreams WHERE id='${s.id}' AND deleted_at IS NULL`),'0');
const tools=(await api('tools')).tools;assert(!tools.some(t=>t.upstreamId===s.id));assert(tools.some(t=>t.upstreamId===f.stores[1].id));
const result={at:new Date().toISOString(),passed:true,storeId:s.id,beforeDeletion:{status:before.status,phase:before.phase,generation:before.generation},concurrentRequests:3,committedOperations:2,duplicateCreationReused:true,generationFence:true,namespaceAbsent:true,recordedVolumesAndDataAbsent:true,volumes:resources.volumes??[],activeRegistrationAbsent:true,survivingStoreTools:true};writeFileSync('docs/evidence/m5/create-delete-race.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
