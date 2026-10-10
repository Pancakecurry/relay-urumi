import { execFileSync } from 'node:child_process';
export const env={...process.env,KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
export const kube=args=>execFileSync('.tools/bin/kubectl',args,{env,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
export const apply=object=>execFileSync('.tools/bin/kubectl',['apply','--server-side','--field-manager=relay-m2','-f','-'],{env,input:JSON.stringify(object),encoding:'utf8',stdio:['pipe','pipe','pipe']});
export function replaceTestPod(ns,name){
  let pod;try{pod=JSON.parse(kube(['get','pod',name,'-n',ns,'-o','json']));}catch(e){if(!e.stderr?.includes('NotFound'))throw e;}
  if(pod){if(pod.metadata.labels?.['relay.test']!=='m2')throw new Error('Refusing to replace unrelated pod');kube(['delete','pod',name,'-n',ns,'--wait=true']);}
}
export async function finishPod(ns,name,timeout=120000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const pod=JSON.parse(kube(['get','pod',name,'-n',ns,'-o','json']));
    if(pod.status.phase==='Succeeded')return kube(['logs',name,'-n',ns]);
    if(pod.status.phase==='Failed')throw new Error(`Test pod failed: ${kube(['logs',name,'-n',ns])}`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Test pod deadline exceeded');
}
export const security={runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000,seccompProfile:{type:'RuntimeDefault'}};
export const containerSecurity={allowPrivilegeEscalation:false,readOnlyRootFilesystem:true,capabilities:{drop:['ALL']}};
