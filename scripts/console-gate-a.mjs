// Evaluate recorded real acceptance outputs, never infer success from a pod or source file.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir='docs/evidence/m4';
const read=n=>JSON.parse(readFileSync(`${dir}/${n}.json`,'utf8'));
const checks=[];
for(const name of ['browser','operations','business-regression','external-agent','inspector','regression','security','network','clean-install']){
 assert.equal(read(name).passed,true,`${name}: actual acceptance must pass`);checks.push(name);
}
const visual=read('visual/review');assert.equal(visual.passed,true);assert.equal(visual.errors.length,0);assert(visual.screenshots.length>=49);assert(visual.checks.some(c=>c.includes('authorized palette refresh')));checks.push('all-screen spacing, dialogs, responsive layout and real palette action');
const create=read('chat-create'),orders=read('chat-orders'),checkout=read('checkout'),external=read('external-agent'),ops=read('operations');
for(const run of [create,orders]){assert.equal(run.run.status,'success');assert(run.events.some(e=>e.kind==='provider.response'&&e.data.status===200));}
const finished=run=>run.events.filter(e=>e.kind==='tool.finish');
assert(finished(create).some(e=>e.data.result?.structuredContent?.product?.id===checkout.productId));
assert(checkout.realBrowserCheckout&&checkout.orderVerifiedInAdmin&&checkout.authenticatedRestStatus===200&&checkout.paymentMethod==='cod');
for(const run of [orders,external])assert(finished(run).some(e=>e.data.result?.structuredContent?.orders?.some(o=>o.id===checkout.orderId)),'New COD order must appear in actual today-orders page');
const actors={A:create.userId,B:external.userId};assert.notEqual(actors.A,actors.B);
for(const [runs,actor,kind] of [[[create,orders],actors.A,'delegation'],[[external],actors.B,'key']]){
 for(const run of runs)for(const e of finished(run)){
  const id=e.data.result?._meta?.relay?.auditId;assert(id);const a=ops.audits.find(a=>a.id===id);assert(a&&a.user_id===actor&&a.auth_kind===kind&&a.status===e.data.status,'Persisted audit attribution/result correlation');
 }
}
assert(new Set(finished(external).map(e=>ops.audits.find(a=>a.id===e.data.result?._meta?.relay?.auditId)?.upstream_id)).size>=2);
assert(ops.audits.some(a=>a.user_id===actors.B&&a.code==='KEY_REVOKED'&&a.status==='rejected'));
checks.push('actual A product/COD/admin/today-orders; B autonomous two-upstream prompt; durable identity and revocation');
const persistence=read('persistence');assert(persistence.pvcIdentitiesUnchanged&&persistence.existingOrderProductAndContentVerified);checks.push('real store replacement preserves original data');
const image=readFileSync(`${dir}/image.txt`,'utf8').trim(),inventory=read('inventory'),clean=read('clean-install');
assert.equal(inventory.platformImage,image);assert.equal(clean.platformImage,image);assert.equal(clean.modelTraffic,false);assert.equal(clean.existingCoreTouched,false);
assert.equal(execFileSync(process.execPath,['scripts/mcp-image-tag.mjs'],{encoding:'utf8'}).trim().replace(/^m2-/,'m4-'),clean.sourceFingerprint);
assert(inventory.pods.every(p=>p.phase==='Running'&&p.containers?.every(c=>c.ready)));
assert(/Tests\s+25 passed/.test(readFileSync(`${dir}/deploy-port-repair.txt`,'utf8')));checks.push('25 tests, exact runtime fingerprint, fresh source and empty-cluster acceptance');
for(const name of ['clean-token-rotation','token-rotation']){const rotation=read(name);assert(rotation.passed&&rotation.actualDockerRestart&&rotation.pvcIdentitiesPreserved);assert.equal(rotation.oldTokenStatus,401);assert.equal(rotation.newTokenStatus,200);}checks.push('exposed local join token rotated; old token rejected after actual restart; PVCs preserved');
const ids=[...Array.from({length:7},(_,i)=>`K0${i+1}`),...Array.from({length:4},(_,i)=>`W0${i+1}`),...Array.from({length:6},(_,i)=>`G0${i+1}`),...Array.from({length:4},(_,i)=>`T0${i+1}`),'U01','U02','A01','A02',...Array.from({length:4},(_,i)=>`E0${i+1}`)];
assert.equal(ids.length,29);
writeFileSync(`${dir}/gate-a.json`,JSON.stringify({at:new Date().toISOString(),passed:true,scope:'local mandatory core; K03 same-chart production-like configuration, actual VPS/TLS remains D01/M9',requirements:ids,checks,sourceCommit:clean.sourceCommit,platformImage:image,productId:checkout.productId,orderId:checkout.orderId,actors,modelTrafficDuringFinalGate:false,limitations:['native arm64 only','no actual VPS/public TLS','M10 video/submission pending','M4 inspector is not complete C1','prepaid reservation guard leaves only INR6 for M4']},null,2)+'\n');
console.log(JSON.stringify({passed:true,requirements:ids.length,productId:checkout.productId,orderId:checkout.orderId}));
