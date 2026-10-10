#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
pnpm check
kube_api_ip=$(kubectl get nodes -o 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}')
kube_api_cidr="${KUBE_API_CIDR:-$kube_api_ip/32}"
node scripts/platform-secrets.mjs
platform_tag=$(node scripts/mcp-image-tag.mjs | sed 's/^m2-/m3-/')
docker build -f apps/api/Dockerfile -t "relay/platform:$platform_tag" .
k3d image import "relay/platform:$platform_tag" --cluster relay-m0
helm lint charts/platform -f infra/local/platform-values.yaml
helm upgrade --install relay-core charts/platform -n relay-platform -f infra/local/platform-values.yaml --set-string "platformImage=relay/platform:$platform_tag" --set-string "kubeApiCidr=$kube_api_cidr" --wait --wait-for-jobs --timeout 300s
mkdir -p docs/evidence/m3
printf '%s\n' "relay/platform:$platform_tag" > docs/evidence/m3/image.txt
