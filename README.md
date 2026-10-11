# Relay

Relay is a Kubernetes-native WooCommerce platform with a team-authenticated MCP gateway and an inspectable real-model console. M0–M4 are verified locally. Gate A passes the real two-user core journey and exact committed-source empty-cluster installation. Public deployment and complete-product completion are not claimed. Full multi-store, nine differentiator areas and C1–C10 product scope remain active for later milestones.

Open the [console](http://relay.localhost:18080/), [synthetic storefront](http://store.relay.localhost:18080/shop/) and [WooCommerce administration](http://store.relay.localhost:18080/wp-admin/). They run inside the owned local Kubernetes cluster, exposed only through loopback Ingress. Operator identity and store credentials are in ignored private `.local` files; never display or commit their contents.

Start with the [complete local console runbook](docs/runbooks/local-console.md). Read [M4 evidence](docs/evidence/m4.md), [design review](docs/design/REVIEW.md), [requirement ledger](docs/REQUIREMENTS.md), [architecture](docs/architecture/overview.md), [versions](docs/versions.md) and [two-user demo](docs/demo/DEMO_SCRIPT.md). Fresh machine tooling and cluster setup use [M0](docs/runbooks/local-m0.md). Store setup uses [M1](docs/runbooks/local-store.md); upstreams use [M2](docs/runbooks/mcp-upstreams.md); backend identity/security details use [M3](docs/runbooks/local-platform.md).

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm store:deploy
pnpm mcp:deploy
pnpm console:deploy
pnpm console:bootstrap
```

Follow the runbook for prerequisite Secret generation, image imports, private identity storage and safe model opt-in. The bootstrap does not give arbitrary new users the operator's store credentials. A personal MCP client needs only `http://relay.localhost:18080/mcp` and its own Bearer key.

The console provides real upstream management, permission-filtered tools/schema inspection, invitations/member controls, reveal-once personal keys, audit records and durable owner-scoped chat runs. Chat discovery and calls use the gateway with the session-derived user's identity. The execution inspector shows actual arguments/results, durations, provider events and audit correlation; it is the M4 inspector, not the future complete C1 Flight Recorder.

The recorded Gemini journey created product 42, **Urumi Demo Mug / ₹199.00**, checked out COD order 43, and returned that order in the actual Asia/Kolkata today-orders page. A separate B external CLI model host used Calendar and WooCommerce in one prompt. Independent MCP Inspector compatibility is recorded separately. Disabled tools, pod outages, inactive memberships and revoked keys were tested against real services; there are no simulated production tool results.


Only local native arm64 execution is verified. [Production-like k3s values](docs/runbooks/production-core.md) are linted/rendered configuration; there is no actual VPS deployment, public TLS, amd64 proof or publication. Node-local persistent volumes are not HA. WordPress/MariaDB entrypoint constraints are recorded in ADR 0006. OAuth, store lifecycle automation, advanced Flight Recorder, scaling and disaster recovery remain later milestones. Final video/submission are M10 and were not performed.

No unrelated personal files, Docker images/volumes, clusters or repositories were removed during the authorized cache cleanup. Preserve `m0-verified`, `m0-model-verified`, `m1-verified`, `m2-verified` and `m3-verified` checkpoints while extending the product.
