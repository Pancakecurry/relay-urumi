# Helm upgrade and rollback

Use the dedicated project context and inspect the exact current release before any mutation. Never roll back a database schema by guessing.

```sh
export PATH="$PWD/.tools/bin:$PATH" KUBECONFIG="$PWD/.local/kubeconfig"
helm list -A
helm history relay-core -n relay-platform
helm history demo-store -n relay-store-m1
helm history relay-woocommerce -n relay-store-m1
helm history relay-calendar -n relay-upstreams
helm history relay-totals -n relay-upstreams
```

Build and validate the reviewed commit; retain a known-good image/release and an owner-controlled backup. Run `helm lint` and inspect `helm template` for the exact environment values. Upgrade the same release/chart with explicit image versions and `--wait --wait-for-jobs`. Migration compatibility is part of the decision; a new app image must support the deployed schema and encrypted credential format.

If a deployment fails and the previous application/schema/configuration remain compatible:

```sh
# Substitute an actual compatible revision from helm history, never a made-up number.
helm rollback relay-core VERIFIED_REVISION -n relay-platform --wait --timeout 300s
helm rollback demo-store VERIFIED_REVISION -n relay-store-m1 --wait --timeout 300s
helm rollback relay-woocommerce VERIFIED_REVISION -n relay-store-m1 --wait --timeout 180s
```

Repeat real authenticated MCP, storefront, order, policy and audit checks after rollback. A StatefulSet pod already created from a bad revision may need controlled replacement after confirming its restored template. Preserve PVCs; do not delete a database volume to make readiness pass.

Actual M6 evidence includes the failed native PostgreSQL HBA attempt, rollback to compatible platform revision 34, preserved volumes and subsequent corrected TLS rollout. That is a real targeted repair, not a complete D09 upgrade/backup matrix. Current history and the worklog retain the details. Do not present an M4 image without vault/TLS/schema support as an M6 rollback target merely because its tag is retained.

Helm rollback does not undo SQL migrations, WooCommerce orders, credential rotation, external side effects or deleted volumes. A bootstrap Job must remain idempotent. WordPress/mysqlnd core bridge hashes require explicit review on a version upgrade. Managed-store desired configuration is captured durably; hand-editing its Helm release may be reconciled back. D09's full safe upgrade/restore matrix remains roadmap work.
