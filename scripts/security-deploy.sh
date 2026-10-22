#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
pnpm check
if [[ "${RELAY_BUILD_ONLY:-0}" != "1" ]]; then node scripts/platform-secrets.mjs; fi
platform_tag=$(node scripts/mcp-image-tag.mjs | sed 's/^m2-/m6-/')
kube_api_ip=$(kubectl get nodes -o 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}')
docker build -f apps/api/Dockerfile -t "relay/platform:$platform_tag" .
docker build -f apps/provisioner/Dockerfile --build-arg "PLATFORM_IMAGE=relay/platform:$platform_tag" -t "relay/provisioner:$platform_tag" .
k3d image import "relay/platform:$platform_tag" --cluster relay-m0
k3d image import "relay/provisioner:$platform_tag" --cluster relay-m0
printf '%s\n' "relay/platform:$platform_tag" "relay/provisioner:$platform_tag" > .local/m6-candidate-images.txt
if [[ "${RELAY_BUILD_ONLY:-0}" == "1" ]]; then exit 0; fi
node scripts/run-acceptance.mjs scripts/security-vault-migrate.mjs
helm lint charts/platform -f infra/local/platform-values.yaml -f infra/local/security-values.yaml --set provisionerEnabled=true
helm upgrade --install relay-core charts/platform -n relay-platform -f infra/local/platform-values.yaml -f infra/local/security-values.yaml --set-string "platformImage=relay/platform:$platform_tag" --set-string "provisionerImage=relay/provisioner:$platform_tag" --set-string "kubeApiCidr=$kube_api_ip/32" --set provisionerEnabled=true --set dashboardEnabled=true --set modelEnabled=true --wait --wait-for-jobs --timeout 300s
mkdir -p docs/evidence/m6
printf '%s\n' "relay/platform:$platform_tag" "relay/provisioner:$platform_tag" > docs/evidence/m6/images.txt
