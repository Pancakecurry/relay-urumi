#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
kubectl create namespace relay-m0 --dry-run=client -o yaml | kubectl apply -f -
if [[ ! -f .local/m0-token ]]; then
  node --input-type=module -e 'import {randomBytes} from "node:crypto";import {writeFileSync} from "node:fs";writeFileSync(".local/m0-token",randomBytes(32).toString("hex"),{mode:0o600,flag:"wx"})'
fi
kubectl create secret generic relay-m0-credential -n relay-m0 --from-file=token=.local/m0-token --dry-run=client -o yaml | kubectl apply -f -
image_tag=$(node scripts/image-tag.mjs)
docker build -f apps/gateway/Dockerfile -t "relay/m0-proof:$image_tag" .
k3d image import "relay/m0-proof:$image_tag" --cluster relay-m0
helm lint charts/platform -f charts/platform/values-local.yaml
helm upgrade --install relay-m0 charts/platform -n relay-m0 -f charts/platform/values-local.yaml --set-string "image.tag=$image_tag" --wait --timeout 120s
kubectl rollout status deployment/relay-m0-proof -n relay-m0 --timeout=120s
