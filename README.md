# Relay

Relay hosts WooCommerce on Kubernetes and gives a team one MCP endpoint for store operations, Calendar and Decimal Totals. The React control room manages integrations, identities, personal keys, permissions, audits, real Gemini tool runs and isolated store provisioning.

This assessment release covers **M0–M6**. Current verification and remaining gates are in [release status](docs/release/STATUS.md), the [requirement ledger](docs/REQUIREMENTS.md) and [feature inventory](docs/release/FEATURE_INVENTORY.md). M7–M9 and C1–C10 remain the [longer-term roadmap](docs/release/ROADMAP.md). A local test is not a VPS deployment, uploaded video or submission.

## Architecture and stack

Browser → Traefik → React/API or `/mcp` gateway → private handwritten MCP upstream → WooCommerce REST → MariaDB. PostgreSQL owns identity, registry, policies, audits, chat and desired store state. BullMQ/Redis dispatch work; the provisioner reconciles PostgreSQL state into isolated Helm releases. Chat discovers and executes through the gateway as the signed-in user.

Pinned Node 24, pnpm 11, strict TypeScript, Fastify, official MCP SDK v 2, React/Vite/TanStack Query, Better Auth native OAuth, Drizzle/PostgreSQL, Redis/BullMQ, Helm/k3d/k3s, WordPress/WooCommerce/MariaDB and cert-manager. Exact resolved versions and image identities: [versions](docs/versions.md), lockfile and [M6 images](docs/evidence/m6/images.txt).

Read [system design and tradeoffs](docs/SYSTEM_DESIGN.md), [threat model](docs/THREAT_MODEL.md) and the detailed [architecture/ADRs](docs/architecture/overview.md).

## Prerequisites

The verified workstation is Apple Silicon/macOS with 16GiB RAM, Docker Desktop and an owned 4GiB k3d server container. Keep ample disk headroom; a clean second cluster temporarily needs additional RAM/disk. Inspect first:

```sh
node scripts/environment.mjs
```

Install the exact Node/pnpm/Kubernetes/Helm/k3d versions recorded in `docs/versions.md` from their official distributions. Chrome is used by the browser acceptance tests. Runtime/dependency downloads live outside synced Documents through `scripts/local-cache.mjs`. No paid cloud or software is required. Model traffic requires an explicitly approved eligible-credit allowance; no key is included.

## Local setup and safe deployment

For the full current sequence use [the release installation runbook](docs/runbooks/release-install.md). Historical M0–M5 runbooks are preserved as dated implementation evidence; do not mix their HTTP-only deployment commands into the M6 TLS deployment.

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
pnpm check
export PATH="$PWD/.tools/bin:$PATH"
export KUBECONFIG="$PWD/.local/kubeconfig"
bash scripts/cluster-setup.sh
```

The release runbook continues with ownership-checked Secret generation, reviewed images, PKI, data TLS, migrations, original store, three upstreams and platform Helm installation. Every generated credential stays in ignored `.local` and Kubernetes Secrets. Never copy a private backup into Git. Do not reuse this repository's synthetic test credentials for public deployment.

## Access

| Surface | Current local URL |
|---|---|
| Dashboard | `https://relay.localhost:18443/` |
| Single gateway | `https://relay.localhost:18443/mcp` |
| Storefront | `https://store.relay.localhost:18443/shop/` |
| Woo administration | `https://store.relay.localhost:18443/wp-admin/` |

The hosts select real Ingress routes; ports bind to loopback. Local TLS uses an explicitly scoped project CA, not a public certificate. Tests load `.local/relay-ca.crt`; browser automation pins the project leaf. No OS-wide trust root is installed. A normal browser requires the owner's chosen trust configuration; do not disable verification or click through a warning as a deployment procedure. Upstreams and databases have no public route.

