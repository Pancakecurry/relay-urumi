import { execFileSync } from 'node:child_process';
import { writeFileSync, statfsSync } from 'node:fs';
import { totalmem, freemem } from 'node:os';

const run = (command, args, env = process.env) => execFileSync(command, args, {env, encoding:'utf8', timeout:30000, stdio:['ignore','pipe','pipe']}).trim();
const env = {...process.env, KUBECONFIG:`${process.cwd()}/.local/kubeconfig`};
const k = (...args) => run('.tools/bin/kubectl', args, env);
const pods = JSON.parse(k('get','pods','-A','-o','json'));
const containerNames = ['k3d-relay-m0-server-0','k3d-relay-m0-serverlb'];
const docker = containerNames.map(name => {
  const item = JSON.parse(run('docker',['inspect',name]))[0];
  const image = JSON.parse(run('docker',['image','inspect',item.Image]))[0];
  return {name,image:item.Config.Image,imageId:item.Image,repoDigests:image.RepoDigests,memoryLimitBytes:item.HostConfig.Memory,portBindings:item.NetworkSettings.Ports};
});
const inventory = {
  at:new Date().toISOString(), docker,
  pods:pods.items.map(p => ({namespace:p.metadata.namespace,name:p.metadata.name,phase:p.status.phase,
    containers:[...(p.spec.initContainers??[]),...p.spec.containers].map(c=>({name:c.name,image:c.image,
      imageId:[...(p.status.initContainerStatuses??[]),...(p.status.containerStatuses??[])].find(s=>s.name===c.name)?.imageID??null,
      resources:c.resources}))})),
  nodeVersions:JSON.parse(k('get','nodes','-o','json')).items.map(n=>({name:n.metadata.name,version:n.status.nodeInfo,capacity:n.status.capacity,allocatable:n.status.allocatable})),
  pvc:JSON.parse(k('get','pvc','-n','relay-m0','-o','json')).items.map(v=>({name:v.metadata.name,status:v.status,storageClass:v.spec.storageClassName}))
};
writeFileSync('docs/evidence/cluster-image-identities.json',JSON.stringify(inventory,null,2)+'\n');
const disk=statfsSync('.');
const resources={at:inventory.at,ramBytes:totalmem(),freeRamBytes:freemem(),freeDiskBytes:disk.bavail*disk.bsize,
  note:'OS free RAM is not the same as reclaimable/available RAM; macOS memory-pressure output is recorded separately.',
  memoryPressure:run('memory_pressure',['-Q']),
  dockerStats:containerNames.map(name=>JSON.parse(run('docker',['stats','--no-stream','--format','{{json .}}',name]))),
  kubernetesNodeUsage:k('top','nodes'),kubernetesProofUsage:k('top','pods','-n','relay-m0'),
  unrelatedRunningContainerCount:run('docker',['ps','--format','{{.Names}}']).split('\n').filter(name=>!name.startsWith('k3d-relay-m0-')).length};
writeFileSync('docs/evidence/resources.json',JSON.stringify(resources,null,2)+'\n');
console.log('Sanitized runtime image, storage and resource evidence saved.');
