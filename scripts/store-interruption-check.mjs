import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { kube, namespace, release } from '../tests/store/client.mjs';
const env={...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
const state=()=>JSON.parse(execFileSync(process.execPath,['scripts/store-state.mjs'],{encoding:'utf8'}));
const before=state();const original=JSON.parse(kube(['get','job',`${release}-bootstrap`,'-n',namespace,'-o','json']));
const template=original.spec.template;delete template.metadata.labels['batch.kubernetes.io/controller-uid'];delete template.metadata.labels['controller-uid'];delete template.metadata.labels['batch.kubernetes.io/job-name'];delete template.metadata.labels['job-name'];
const name=`${release}-interruption-check`;
template.spec.containers[0].command=['bash','-c','wp --allow-root eval-file /opt/relay/bootstrap.php && echo MUTATIONS_APPLIED_BEFORE_INTERRUPTION && sleep 60'];
const job={apiVersion:'batch/v1',kind:'Job',metadata:{name,namespace,labels:{'relay-owned':'m1-test'}},spec:{backoffLimit:0,activeDeadlineSeconds:120,template}};
execFileSync('.tools/bin/kubectl',['create','-f','-'],{input:JSON.stringify(job),env,stdio:['pipe','pipe','pipe']});
let applied=false;
try{
 for(let i=0;i<20;i++){try{const log=kube(['logs',`job/${name}`,'-n',namespace]);if(log.includes('MUTATIONS_APPLIED_BEFORE_INTERRUPTION')){applied=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 if(!applied)throw new Error('Interruption checkpoint not reached');
 const current=JSON.parse(kube(['get','job',name,'-n',namespace,'-o','json']));if(current.status.succeeded)throw new Error('Job completed before interruption');
 console.log('Bootstrap mutations applied, Job still active; interrupting only owned test Job.');
}finally{kube(['delete','job',name,'-n',namespace,'--wait=true']);}
// Run the reviewed real bootstrap again after termination, not a mock recovery.
execFileSync('bash',['scripts/store-deploy.sh'],{stdio:'inherit'});
const after=state();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Recovery changed identities/counts');
const result={at:new Date().toISOString(),mutationsAppliedBeforeTermination:applied,jobTerminatedBeforeCompletion:true,realHelmRecoveryPassed:true,before,after};writeFileSync('docs/evidence/m1/interruption.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
