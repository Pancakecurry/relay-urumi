# Release verification index — October 22, 2026

The application passes locally on actual Kubernetes, WooCommerce, MCP, browser and model services. This is not a public-VPS, full narrated video or submitted-form claim. Reports contain timestamps; historical failures and repairs are preserved rather than relabelled as successes.

## Final application acceptance

[final-gate.json](../evidence/m10/final-gate.json) aggregates 27 actual reports and verifies the live original data, replicas, deployed fingerprints, store deletion and bounded provider allowance. It records 42 passing tests plus lint, strict types and production build. The original store retains orders 17, 43 and 53 and chat-created product 52. These are observed test IDs, not values to invent in a new demo.

| Gate | Actual result and evidence |
|---|---|
| Fresh installation | [clean-install.json](../evidence/m6/clean-install.json): exact committed source `2cdd17ae04100e6a83cccc6bdfbdeeeba773d7c5`, frozen offline dependency installation, 42 tests/build, independent empty cluster, fresh identities/Secrets, nine migrations, modern/legacy MCP, real HTTPS checkout/admin/persistence and external browser OAuth; provider disabled; temporary owned cluster removed |
| A real model product | [chat-create.json](../evidence/m10/chat-create.json): real product 52 through signed-in A → agent → gateway → handwritten Woo adapter; storefront confirmed |
| Checkout and persistence | [store/checkout.json](../evidence/m10/store/checkout.json), [persistence.json](../evidence/m10/store/persistence.json): real COD order 53, Woo administration, both store pods replaced, data/content/PVC identities survive |
| A today's orders | [chat-orders.json](../evidence/m10/chat-orders.json): actual Calendar bounds and Woo tools return the new order; durable A audit attribution |
| B external clients | [inspector.json](../evidence/m10/inspector.json): independent MCP Inspector 2.10.1 through verified HTTPS; actual order 53. [external-agent.json](../evidence/m10/external-agent.json): B self-issued key, actual model host, seven real calls across Calendar, both new stores and Decimal Totals; B/key audits |
| Failure and controls | [controls.json](../evidence/m10/controls.json): role denial, server disabling and cached alias rejection, real pod deletion and sustained outage, healthy-server independence, unreachable UI, next-call key revocation, audit and credential non-disclosure |
| Multi-store bonus | [managed-stores.json](../evidence/m10/managed-stores.json): concurrent dashboard creation, real worker restart, idempotency, owner cap, distinct tools, all five Woo operations, real COD/persistence in both stores; [network.json](../evidence/m10/network.json): actual isolation; [secure-teardown.json](../evidence/m10/secure-teardown.json): verified removal of both owned stores, namespace/PV/local-path/vault/routes; original and Boreal preserved |
| Permissions | [permissions.json](../evidence/m6/permissions.json): 10 groups; [permission-replicas.json](../evidence/m6/permission-replicas.json): 4 groups on two real replicas; [management-freshness.json](../evidence/m6/management-freshness.json): endpoint/credential binding and queued demotion rejection; [permissions-ui.json](../evidence/m6/permissions-ui.json): real permission editor and restricted views |
| OAuth | [oauth-client.json](../evidence/m6/oauth-client.json): 5 real browser/SDK groups; [oauth-security.json](../evidence/m6/oauth-security.json): 12 groups including natural 300-second expiry; [oauth-concurrency.json](../evidence/m6/oauth-concurrency.json): 5 two-replica race/refresh/replay/revoke/lock groups |
| Credential vault | [vault.json](../evidence/m6/vault.json): 5 current encryption/tamper/binding groups; [vault-rotation.json](../evidence/m6/vault-rotation.json): 4 actual historical rotation groups, dated October 15, not a newly performed rotation |
| Hostile peers and Kubernetes | [malicious-upstreams.json](../evidence/m6/malicious-upstreams.json): 14 groups; [admission.json](../evidence/m6/admission.json): 16 admission/RBAC/certificate groups; [secret-at-rest.json](../evidence/m6/secret-at-rest.json): native K3s encrypted datastore sentinel verified and removed |
| Verified TLS | [data-tls.json](../evidence/m6/data-tls.json): native PostgreSQL role certificates/Redis negatives; [tls-peers.json](../evidence/m10/tls-peers.json) and [identity-reload.json](../evidence/m10/identity-reload.json): actual peer serials match renewed Secrets after controlled reload; six existing PVC identities preserved |
| Current core regression | [core/regression.json](../evidence/m10/core/regression.json): 5 groups; [core/security.json](../evidence/m10/core/security.json): 6 groups |
| UI/formatting | [console-ui.json](../evidence/m6/console-ui.json): all nine routes at 1440/768/390 widths, 31 captured states, no overflow/browser errors, keyboard and reduced motion; seven permission-flow captures; M10 chat, concurrent provisioning, disable/outage and mobile deletion screenshots in [visual/](../evidence/m10/visual/) |

