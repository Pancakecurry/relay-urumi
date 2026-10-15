#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
pnpm check
node scripts/platform-secrets.mjs
platform_tag=$(node scripts/mcp-image-tag.mjs | sed 's/^m2-/m5-/')
kube_api_ip=$(kubectl get nodes -o 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}')
docker build -f apps/api/Dockerfile -t "relay/platform:$platform_tag" .
docker build -f apps/provisioner/Dockerfile --build-arg "PLATFORM_IMAGE=relay/platform:$platform_tag" -t "relay/provisioner:$platform_tag" .
k3d image import "relay/platform:$platform_tag" --cluster relay-m0
k3d image import "relay/provisioner:$platform_tag" --cluster relay-m0
helm lint charts/platform -f infra/local/platform-values.yaml --set provisionerEnabled=true
helm upgrade --install relay-core charts/platform -n relay-platform -f infra/local/platform-values.yaml --set-string "platformImage=relay/platform:$platform_tag" --set-string "provisionerImage=relay/provisioner:$platform_tag" --set-string "kubeApiCidr=$kube_api_ip/32" --set provisionerEnabled=true --set dashboardEnabled=true --set modelEnabled=true --wait --wait-for-jobs --timeout 300s
mkdir -p docs/evidence/m5
printf '%s\n' "relay/platform:$platform_tag" "relay/provisioner:$platform_tag" > docs/evidence/m5/images.txt
