# Production-like k3s deployment — values-based procedure

**No actual VPS is claimed.** Local render tests and an empty k3d cluster verify chart/configuration behavior; they do not prove a provider account, public DNS, amd 64 image, backup system or internet-facing deployment. See the separate free-cloud assessment before choosing capacity. Do not create or upgrade a cloud account without approval.

## Capacity and prerequisites

Use a genuine free VM with enough memory/disk for the platform, original store, certificate manager and any demonstration stores. The verified local server has a 4GiB container limit; a 1GiB free micro VM cannot credibly run this scope. An ARM VM matches the currently tested architecture. Review all OCI image manifests before choosing amd 64; do not claim cross-architecture execution from a multiarch base image alone.

Install the pinned k3s release with secrets encryption, Traefik and a working NetworkPolicy controller. Restrict SSH and Kubernetes API access; only 80/443 belong on the public edge. Keep MariaDB, PostgreSQL, Redis and MCP upstreams as ClusterIP. Keep the admin kubeconfig root-readable and use the dedicated checkout's `.local/kubeconfig`; runtime workloads use narrow service accounts instead.

## Same charts, environment values

Use `charts/platform`, `charts/store` and `charts/hosted-mcp`, exactly as locally. `infra/prod/*` are examples, not credentials or provisioned resources. Create a reviewed private values file with:

- Public DNS names/origins, actual API endpoint CIDR and Ingress class.
- Published immutable application/store image digests built from the reviewed commit.
- Available storage class and sizes; local-path is node-local and is not a backup or replicated volume.
- `transportTls.enabled`, `dataEnabled` and `requireUpstreams` retained, with the reviewed internal CA issuer.
- HTTPS URL/port 443 settings for the console, original store and managed-store suffix. Public callback/origin/cookie behavior must match the final URLs.
- New environment-specific Secrets generated in the target cluster, never from this workstation's backups.

Install the pinned signed cert-manager release, private service CA and public trust-only Secret before the same Helm deployments described by `release-install.md`. Import images into k3s/containerd or publish to an owner-approved registry and select digests through values. `k3d image import` is only for k3d, not a VPS.

## TLS and DNS limits

The implemented issuer produces private service certificates, including localhost SANs. Do not point that issuer at ACME: internal `.svc.cluster.local`/localhost identities are not publicly issuable. Keep the internal CA separate from public edge certificates.

For a private-CA k3s lab, explicitly trust that CA in each test client. For public browser trust, provide a separately managed edge certificate through the chart's public Ingress Secret reference, without replacing internal service identities or disabling CA/SAN checks. A wildcard edge certificate must be securely distributed to each required store namespace; automatic public wildcard lifecycle/distribution for dynamically created stores has not been verified in this release. Test that separately before claiming public multi-store hosting.

Point real DNS to the VM only after firewall/TLS/authentication checks. Do not use a local tunnel and describe it as workloads deployed to a VPS. Never expose cluster API, databases or private MCP ports to compensate for networking errors.

## Deploy and validate

Use the same `helm upgrade --install` invocations with the production values overrides. Confirm migrations, readiness, resource/probe/Secret mounts, TLS peers and NetworkPolicies, then run the same actual two-user/COD/MCP/OAuth acceptance against the real DNS. Verify persistence after controlled pod replacement and restart before recording a public URL.

A complete public deployment also needs owner-reviewed backup/restore, renewal/reload scheduling, monitoring, resource quotas and a free-capacity retention plan. Native database/cache/PHP clients require controlled reload after leaf renewal; Node HTTPS servers reload leaves. Root rotation is separate.

Until that execution evidence exists, D01 remains unverified and the optional live-deployment form field should be blank. The assessment's local-to-VPS story is an explainable same-chart deployment plan, not a fabricated hosted URL.