The original [M0](../evidence/M0_REPORT.md), [M1](../evidence/m1.md), [M2](../evidence/m2.md), [M3](../evidence/m3.md), [M4](../evidence/m4.md) and [M5](../evidence/m5.md) records preserve earlier milestone acceptance, including the broader ten-boundary provisioning restart/queue-loss/failure matrix. M10 repeats the present lifecycle rather than overwriting earlier dated evidence.

## Reproduction commands and side effects

Run from the repository root using pinned tools. The guarded acceptance runner keeps raw diagnostics private; review the safe error and repair the cause before retrying. Several scripts mutate synthetic identities, revoke keys, create/delete owned stores or deliberately interrupt services. Model scripts spend approved credit. Do not run all scripts concurrently against a demonstration.

```sh
export PATH="$PWD/.tools/bin:$PATH"
export KUBECONFIG="$PWD/.local/kubeconfig"
export RELAY_TEST_ORIGIN=https://relay.localhost:18443
pnpm install --frozen-lockfile
pnpm check
node scripts/run-acceptance.mjs scripts/security-permissions.mjs
node scripts/run-acceptance.mjs scripts/security-permission-replicas.mjs
node scripts/run-acceptance.mjs scripts/security-management.mjs
node scripts/run-acceptance.mjs scripts/security-permissions-ui.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-client.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-negative.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-concurrency.mjs
node scripts/run-acceptance.mjs scripts/security-vault.mjs
node scripts/run-acceptance.mjs scripts/security-admission.mjs
node scripts/run-acceptance.mjs scripts/security-malicious.mjs
node scripts/run-acceptance.mjs scripts/security-data-tls.mjs
node scripts/run-acceptance.mjs scripts/security-at-rest.mjs
node scripts/run-acceptance.mjs scripts/security-console-ui.mjs
```

Use the exact available script names verified by the release-document check; setup prerequisites and special fixture dependencies are described in [M6 security](../runbooks/m6-security.md). The empty-cluster test is `security-clean-install.mjs`; the committed-source build reproduction is `security-reproduce.mjs`. Neither copies the live provider key or calls a model. The frozen install's offline result proves same-machine reproducibility with its populated cache, not that every dependency is mirrored for a disconnected reviewer.

Release journey sequence: `release-chat-journey.mjs create`, real store checkout/persistence, `release-chat-journey.mjs orders`, `release-managed-stores.mjs`, `release-external-agent.mjs`, `release-network.mjs`, `release-tls-peers.mjs`, `release-controls.mjs`, `release-store-teardown.mjs`, then `release-final-gate.mjs`. These are owned acceptance fixtures; use the recording runbook for manual demonstrations. Existing run receipts prevent repeating uncertain writes or silently spending another model request.

## Failures repaired and limits

- Native OAuth provider 1.7.7 returned four exact invalid-token revocation responses as HTTP 400. A narrow adapter normalizes only those responses to RFC 7009 HTTP 200 after native processing. Token storage remains the provider's responsibility; malformed/wrong-client errors remain rejected. Focused tests and actual repeated revocation pass.
- Fresh install initially fingerprinted the dashboard before building it and raced Traefik Deployment creation. Those harness defects were repaired; failed attempts remain recorded. The actual isolated clean installation passes.
- Certificate renewal while the machine was stopped left long-lived native peers using an older valid identity. A controlled reload and actual socket-serial check now pass. Automatic native reload and root rotation are not claimed.
- An initial chat-create assertion inspected alias suffixes instead of protocol routing metadata. The actual product write had succeeded. The existing run was inspected again without repeating the write or spending credit.
- A browser resize compositor artifact required waiting for font/layout frames before screenshots; current captures and one-heading assertions pass.
- Resource figures are samples. This single-node system is not high availability. A local private CA is not publicly trusted HTTPS. Public cloud and the complete narrated video remain separate deliverables until actually verified.

The provider allowance is a conservative durable reservation, not an invoice. The final application gate records ₹153 reserved under the ₹164 runtime cap, plus ₹100 retained M0 reservation, within ₹265 approved eligible prepaid credit. ₹11 remains for guarded runtime requests; a complete new recording requires additional approved headroom or honestly labelled existing footage.

## GitHub source verification

[github-reproduction.json](../evidence/m10/github-reproduction.json) records a fresh real GitHub clone of `effabb7d39573b42b227d14110bef88860d98c2a`, with frozen offline installation,42 tests/lint/strict types/build, documentation validation and exact deployed fingerprint. No private fixture or provider key was copied and no model request was made. [repository.json](../evidence/m10/repository.json) records the actual remote commit, visibility, real progress count and milestone tags. The latest [credential scan](../evidence/m10/credential-scan.json) checks990 files plus all historical text patches; final publication is recorded after the visibility change rather than inferred from source upload.
