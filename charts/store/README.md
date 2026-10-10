# Persistent single-store chart

WordPress/WooCommerce, dedicated MariaDB, separate retained PVCs, Secret references, Ingress and namespace NetworkPolicies. Build/import the reviewed `infra/store` image with `pnpm store:deploy` before installing. The post-install/upgrade hook performs real idempotent configuration; there is no manual setup wizard dependency. See [runbook](../../docs/runbooks/local-store.md), [ADR](../../docs/decisions/0006-persistent-store.md) and [acceptance evidence](../../docs/evidence/m1.md).

The official image entrypoints require root initialization; this is not a restricted/non-root-compatible chart. Single replicas and node-local RWO storage have no HA guarantee. Production differs through values, TLS, storage and registry image identity; VPS execution remains unverified.
