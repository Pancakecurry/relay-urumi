# Production-like k3s portability

K03 covers deployable charts/configuration; D01 covers an actual VPS. No cloud account, DNS record, VPS, registry publication or certificate was provisioned. Genuine free capacity/public domain remains unresolved under ₹0 new spend. Keep D01/M9 pending.

Use the same charts as local: store, hosted-mcp and platform. The committed prod values are explicit example domains/API IP, not working public endpoints. A real operator must provide the owned hostnames, exact reachable Kubernetes API /32, storage class/capacity and immutable published image digests. The store adapter's canonical URL must exactly match WordPress site.url, including scheme/port, for OAuth signature verification.

```sh
helm lint charts/store -f infra/prod/store-values.example.yaml
helm lint charts/hosted-mcp -f infra/prod/mcp-values.example.yaml
helm lint charts/platform -f infra/prod/platform-values.yaml
helm upgrade --install relay-core charts/platform -n relay-platform -f infra/prod/platform-values.yaml \
  --set-string platformImage=<authorized-registry/image@digest> \
  --set-string platformHost=<owned-console-domain> \
  --set-string publicOrigin=http://<owned-console-domain> \
  --set-string storefrontUrl=http://<owned-store-domain>/shop/ \
  --set-string kubeApiCidr=<actual-api-ip>/32 \
  --wait --wait-for-jobs
```

Prepare encrypted-at-rest Kubernetes Secrets privately following the local platform/store runbooks; do not put values in Helm values or command arguments. The base values consistently use HTTP for a private k3s lab, matching the validated internal REST/OAuth path. To enable public HTTPS at M9, set platformTlsSecret for both console and API/MCP Ingress and ingress.tlsSecret for Store; match site.url/publicOrigin, use a CA-verified HTTPS adapter connection and allow that exact route in its egress policy. Do not mix an HTTPS WordPress URL with an HTTP canonical adapter URL. Provisioning cert-manager/public TLS remains M9 and requires actual free/owned DNS plus owner approval; a rendered TLS reference does not prove a certificate.

Default modelEnabled=false; model enabling requires eligible credit verification and preserved consumed ledger. Production HTTPS determines cookie Secure/allowed Origin. Keep dashboards/clients on that single approved origin. Dynamic upstream policy permits reviewed destinations only; no wildcard arbitrary Internet registration. No database/upstream public ingress.

The current local-path/RWO/single-replica store and data services are not HA. Native arm64 has been executed; amd64/multi-node/public routing remain unverified M9 work. Additive migrations run under a separate owner role before applications; do not blindly Helm-roll back a database. Backup/restore and compatible rollback gates are preserved for M9.
