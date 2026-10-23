# Reproduce M0 locally

Prerequisites: macOS arm64, Docker running with adequate memory/disk, Node 24.16.0 and pnpm 11.25.0. Existing pnpm 11.25.0 may run under Node 24.19.0; both patches are recorded. Other OS/architecture bootstrap paths are not tested yet. No root installation, paid infrastructure or personal-resource cleanup is required.

From the repository root:

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
node scripts/bootstrap-tools.mjs
pnpm env:inspect
pnpm check
pnpm cluster:setup
pnpm proof:deploy
pnpm proof:client
node scripts/inspector-proof.mjs
node scripts/cluster-capabilities.mjs
pnpm cluster:status
```

The cache preparation creates ignored `.tools/` and `node_modules/` symlinks into a project-specific non-synced cache. This avoids observed macOS file-provider executable rehydration/signature failures in Documents; it changes no system security policy and refuses to overwrite existing directories. The tool bootstrap fetches pinned official k3d/Helm/kubectl binaries and checks their official SHA-256 files. It does not replace global tools. Setup creates only `relay-m0`; repeat setup preserves that cluster. It waits for the node and the asynchronously installed Traefik Deployment. The kubeconfig and random M0 credential stay in ignored `.local/` with restricted permissions.

The exact endpoint is `http://127.0.0.1:18080/mcp`. No hosts-file edit, public DNS or external network is required for this local client path. The host port binds to loopback. Health routes remain internal; Ingress exposes only `/mcp`. Credential values never belong in command arguments, examples, Helm values or evidence.

The Kubernetes administration port also binds to loopback, on a randomly assigned host port for a fresh cluster. Setup refuses an existing cluster whose API/Ingress bindings expose other interfaces. The current M0 cluster's original default all-interface API mapping was repaired using k3d's dedicated load-balancer edit, without replacing the k3s node or its storage; see `docs/evidence/api-binding-repair.txt`. Do not apply that historical port number to another installation.

Inspector reads a private generated configuration and exercises the real bearer header, catalog and tool call. The capability script creates only labelled temporary client/writer/reader pods in `relay-m0`, removes those pods, and retains a 16 MiB test PVC. It refuses to overwrite same-named resources without its ownership label. It verifies storage after pod replacement, rather than treating PVC `Bound` as sufficient evidence.

`proof-deploy` builds the exact-image proof, imports it into the dedicated cluster, creates/updates the test Secret without printing its manifest, and installs the platform chart. Credentials survive repeat deploys because the local key file and Secret reference are reused. This script is M0-specific; later app release packaging is a separate milestone.

If something fails, inspect `pnpm check`, the dedicated cluster’s pods/events and the proof’s logs. Do not delete unrelated Docker resources to recover storage. Neither uninstall nor cluster deletion is part of these reproduction commands.

Additional acceptance scripts and actual output paths are listed in [M0 report](../evidence/m0.md). Production example values are unverified and cannot yet deploy the full assessment.