Create an owner through the documented bootstrap, then invite the second user in **Team**. In **API keys**, a member can generate a personal key, copy it once privately and revoke it. Reviewers should create their own identities and credentials.

## Checkout, chat and external clients

Open a synthetic product, **Add to cart** → **View cart** → **Proceed to checkout**. Use clearly synthetic details, **Cash on delivery**, then **Place order**. Capture the live order ID and verify it under Woo administration → Orders. This is test data; no payment or shipment is arranged.

In **Agent workspace**, request a named product with price and a unique SKU, inspect the actual tool arguments/results, and verify the product on the storefront. After checkout ask for today's orders in Asia/Kolkata. Calendar returns UTC day bounds; WooCommerce returns actual paginated orders. Each result links to a durable audit under the logged-in user's identity. A run is bounded to four model steps/eight tool executions; failures and ambiguous writes are visible.

An external MCP host needs the gateway URL and its user's Bearer key, plus ordinary local DNS/CA trust. It never receives upstream credentials. See [external clients](docs/runbooks/external-clients.md) for the tested official client, independent Inspector and native OAuth flow. Admin-managed OAuth public clients use exact loopback callbacks, S256 PKCE and signed browser consent. Open dynamic registration is intentionally disabled.

## Verification

```sh
pnpm check
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
export RELAY_TEST_ORIGIN=https://relay.localhost:18443
node scripts/run-acceptance.mjs scripts/security-permissions.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-client.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-negative.mjs
node scripts/run-acceptance.mjs scripts/security-console-ui.mjs
```

Use [test evidence](docs/release/TEST_EVIDENCE.md) for the exact complete release sequence and results. Tests with destructive synthetic-store cleanup, controlled outages or paid model calls must be run deliberately; do not run all historical scripts blindly. Historical scripts may require their original fixtures and transport profile. `run-acceptance.mjs` keeps raw failure diagnostics private because browser errors can include filled forms.

The committed-source clean installer exports Git into a fresh nonsynced directory, installs offline with the frozen lockfile, checks/builds, creates an independent cluster with new credentials, exercises real services and removes only that temporary cluster. It preserves the working deployment and never copies the model key.

## k3s deployment, upgrades and limitations

[Production-like deployment](docs/runbooks/production-like.md) explains the **same chart templates** with environment overrides for domains, images, storage, API CIDR, TLS and Secrets. Production values are render-tested examples; no VPS is claimed. [Upgrade/rollback](docs/runbooks/upgrade-rollback.md) covers release history, persistence and database compatibility caveats. A Helm rollback does not undo an order, database migration or volume deletion.

This is a single-node assessment system, not HA or a hostile-workload sandbox. Native database/cache/PHP clients need controlled reload after leaf renewal; Node HTTPS servers reload projected leaves. Root-CA rotation, automated backups/PITR, arbitrary image hosting, broad scaling and full observability are roadmap work. Upstream descriptions/results remain untrusted; redaction cannot prevent arbitrary covert encoding. Model reservations are conservative authorization limits, not an invoice.

## Demonstration and release status

The [technical walkthrough](docs/demo/WALKTHROUGH.md) covers the two-user store, gateway, chat, failure and provisioning journeys. See [release status](docs/release/STATUS.md), [test evidence](docs/release/TEST_EVIDENCE.md) and [feature inventory](docs/release/FEATURE_INVENTORY.md) for actual results and limitations.

The application is verified locally. Public cloud hosting and a complete uploaded demonstration video are not claimed. M7–M9 and C1–C10 remain roadmap work.

## Evidence publication

Historical test logs retain real commands and outcomes. Workstation paths are replaced with `[PROJECT_ROOT]` or `[LOCAL_HOME]`; private account/approval metadata is omitted. The application source and pinned dependency configuration are preserved. Historical source IDs can be mapped through [the publication source map](docs/evidence/publication/source-map.json). Public commit hashes changed when private material was removed from history; commit dates, generic authorship and genuine progress were retained.
