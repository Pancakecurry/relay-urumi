# Private MCP upstreams — M2

Prerequisites: reviewed M0 environment/cluster setup and completed M1 store bootstrap (same chart values and credentials). Use Node 24.16.0 / pnpm 11.25.0. No model or paid service is required. A fresh clone needs `node scripts/local-cache.mjs` to prepare dependency links on this synced Documents host, then `pnpm install --frozen-lockfile`. The ordinary pnpm install also works in a nonsynced checkout. Never commit `.local`, `.tools`, tokens or `.env`.

```sh
pnpm check
pnpm mcp:deploy
pnpm mcp:acceptance
pnpm mcp:network
node scripts/mcp-inspector.mjs
node scripts/mcp-secrets.mjs
node scripts/mcp-fault.mjs
```

`mcp:deploy` creates only dedicated Relay namespaces and three Secrets with separate randomly generated tokens, builds a content-tagged pinned-base image, imports into relay-m0 and installs three releases. It refuses credential rotation/ownership conflicts. Token backup `.local/m2-upstream-tokens.json` is mode 0600; recover it if existing Secrets are present. Same `charts/hosted-mcp` templates support k3s using values overrides. The prod example is an unprovisioned HTTP lab example, not a tested public/TLS deployment. Services must stay ClusterIP with no upstream Ingress. WordPress's existing policy admits only the adapter role from its own namespace.

Internal endpoints (operator references, not public/browser endpoints):

| Server | Endpoint | Credential mounted in server |
|---|---|---|
| Woo | `http://relay-woocommerce.relay-store-m1.svc.cluster.local:3000/mcp` | woo-mcp-auth + store-adapter |
| Calendar | `http://relay-calendar.relay-upstreams.svc.cluster.local:3000/mcp` | calendar-mcp-auth |
| Totals | `http://relay-totals.relay-upstreams.svc.cluster.local:3000/mcp` | totals-mcp-auth |

The acceptance script uses operator exec and WooCommerce CRUD to seed three clearly labelled synthetic orders referencing the M1 synthetic mug. It then starts a gateway-labelled SDK client pod mounting only upstream tokens. It creates a unique-SKU synthetic product, changes the first fixture order to completed and reads it back, then restores its original status. Fixtures/products remain so outcomes can be inspected; rerunning creates distinct synthetic records deliberately, not duplicate real customer data. It never changes M1's original accepted order. The restricted adapter identity deliberately lacks order-creation permission; that test-only fixture operation is administrative, while all five MCP tools use REST. Evidence includes IDs and safe selected fields; customer data and credentials are omitted. The temporary client Secret is removed on exit. Acceptance/fault scripts safely recreate that temporary client Secret from the existing backup before each run; ordinary network/Inspector checks do not need it.

`mcp-network` proves gateway access, unlabelled and forged-role/wrong-namespace denial, permitted Woo→WordPress and denied Woo/utilities→DB/store/cross-upstream paths. Temporary test pods carry `relay.test=m2`; scripts replace only their own matching pods and never unrelated resources. Cluster administrators can bypass these boundaries; future users will have no Kubernetes access.

`mcp-inspector` temporarily binds an operator port-forward on **127.0.0.1:19091 only**, stores auth config under ignored mode-0600 `.local`, and tests initialize/catalog/info with Inspector. It closes the forward and wipes the config. This is an administrative diagnostic exception, not a public product path or proof of user authorization.

`mcp-fault` temporarily removes the owned Woo adapter egress grant to WordPress, waits for policy application, and tests the actual network rejection while utilities remain available. A separate short-lived pod runs the same adapter image with an unused inspected local pod-subnet address and a 500ms deadline to test real elapsed timeout and MCP cancellation; it returns no fabricated store data. Production adapter configuration stays at 8 seconds and its actual store origin. In `finally` it restores and compares the original policy and removes the fault pod/service/policy and client Secret. If the process/computer is killed before finally, run `pnpm mcp:deploy` to restore the Helm-managed policy, then verify `mcp:network` and a real product read. Never leave a weakened/broken policy as a workaround.

Fault/error meanings: `UPSTREAM_AUTH` requires credential reconciliation, `NOT_FOUND` is a real missing resource, `UPSTREAM_REJECTED` is a business/HTTP rejection, `TIMEOUT`/`CANCELLED`/`UPSTREAM_UNAVAILABLE` are bounded transport failures. Reads may be retryable; ambiguous writes are `unknown` and must be reconciled without blindly repeating. Raw upstream error bodies are never returned.

Supported money currencies/precision, pagination and timezone limits are documented in ADR 0007. The normal MCP route is exactly `/mcp`; `/mcp/` is intentionally rejected. Modern 2026-07-28 and legacy 2025-11-25 are tested; tools-only servers advertise no prompts/resources/subscriptions. Gateway identity/audit/policy and a model-backed external prompt belong to M3/M4; all full-plan requirements remain active.
