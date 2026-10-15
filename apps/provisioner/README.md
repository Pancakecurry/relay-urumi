# Store lifecycle controller

M5 owns durable PostgreSQL desired state/outbox, BullMQ dispatch, reconciliation and real Helm/Kubernetes provisioning. It is a separate private service, not a general container executor. See `docs/decisions/0010-durable-store-provisioning.md` and the M5 runbook/evidence for permissions, generation fencing, retries, namespace isolation and verified teardown. Runtime configuration and credentials come from Kubernetes Secrets and environment values. No secrets are Helm values or dashboard responses.

`/internal/stores/:id/observed` requires the internal platform credential and exact team/store binding. It returns a sanitized real-resource snapshot, optional Kubernetes metrics and the managed registration state. The public API verifies a live session/membership first and removes unauthorized tools. It never forwards Kubernetes credentials or raw Secret data. This endpoint is not exposed through Ingress.
