import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {kube} from './mcp-kube.mjs';
import {ingressFetch} from '../dist/packages/mcp-client/src/ingress.js';
import {authenticatedFixture} from './m5-fixture.mjs';
const f=await authenticatedFixture(),s=f.stores[1],report={at:new Date().toISOString(),checks:[]};
const sql=q=>kube(['exec','-n','relay-platform','relay-postgres-0','--','psql','-U','postgres','-d','relay','-At','-v','ON_ERROR_STOP=1','-c',q]).trim();
async function api(path,method='GET',body,status=200){const r=await ingressFetch('http://relay.localhost:18080/api/'+path,{method,headers:{cookie:f.cookie,origin:'http://relay.localhost:18080','x-relay-team':f.team,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,path);return r.json();}
async function row(){return (await api('stores')).stores.find(x=>x.id===s.id);}
async function ready(){await expect.poll(async()=>{const r=await row();return `${r.status}:${r.error_code??''}`;},{timeout:200000,intervals:[1000,3000]}).toBe('Ready:');}
const cleanup=()=>sql('DROP TRIGGER IF EXISTS m5_checkpoint ON app.store_events; DROP FUNCTION IF EXISTS public.m5_checkpoint(); DROP TABLE IF EXISTS public.m5_checkpoint_control;');
try{
 cleanup();sql("CREATE TABLE public.m5_checkpoint_control(store_id uuid PRIMARY KEY,phase text); CREATE FUNCTION public.m5_checkpoint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.m5_checkpoint_control c WHERE c.store_id=NEW.store_id AND c.phase=NEW.phase) THEN PERFORM pg_sleep(45); END IF; RETURN NEW; END $$; CREATE TRIGGER m5_checkpoint BEFORE INSERT ON app.store_events FOR EACH ROW EXECUTE FUNCTION public.m5_checkpoint();");
 for(const phase of ['Namespace','Admission','Secrets','StoreInstall','DatabaseReady','WooCommerceInitialized','AdapterInstall','Discovery','Registration','Ready']){
  sql(`INSERT INTO public.m5_checkpoint_control VALUES('${s.id}','${phase}') ON CONFLICT(store_id) DO UPDATE SET phase=EXCLUDED.phase;`);
  const before=sql(`SELECT resources->>'namespaceUid' FROM app.stores WHERE id='${s.id}'`);
  await api(`stores/${s.id}/reconcile`,'POST',{idempotencyId:randomUUID()},202);
  await expect.poll(()=>Number(sql("SELECT count(*) FROM pg_stat_activity WHERE usename='relay_provisioner' AND wait_event='PgSleep'")),{timeout:120000,intervals:[500,1000]}).toBeGreaterThan(0);
  const pods=JSON.parse(kube(['get','pods','-n','relay-platform','-l','relay.role=provisioner','-o','json']));assert.equal(pods.items.length,1);const killed=pods.items[0].metadata.uid;kube(['delete','pod',pods.items[0].metadata.name,'-n','relay-platform','--grace-period=0','--force','--wait=false']);
  sql("DELETE FROM public.m5_checkpoint_control; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='relay_provisioner' AND wait_event='PgSleep';");
  await ready();assert.equal(sql(`SELECT resources->>'namespaceUid' FROM app.stores WHERE id='${s.id}'`),before);
  const tools=(await api('tools')).tools;assert.equal(tools.filter(t=>t.upstreamId===s.id).length,6);assert(tools.filter(t=>t.upstreamId===s.id).every(t=>t.alias.startsWith(`store_${s.id.replaceAll('-','')}_`)));
  report.checks.push({phase,actualWorkerPodKilled:killed,sameNamespace:true,sixTools:true});writeFileSync('docs/evidence/m5/recovery-progress.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,recovered:true}));
 }
 cleanup();
 kube(['rollout','status','deployment/relay-provisioner','-n','relay-platform','--timeout=120s']);
 // A genuine dispatched outbox loses its paused owned queue, then SQL republishes it.
 const pause="const {Queue}=await import('bullmq');const {Redis}=await import('ioredis');const fs=await import('node:fs');const c=new Redis({host:'relay-redis',password:fs.readFileSync('/run/platform/redis-password','utf8').trim(),db:1,maxRetriesPerRequest:null});const q=new Queue('store-lifecycle',{connection:c,prefix:'relay-m5'});await q.pause();await q.close();await c.quit();console.log('Owned provisioning queue paused');";
 kube(['exec','-n','relay-platform','deployment/relay-provisioner','--','node','--input-type=module','-e',pause]);
 await api(`stores/${s.id}/reconcile`,'POST',{idempotencyId:randomUUID()},202);
 await expect.poll(()=>sql(`SELECT count(*) FROM app.outbox_events e JOIN app.stores s ON s.id=e.store_id AND s.generation=e.generation WHERE s.id='${s.id}' AND e.dispatched_at IS NOT NULL`),{timeout:30000,intervals:[1000]}).toBe('1');
 assert.equal((await row()).status,'Provisioning');
 kube(['scale','deployment/relay-provisioner','-n','relay-platform','--replicas=0']);
 kube(['wait','--for=delete','pod','-n','relay-platform','-l','relay.role=provisioner','--timeout=90s']);
 const flush='export REDISCLI_AUTH="$(cat /run/redis/password)"; keys=$(redis-cli -n 1 --raw keys "*"); for key in $keys; do case "$key" in relay-m5:*) ;; *) exit 19;; esac; done; redis-cli -n 1 flushdb';
 assert.equal(kube(['exec','-n','relay-platform','relay-redis-0','--','sh','-c',flush]).trim(),'OK');
 kube(['delete','pod','relay-redis-0','-n','relay-platform','--wait=false']);
 kube(['scale','deployment/relay-provisioner','-n','relay-platform','--replicas=1']);
 await ready();report.checks.push({case:'Actually dispatched outbox, owned queue loss and Redis pod restart',sqlDesiredStateRecovered:true});
 // Global user cap is enforced across teams, not merely within the selected tenant.
 const otherTeam=await api('teams','POST',{name:'M5 Cross-team Admission'});const response=await ingressFetch('http://relay.localhost:18080/api/stores',{method:'POST',headers:{cookie:f.cookie,origin:'http://relay.localhost:18080','x-relay-team':otherTeam.id,'content-type':'application/json'},body:JSON.stringify({name:'Must remain rejected',idempotencyId:randomUUID()})});assert.equal(response.status,409);assert.equal((await response.json()).error.code,'STORE_LIMIT');report.checks.push({case:'Cross-team per-user cap',denied:true});
 // Restore selected workspace only on the browser's next explicit navigation; server session is unchanged.
 report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;process.exitCode=1;}finally{cleanup();writeFileSync('docs/evidence/m5/recovery.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failure:report.failure}));}
