# Relay core console and model setup

Use Node 24.16.0 and pnpm 11.25.0. Existing Docker Desktop is required; inspect resources first. Scripts target the dedicated `.local/kubeconfig`, never the default context. Preserve existing private backups and data. A fresh checkout has no credentials.

## Fresh local core

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
node scripts/bootstrap-tools.mjs
bash scripts/cluster-setup.sh
pnpm store:deploy
pnpm mcp:deploy
pnpm platform:deploy
pnpm console:bootstrap
```

The same platform image contains the API, gateway and static React application; separate deployments/processes enforce their boundaries. `platform:deploy` deploys the console with model traffic disabled. Local deployment scripts discover the owned node's API IP instead of assuming a Docker bridge address. All mandatory runtime workloads live in Kubernetes. Operator bootstrap is idempotent and registers WooCommerce/Calendar/Totals for its workspace before use. Arbitrary new teams do not inherit store credentials; that would breach tenant boundaries. Automatic store provisioning belongs to M5.

Open http://relay.localhost:18080. Sign in using the ignored, mode-0600 `.local/console-owner.json`, viewed privately. Storefront: http://store.relay.localhost:18080/shop/; admin access follows the store runbook. No passwords appear in this document or console output.

## Enable the permitted model


```sh
pnpm console:deploy
```

The model is Gemini 3.5 Flash-Lite through AI SDK's direct Google adapter. Request caps: 32,768 bytes, 1,536 total output tokens, one candidate, four steps/eight serial tools, no paid grounding, no retries. PostgreSQL serializes an irreversible reservation before each provider request; M4's ceiling is ₹99 in addition to M0's ₹100. Seven initial ₹9 reservations remain intact; future requests reserve ₹5, above the verified ₹4.10 conservative maximum. Provider usage is recorded, but this is not an account-wide billing limit or a verified invoice. The remaining allowance appears in the UI; budget exhaustion can stop a run after earlier tools. Inspect executions/audit before retrying a mutation. Do not top up, enable overage, reset consumption or copy the key into a fresh empty ledger. Restore the consumed model ledger when restoring a model-enabled installation.

## Two users and external hosts

Admin creates an invitation bound to the member's email; share its reveal-once token manually. The member signs up/signs in with that email and accepts it at onboarding or Settings. No SMTP delivery is claimed. Members can generate/revoke their own hashed personal keys; admins may issue/revoke for an active member. Closing the reveal dialog hides the key permanently.

An external MCP host needs only `http://relay.localhost:18080/mcp` (or tested localhost alias) and `Authorization: Bearer <personal key>`. Keep its config private. Use Streamable HTTP, refresh tools after registry changes, and inspect original server/tool names alongside immutable aliases. No upstream URLs/tokens or browser cookie belong in that client.

`console-inspector.mjs` demonstrates the pinned independent Inspector host. `external-agent.mjs` is an explicitly named Relay external CLI model host, not a claim to have run Claude/Cursor/Gemini CLI. It uses the same bounded provider implementation outside Kubernetes and B's personal key for all MCP requests. The operator supplies the model Secret and shared PostgreSQL reservation control separately from B's MCP configuration. It performs no upstream bypass. It refuses silent reruns when evidence exists.

## Acceptance commands

Run suites sequentially; failure tests deliberately alter only owned resources and restore replicas/enabled state.

```sh
pnpm console:regression
pnpm console:browser
node scripts/console-chat-journey.mjs create
# Use the SKU printed by the successful creation run; this creates a genuine new COD order.
STORE_PRODUCT_SKU=<actual SKU> STORE_EVIDENCE_DIR=docs/evidence/m4 node tests/store/checkout.mjs
node scripts/console-chat-journey.mjs orders
node scripts/external-agent.mjs
node scripts/console-inspector.mjs
node scripts/console-operations.mjs
node scripts/console-security.mjs
node scripts/console-network.mjs
node scripts/console-inventory.mjs
```

Browser acceptance creates isolated synthetic users and saves credentials only to `.local/m4-acceptance-identity.json`. Never record the one-time-key dialog. Real chat runs are retained and reused instead of automatically repeating paid requests or ambiguous writes. Rehearsals must check current budget first. Operations eventually revoke the retained B key; further Inspector runs require a fresh self-issued key. Do not rerun the signup harness mid-journey because it changes the synthetic identities.

`console-clean-install.mjs` exports the exact committed tree, installs with the frozen lockfile in a new nonsynced directory and creates a separate temporary cluster on loopback 19080. It proves empty PVC/bootstrap, two real browser users, checkout/admin, and real three-upstream MCP calls with paid traffic disabled. Only this newly created disposable cluster is removed afterward. It does not remove the original core, unrelated containers, images or volumes. Sufficient disk/memory are checked first; any failure is recorded rather than inferred from healthy pods.

## Limitations and recovery

Local HTTP is loopback-only; browser cookies are HttpOnly/SameSite, with Secure under production HTTPS. Internal HTTP is restricted but unencrypted. The WordPress/MariaDB upstream image constraints remain in ADR 0006. Read-only/non-root API/gateway/dashboard/utility pods have separate Secret and egress boundaries.

Chat runs/events survive restarts. A process interruption can leave an incomplete run; the next run marks stale work unknown. Do not retry writes until store/audit reconciliation. Cancellation targets the current API process; cross-replica cancellation/recovery is M8. Runs are independent durable turns; automatic long-term conversation memory and C1 Flight Recorder are not claimed.
