import { kube, namespace } from '../tests/store/client.mjs';
console.log(kube(['get','pods,pvc,svc,ingress,networkpolicy','-n',namespace,'-o','wide']));
