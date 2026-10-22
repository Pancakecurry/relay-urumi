# Current local release installation

Run in the repository root. Preserve existing data; the setup scripts refuse ownership or Secret mismatches. On an existing deployment do not recreate the cluster, regenerate credentials, remove PVCs or rerun historical HTTP deployment scripts. `docs/evidence/m6/clean-install.json` records the equivalent sequence against a genuinely empty independent cluster with new credentials.

## Prepare tooling and images

Use Node/pnpm/Docker and the exact tool versions in `docs/versions.md`. `node scripts/bootstrap-tools.mjs` installs the pinned project-local tools on the verified macOS architecture. Review that script before using another OS; on Linux install the corresponding official versions and expose them through `.tools/bin`.

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
node scripts/environment.mjs
node scripts/bootstrap-tools.mjs
export PATH="$PWD/.tools/bin:$PATH"
bash scripts/cluster-setup.sh
export KUBECONFIG="$PWD/.local/kubeconfig"
pnpm check
```

Fresh `infra/local/k3d.yaml` maps loopback 18080/18443 to Ingress 80/443. Setup preserves an existing `relay-m0`; its API port may differ, so use the generated dedicated kubeconfig. The working installation has API56048. Do not modify the owner's default kubeconfig.

```sh
RELAY_BUILD_ONLY=1 bash scripts/security-deploy.sh
docker build -t relay/store:m6-5698c668ea0141c1 infra/store
k3d image import relay/store:m6-5698c668ea0141c1 --cluster relay-m0
```

The reviewed store image hash is derived from every file under `infra/store`; it includes WooCommerce 11.2.1 and the known-hash mysqlnd verification bridge. If those inputs change, review/rebuild and update the selected values instead of reusing a misleading old image tag. Platform/provisioner source-and-bundle tags are generated after the production build and written to ignored `.local/m6-candidate-images.txt`.

## Secrets, PKI and platform

```sh
node scripts/store-secrets.mjs
node scripts/mcp-secrets.mjs
node scripts/platform-secrets.mjs
bash scripts/security-pki-setup.sh
node scripts/security-data-tls-config.mjs
node scripts/release-trust.mjs
```

Create the `relay-trust` Secret in `relay-platform` containing **only** the `tls.crt` CA certificate from `relay-pki/relay-local-root`, under key `ca.crt`, labelled `relay-owned=m6`. Never copy `tls.key`. Save that public CA certificate to ignored `.local/relay-ca.crt` for explicit client trust. The clean installer performs this exact operation programmatically. On rerun compare existing bytes/ownership and refuse a mismatch; do not rotate the root silently.

Read the two generated image tags into shell variables and deploy:

```sh
platform_image=$(sed -n '1p' .local/m6-candidate-images.txt)
provisioner_image=$(sed -n '2p' .local/m6-candidate-images.txt)
kube_api_ip=$(kubectl get nodes -o 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}')
helm upgrade --install relay-core charts/platform -n relay-platform \
  -f infra/local/platform-values.yaml -f infra/local/security-values.yaml \
  --set-string "platformImage=$platform_image" \
  --set-string "provisionerImage=$provisioner_image" \
  --set-string "kubeApiCidr=$kube_api_ip/32" \
  --set provisionerEnabled=true --set dashboardEnabled=true --set modelEnabled=false \
  --wait --wait-for-jobs --timeout 360s
```

The chart waits for the migration Job and readiness; PostgreSQL applies all nine migrations. API/gateway receive different Secret/SQL-role identities. Redis TLS uses a separate configuration Secret with the same preserved password.

## Original store and private upstreams

```sh
helm upgrade --install demo-store charts/store -n relay-store-m1 \
  -f infra/local/store-values.yaml \
  --set-string wordpress.image=relay/store:m6-5698c668ea0141c1 \
  --set runtime.nonRoot=true --set transportTls.enabled=true \
  --set-string transportTls.adapterCommonName=relay-woocommerce.relay-store-m1 \
  --set-string site.url=https://store.relay.localhost:18443 \
  --set-string ingress.httpsPort=18443 --wait --wait-for-jobs --timeout 360s
helm upgrade --install relay-woocommerce charts/hosted-mcp -n relay-store-m1 \
  -f infra/local/mcp-woocommerce.yaml --set-string "image=$platform_image" \
  --set transportTls.enabled=true \
  --set-string store.connectionUrl=https://demo-store-wp \
  --set-string store.canonicalUrl=https://store.relay.localhost:18443 --wait --timeout 180s
helm upgrade --install relay-calendar charts/hosted-mcp -n relay-upstreams \
  -f infra/local/mcp-calendar.yaml --set-string "image=$platform_image" \
  --set transportTls.enabled=true --wait --timeout 180s
helm upgrade --install relay-totals charts/hosted-mcp -n relay-upstreams \
  -f infra/local/mcp-totals.yaml --set-string "image=$platform_image" \
  --set transportTls.enabled=true --wait --timeout 180s
```

`node scripts/release-bootstrap.mjs` creates/reuses real private synthetic owner/member identities, uses invitations and registers the original HTTPS services; do not run the old HTTP-only console bootstrap unchanged. The tested security fixture registers HTTPS services under a real admin session and invitations; it is an acceptance fixture, not public sign-up enrollment.

All MCP services are ClusterIP and require the gateway's service identity plus their own static credential. Public Woo REST requires the adapter certificate, including query-form REST routes. The public storefront and COD checkout remain accessible through Ingress.

## Model opt-in and verification


Run the release acceptance commands in `docs/release/TEST_EVIDENCE.md`. The clean installer is destructive only to the **new named temporary cluster it creates**; it refuses takeover, retains the primary kubeconfig and removes its temporary private fixtures. Historical failed attempts and their repairs remain evidence.
