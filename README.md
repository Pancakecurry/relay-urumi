# Relay

Urumi AI FDE Internship implementation repository. **M3: the durable gateway, identity, registry and audit backend is implemented and locally tested**, with the persistent store, three private MCP upstreams and M0 transport proof preserved. This is not yet the completed platform.

Use [store setup/access/checkout](docs/runbooks/local-store.md), [M1 acceptance report](docs/evidence/m1.md), [architecture](docs/architecture/overview.md), [exact versions](docs/versions.md) and [requirement ledger](docs/REQUIREMENTS.md). A fresh environment first follows the [M0 cluster/tool setup](docs/runbooks/local-m0.md).

Local storefront: <http://store.relay.localhost:18080/shop/>. Administration: <http://store.relay.localhost:18080/wp-admin/>. Admin credentials live only in the ignored private `.local/relay-store-m1-credentials.json`; the runbook explains access. Never commit or print that file.

```sh
pnpm store:deploy
pnpm store:checkout
pnpm store:persistence
pnpm store:status
```

The real store runs entirely in Kubernetes with dedicated MariaDB/content PVCs, Secret inputs, probes/resources, an idempotent Helm bootstrap and clearly synthetic COD products. Browser acceptance matches order 17 in REST and administration before/after both runtime pod replacements. Repeated bootstrap preserves product/admin/key identities. The separate clean-install release is scaled to zero after testing; its data is retained.

All mandatory core → multi-store → nine differentiators → product expansion remain planned. The handwritten adapter plus Calendar and Decimal Totals are implemented. Gateway aggregation and team keys/audit are implemented in M3. React dashboard and product chat await M4. Stop after the M3 checkpoint; further milestones require owner direction. The original `m0-verified` and `m0-model-verified` checkpoints remain available.

Local chart execution is tested; production values are render-only examples. Single-writer/node-local storage is not HA, and the official image entrypoints require root initialization. Read ADR 0006 for these constraints and the corrected credential-prompt incident. No cloud provisioning, publication or submission occurred.

The bounded M0 Gemini spike already consumed its two-request ledger and must not be automatically repeated. M1–M3 send no provider traffic and make no new purchases. Preserve unrelated machine resources and keep private hiring correspondence/account metadata outside this repository.

M2 provides five real Woo operations plus shared info, Calendar now/day_range and exact Decimal Totals. Use [upstream setup/testing](docs/runbooks/mcp-upstreams.md) and [M2 evidence](docs/evidence/m2.md). Run pnpm mcp:deploy, pnpm mcp:acceptance and pnpm mcp:network after M1. All three upstreams remain ClusterIP-only; the M3 gateway now connects using server-owned credentials. The M2 in-cluster acceptance fixture is privileged; M3 additionally verifies real external clients with personal user keys.

### M3: durable platform backend

The separate API/gateway, PostgreSQL identity/registry/audit storage and shared Redis admission limits are implemented. Three private upstreams aggregate through `http://relay.localhost:18080/mcp`; CLI clients may use the tested `http://localhost:18080/mcp` alias with a personal key. Upstream credentials are server-owned Kubernetes Secret references. Browser management uses Better Auth sessions. The React dashboard and real product chat remain M4.

See [platform setup/management/client runbook](docs/runbooks/local-platform.md), [durable gateway decision](docs/decisions/0008-durable-gateway.md), and [actual M3 acceptance](docs/evidence/m3.md). Keep all original full-plan scope and future requirements; this milestone does not claim OAuth, VPS, final demo or optional completion.
