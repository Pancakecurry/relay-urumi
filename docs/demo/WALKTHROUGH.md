# Relay technical demonstration

This walkthrough exercises the implemented application. Use synthetic data and capture live product/order identifiers. Runtime credentials belong in local private configuration; do not include them in screenshots or recordings.

## Preparation

Follow [the release installation runbook](../runbooks/release-install.md). Configure explicit project-CA trust for local HTTPS. Confirm the cluster and application are ready:

```sh
export PATH="$PWD/.tools/bin:$PATH"
export KUBECONFIG="$PWD/.local/kubeconfig"
bash scripts/cluster-status.sh
kubectl get pods -A
helm list -A
```

Use separate browser profiles for an administrator and a member. Create the initial administrator through the documented bootstrap; use a real invitation to join the second identity. The model is optional at startup and requires a valid provider Secret and an explicitly configured durable request budget. Never reset reservations to make a demonstration fit.

| Surface | Local URL |
|---|---|
| Console | `https://relay.localhost:18443/` |
| Gateway | `https://relay.localhost:18443/mcp` |
| Storefront | `https://store.relay.localhost:18443/shop/` |
| Woo administration | `https://store.relay.localhost:18443/wp-admin/` |

## Administrator: store and chat

1. Sign in and open the overview. Inspect actual upstream status, gateway relationships and recent activity.
2. Open the MCP workspace. Confirm WooCommerce, Calendar and Decimal Totals are registered; inspect their tools, schemas and deterministic aliases.
3. Open Team and invite the member. Complete acceptance under the separate member identity.
4. In Agent workspace, request a clearly named synthetic product with an explicit price and a unique SKU. Inspect the real gateway tool arguments, result and audit attribution.
5. Open the returned product on the storefront. Add it to the cart, proceed to checkout, choose Cash on delivery and place the synthetic order.
6. Capture the live order ID. Verify it in Woo administration under Orders.
7. Ask the agent for today's orders in Asia/Kolkata. Inspect Calendar's UTC day boundaries and the WooCommerce result containing the live order.

These actions prove real model-selected calls through the authenticated gateway, a real WooCommerce write, storefront checkout and correctly scoped date handling. The execution inspector displays actual events; it is not the planned advanced Flight Recorder.

## Member: independent MCP access

1. Sign in with the separate member account and generate a personal key under API keys. Copy it once privately, then close the reveal dialog.
2. Configure an independent MCP client with only the gateway URL and the member's Bearer key. Local DNS/CA trust is a transport prerequisite; upstream credentials are never required.
3. Discover the enabled tool catalog and retrieve the live order through the WooCommerce alias.
4. Run a genuine model-backed prompt combining Calendar with WooCommerce or WooCommerce with Decimal Totals. Inspect each actual tool result and confirm member attribution in Audit.

See [external client configuration](../runbooks/external-clients.md) for tested official SDK, Inspector and OAuth paths. Only claim the client actually used; reference-host tests do not establish universal branded-client support.

## Enforcement and failure isolation

- Revoke the member key, then verify its next request fails. Issue a new key for later work; never reactivate the revoked key.
- Disable an upstream in the MCP workspace. Refresh discovery and verify its tools disappear. A call using a cached alias must also be rejected.
- In an isolated test window, stop one upstream and confirm the dashboard reports it unreachable while another upstream remains callable. Restore it before continuing.
- Inspect Audit for actor, original server/tool, timestamp, duration and success/failure/rejection. Confirm no upstream credentials appear in discovery, errors or results.
- Restrict a server/tool for the member, then verify discovery, direct calls, search and chat consistently hide or reject it. Restore the intended demonstration policy afterward.

Controlled outages and destructive test scripts require deliberate operator use. The [test evidence index](../release/TEST_EVIDENCE.md) lists the actual acceptance scripts; do not run every historical script indiscriminately.

## Multi-store orchestration

1. Create two clearly labelled disposable stores from the Store Orchestration workspace.
2. Observe real Requested → namespace/resources → Helm → database → WooCommerce → MCP registration → Ready progress. Inspect actual topology and diagnostics.
3. Verify separate namespaces, databases, PVCs, Secrets, quotas, limits, Ingress and private adapters. Inspect the distinct gateway tool aliases.
4. Place a synthetic COD order in each storefront and compare real orders through the chat agent.
5. Verify retry/idempotency and recovery with the documented controlled interruption test. Do not substitute a simulated progress sequence.
6. Delete only the named disposable stores through the confirmation flow. Wait for verified cleanup; namespace, volumes, credentials and gateway tools must be absent before claiming deletion complete.

The recorded regression preserves the original store and retained non-disposable data. Never delete an existing store just to reset a recording.

## Infrastructure and tradeoffs

Show the three Helm charts, explicit image pins, probes, resource limits, PVC/Secret references, deny-default networking and restricted service accounts. Explain gateway aliasing and independent upstream timeouts using actual traces.

[System design](../SYSTEM_DESIGN.md) and [the threat model](../THREAT_MODEL.md) describe the implemented boundaries. [Production-like deployment](../runbooks/production-like.md) uses the same templates with values overrides for DNS, TLS, storage and Secrets. This is a documented deployment path, not verified VPS hosting. [Upgrade/rollback](../runbooks/upgrade-rollback.md) explains database and persistent-data caveats; Helm rollback does not undo orders or migrations.

The local system is a single-node assessment deployment. Do not claim high availability, unmeasured throughput, a public cloud URL, or future roadmap features.
