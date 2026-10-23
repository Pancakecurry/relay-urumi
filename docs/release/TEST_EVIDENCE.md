# Verification evidence

Results below come from actual executions. Historical failures remain recorded with their later repairs; source presence or a Running pod alone does not establish acceptance.

| Area | Evidence |
|---|---|
| Privacy-cleaned release frozen install/check/build and live gateway read | [Publication verification](../evidence/publication/verification.json) |
| Unchanged runtime source and dependencies | [Runtime integrity](../evidence/publication/runtime-integrity.json) |
| Public source/history privacy check | [Privacy check](../evidence/publication/privacy.json) |
| Aggregate local application gate, 27 reports | [Final gate](../evidence/m10/final-gate.json) |
| Independent empty-cluster installation, fresh Secrets, migrations, checkout/persistence and OAuth | [Clean installation](../evidence/m6/clean-install.json) |
| Frozen-source installation, lint, strict types, 42 tests and build | [Reproducibility](../evidence/m6/reproducibility.json) |
| Independent GitHub source reproduction | [GitHub reproduction](../evidence/m10/github-reproduction.json) |
| Real administrator chat product and today's orders | [Product creation](../evidence/m10/chat-create.json), [orders](../evidence/m10/chat-orders.json) |
| External member host using multiple actual upstream tools | [External model host](../evidence/m10/external-agent.json), [Inspector](../evidence/m10/inspector.json) |
| Revocation, disabling/cached aliases, real outage and audit attribution | [Control regression](../evidence/m10/controls.json) |
| Concurrent dashboard provisioning, restart recovery and lifecycle | [Managed stores](../evidence/m10/managed-stores.json) |
| Isolation and complete teardown, original data preserved | [Network](../evidence/m10/network.json), [cleanup](../evidence/m10/secure-teardown.json) |
| Per-user/role permissions, replicas and management freshness | [Permissions](../evidence/m6/permissions.json), [replicas](../evidence/m6/permission-replicas.json), [management](../evidence/m6/management-freshness.json) |
| Actual browser/SDK OAuth, PKCE, expiry, revocation and concurrency | [Client](../evidence/m6/oauth-client.json), [negatives](../evidence/m6/oauth-security.json), [concurrency](../evidence/m6/oauth-concurrency.json) |
| Malicious upstreams, admission/RBAC, encryption and native data TLS | [Malicious peers](../evidence/m6/malicious-upstreams.json), [admission](../evidence/m6/admission.json), [at rest](../evidence/m6/secret-at-rest.json), [TLS](../evidence/m6/data-tls.json) |
| Native certificate renewal/reload and actual peer serials | [Peer verification](../evidence/m10/tls-peers.json), [controlled reload](../evidence/m10/identity-reload.json) |
| Actual modern/legacy MCP over TLS, untrusted-CA rejection and repeated renewal | [First repeat](../evidence/m10/pki-repeat-first-pass.json), [second repeat](../evidence/m10/pki-repeat-second-pass.json) |
| Desktop/tablet/mobile, all nine console routes, keyboard/reduced motion | [Console UI](../evidence/m6/console-ui.json), [visual review](../evidence/m10/visual-review.json) |
| Three Helm charts, local/production values | [Helm checks](../evidence/m10/helm.json) |
| Final retained workload health | [Health](../evidence/m10/release-health.json) |

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check
node --test tests/security/private-values.test.mjs
node scripts/release-doc-check.mjs
node scripts/check-public-privacy.mjs
```

Live test examples, after following the release installation and creating private test fixtures:

```sh
export PATH="$PWD/.tools/bin:$PATH"
export KUBECONFIG="$PWD/.local/kubeconfig"
export RELAY_TEST_ORIGIN=https://relay.localhost:18443
node scripts/run-acceptance.mjs scripts/security-permissions.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-client.mjs
node scripts/run-acceptance.mjs scripts/security-oauth-negative.mjs
node scripts/run-acceptance.mjs scripts/security-console-ui.mjs
```

The full destructive/model-backed suite must be run deliberately against disposable synthetic fixtures with a configured provider budget. The runner keeps raw browser diagnostics private; errors can include form values. Do not reset model reservations, remove unrelated data, or weaken security to reproduce a test.

## Publication provenance

Historical source hashes refer to pre-redaction commits; [the source map](../evidence/publication/source-map.json) preserves traceability. Paths in logs are redacted and private account/approval metadata is omitted. The privacy release separately verifies unchanged runtime source, current frozen installation/build and source/history publication checks. None of these results claims public cloud deployment, a complete uploaded video or an actual form submission.
