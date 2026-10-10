#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
kubectl get nodes -o wide
kubectl get pods -A
kubectl get storageclass
kubectl get ingress -A
docker exec k3d-relay-m0-server-0 k3s secrets-encrypt status
