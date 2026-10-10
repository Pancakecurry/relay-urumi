#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
export STORE_NAMESPACE="${STORE_NAMESPACE:-relay-store-m1}"
store_release="${STORE_RELEASE:-demo-store}"
store_values="${STORE_VALUES:-infra/local/store-values.yaml}"
node scripts/store-secrets.mjs
store_tag=$(node --input-type=module -e 'import{createHash}from"node:crypto";import{readFileSync,readdirSync}from"node:fs";const h=createHash("sha256");for(const n of readdirSync("infra/store").sort())h.update(n).update(readFileSync(`infra/store/${n}`));console.log(`m1-${h.digest("hex").slice(0,16)}`)')
docker build -t "relay/store:$store_tag" infra/store
k3d image import "relay/store:$store_tag" --cluster relay-m0
helm lint charts/store -f "$store_values"
helm upgrade --install "$store_release" charts/store -n "$STORE_NAMESPACE" -f "$store_values" --set-string "wordpress.image=relay/store:$store_tag" --wait --timeout 600s
kubectl logs -n "$STORE_NAMESPACE" "job/$store_release-bootstrap"
printf 'Store Helm release ready: %s / %s\n' "$STORE_NAMESPACE" "$store_release"
