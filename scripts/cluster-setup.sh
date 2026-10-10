#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH"
mkdir -p .local
if k3d cluster list -o json | node -e 'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>process.exit(JSON.parse(b).some(c=>c.name==="relay-m0")?0:1))'; then
  printf '%s\n' 'Existing relay-m0 detected; preserving it.'
else
  k3d cluster create --config infra/local/k3d.yaml --servers-memory 3G --timeout 180s
fi
docker inspect k3d-relay-m0-serverlb --format '{{json .NetworkSettings.Ports}}' | node -e 'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{const ports=JSON.parse(b);for(const port of ["80/tcp","6443/tcp"]){if(!ports[port]?.length||!ports[port].every(p=>p.HostIp==="127.0.0.1")){console.error("Unsafe or missing loopback binding for "+port+"; preserve the cluster and repair its dedicated load-balancer mapping before continuing.");process.exit(1);}}})'
k3d kubeconfig get relay-m0 > .local/kubeconfig
chmod 600 .local/kubeconfig
export KUBECONFIG="$PWD/.local/kubeconfig"
kubectl wait --for=condition=Ready node --all --timeout=120s
for attempt in $(seq 1 60); do
  if kubectl get deployment/traefik -n kube-system >/dev/null 2>&1; then break; fi
  sleep 2
done
kubectl rollout status deployment/traefik -n kube-system --timeout=120s
