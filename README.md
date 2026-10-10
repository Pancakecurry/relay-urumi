# Relay

Urumi AI FDE Internship implementation repository. **M1: persistent WordPress/WooCommerce store is implemented and locally tested**, alongside the preserved M0 real Kubernetes/MCP proof. This is not yet the completed platform.

Use [store setup/access/checkout](docs/runbooks/local-store.md), [M1 acceptance report](docs/evidence/m1.md), [architecture](docs/architecture/overview.md), [exact versions](docs/versions.md) and [requirement ledger](docs/REQUIREMENTS.md). A fresh environment first follows the [M0 cluster/tool setup](docs/runbooks/local-m0.md).

Local storefront: <http://store.relay.localhost:18080/shop/>. Administration: <http://store.relay.localhost:18080/wp-admin/>. Admin credentials live only in the ignored private `.local/relay-store-m1-credentials.json`; the runbook explains access. Never commit or print that file.

```sh
pnpm store:deploy
pnpm store:checkout
pnpm store:persistence
pnpm store:status
```

The real store runs entirely in Kubernetes with dedicated MariaDB/content PVCs, Secret inputs, probes/resources, an idempotent Helm bootstrap and clearly synthetic COD products. Browser acceptance matches order 17 in REST and administration before/after both runtime pod replacements. Repeated bootstrap preserves product/admin/key identities. The separate clean-install release is scaled to zero after testing; its data is retained.

All mandatory core → multi-store → nine differentiators → product expansion remain planned. The handwritten adapter, gateway aggregation, React dashboard, team keys/audit and product chat await later milestones. M1 stops here for owner review; M2 requires authorization. The original `m0-verified` and `m0-model-verified` checkpoints remain available.

Local chart execution is tested; production values are render-only examples. Single-writer/node-local storage is not HA, and the official image entrypoints require root initialization. Read ADR 0006 for these constraints and the corrected credential-prompt incident. No cloud provisioning, publication or submission occurred.

The bounded M0 Gemini spike already consumed its two-request ledger and must not be automatically repeated. M1 sends no provider traffic and makes no new purchases. Preserve unrelated machine resources and keep private hiring correspondence/account metadata outside this repository.
