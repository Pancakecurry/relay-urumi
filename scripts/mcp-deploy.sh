#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
pnpm check
node scripts/mcp-secrets.mjs
mcp_tag=$(node scripts/mcp-image-tag.mjs)
docker build -f apps/woocommerce-mcp/Dockerfile -t "relay/upstreams:$mcp_tag" .
k3d image import "relay/upstreams:$mcp_tag" --cluster relay-m0
for kind in woocommerce calendar totals; do
  mcp_ns=relay-upstreams
  if [ "$kind" = woocommerce ]; then mcp_ns=relay-store-m1; fi
  helm lint charts/hosted-mcp -f "infra/local/mcp-$kind.yaml" --set-string "image=relay/upstreams:$mcp_tag"
  helm upgrade --install "relay-$kind" charts/hosted-mcp -n "$mcp_ns" -f "infra/local/mcp-$kind.yaml" --set-string "image=relay/upstreams:$mcp_tag" --wait --timeout 180s
done
mkdir -p docs/evidence/m2
printf '%s\n' "relay/upstreams:$mcp_tag" > docs/evidence/m2/image.txt
