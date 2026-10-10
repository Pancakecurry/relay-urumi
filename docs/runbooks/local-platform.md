# M3 local platform

Prerequisites: verified M0 tools/cluster and M1/M2 store/private upstreams, with their private credential backups. Use the dedicated `.local/kubeconfig`, never the owner's default cluster. The chart/control namespace is `relay-platform`. Do not remove existing resources to regain disk space.

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
pnpm platform:deploy
pnpm platform:acceptance
node scripts/platform-integration.mjs
node scripts/platform-security.mjs
node scripts/platform-network.mjs
node scripts/platform-inspector.mjs
node scripts/platform-inventory.mjs
```

Run acceptance/failure suites sequentially: they deliberately change owned upstream replicas, database audit admission and PostgreSQL pods, and restore them in `finally`. Acceptance creates labelled synthetic identities, a team, three registrations, a product and actual order status changes. It restores order 22 to processing. The integration suite removes only its own diagnostic registration/Pod/Service/NetworkPolicy, restores Calendar replicas and audit grants, and retains real test data/history. Reruns create isolated synthetic data rather than silently duplicating a production bootstrap identity. There is no paid provider traffic.

The first platform deployment creates encrypted-at-rest Kubernetes Secrets from a mode-0600 ignored backup. Existing Secrets must match the backup; missing backups/conflicting credentials cause refusal, not rotation. Dynamic gateway credentials are never reset during upgrades. Operator backup recovery is required if the private files are lost. Helm migration Jobs use a separate Secret and repeatable migration SQL; runtime applications do not mount migration credentials. Failed historical Jobs are evidence of an earlier corrected migration error, not currently successful jobs.

Management base: `http://relay.localhost:18080/api`. Session routes: `/auth/sign-up/email`, `/auth/sign-in/email`, `/auth/get-session`, `/auth/sign-out`. Management writes use the exact `Origin: http://relay.localhost:18080`; team-scoped requests also use `X-Relay-Team: <selected team UUID>`. The session determines the user. `/teams` lists or creates owned teams. Team admin/member/key/invitation/upstream/permission/audit/tool endpoints are implemented in `apps/api/src/server.ts`. The dashboard that wraps them is M4, so no visual console exists yet.

Published MCP endpoint: `http://relay.localhost:18080/mcp`. For command-line clients whose resolver does not resolve `.localhost`, use the tested `http://localhost:18080/mcp` Ingress alias. Both reach the same gateway. Use `Authorization: Bearer <personal API key>`. The external client needs no upstream URL, upstream credential, browser cookie or Kubernetes access. The preserved M0 proof is at its original loopback-IP endpoint, distinct from the named Relay gateway route.

`platform:acceptance` writes test account emails/passwords, A/B client keys and session cookies only to `.local/m3-acceptance-identity.json` (0600), never to evidence. Do not paste that file into logs or commit it. The real Inspector run constructs a private config with B's key, runs five CLI operations, checks responses for credential disclosure and wipes its temporary config. The integration suite signs B out to verify delegation revocation; B's personal API key remains independent of that session.

Registry authentication accepts no credential, bearer or reviewed static headers. Unsafe headers, redirect targets, metadata/control-plane addresses and unapproved external targets are rejected. Private endpoint namespaces/port/Service CIDR are deliberately constrained in M3; M5/M6 will extend the approved destination categories through owned provisioning and tested hardening. Use PATCH's returned revision for subsequent changes; conflicting revisions return 409. Removal tombstones the row and clears the associated Secret entry. SQL and Secret updates have a documented crash boundary; operator cleanup of an unused slot may be necessary until the lifecycle reconciler is implemented.

Status is refreshed when a team is active/first queried, then every five seconds. Use fresh `tools/list` or reconnect after edits; no untested subscription/change-notification capability is advertised. Cached aliases are checked against current membership, key revocation, registry revision and deny policy. A team admin cannot access another team's registry/audit.

Persistence: PostgreSQL and Redis have retained PVCs. The acceptance replaces PostgreSQL and verifies audit count, original PVC identity and usable identities/registry after reconnect. This is restart persistence, not backup/restore or HA. Do not roll back a database schema by blindly rolling back Helm; the current migration is additive/idempotent, and compatible rollback/disaster restore remain planned later gates.

Production: use the same platform chart with `infra/prod/platform-values.yaml`, actual domain/HTTPS ingress, image publication and the real API endpoint CIDR. Keep Secret values out of Helm values. The supplied production domain/API CIDR are explicit placeholders, not a deployed VPS/TLS claim. No cloud account was accessed or provisioned.
