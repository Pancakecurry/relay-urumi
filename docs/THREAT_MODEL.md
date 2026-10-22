# Threat model

## Trust boundaries

The workstation/cluster administrator, reviewed application images, PostgreSQL, cert-manager and the configured CA are trusted. A team member, an MCP client, a registered upstream's descriptions/results and model output are not trusted. Namespace policies are not a hostile-kernel sandbox. A cluster administrator can read Secrets or bypass network boundaries.

| Threat | Implemented control | Evidence / remaining limit |
|---|---|---|
| Stolen personal key | Random individual key, hash-only durable storage, current membership/revocation check on every request | M3/M4/M6 key and policy negatives; a stolen active key retains its granted capability until revoked |
| Cross-user or cross-team access | Fresh server-derived identity, tenant RLS, owner-scoped chat, management role checked after tenant lock | M6 permissions/management-freshness and core security; client-supplied actor headers cannot grant identity |
| Shared store credential misuse | Credential stays server-side; gateway policy limits which shared capabilities the member may invoke | A member may still perform an allowed write using a credential they never see; least-privilege tool policy matters |
| Client-token passthrough | Gateway replaces caller authentication with the selected registration's static credential | Hostile-peer tests confirm no caller key, session cookie or forged identity reaches upstream |
| Credential disclosure | Kubernetes Secrets, vault AEAD/key separation, immutable tenant/revision references, write-only management, response/log redaction | At-rest sentinel, vault rotation/tamper/GC and hostile output tests; an upstream inherently sees its own credential and can encode covert output |
| SSRF / DNS rebinding | Strict destination rules, all-answer classification, pinned literal address, Host/SNI/CA verification, redirect denial and bounded streams | Destination unit/real hostile-upstream tests; reviewed internal service destinations are deliberate exceptions |
| Malicious MCP schema/description/output | Bounded schema/size/depth, unsafe-key rejection before SDK normalization, credential redaction, no automatic trust in annotations | JSON/SSE hostile tests; prompt injection and arbitrary covert channels cannot be eliminated by these checks |
| Cached permission bypass | One live engine on discovery/search/direct calls/chat; deny precedence and current server/client/membership state | M6 permissions, two gateway replicas and OAuth tests |
| OAuth code/token replay | Native opaque token storage, exact resource/issuer/client, S256 PKCE, signed consent, current session/membership/client, bounded cross-replica mutation lock | Real external browser/client, natural expiry, code/refresh/revoke races; no open dynamic registration/machine grants |
| Provisioner privilege escalation | Narrow RBAC, exact namespace/resource ownership, admission restrictions, non-root/read-only roots/no token mounts in store workloads | Admission/RBAC and malicious configuration negatives; provisioner remains a trusted controller |
| Store-to-store access | Separate namespaces, DBs, PVCs, Secrets; deny-default policies permit only required directions | Actual allowed/denied connections; a single shared kernel/storage host remains a shared failure domain |
| Transport interception | Project CA/SAN checks and service identity; native SQL role certificate+SCRAM, Redis certificate+password | Data TLS, wrong CA/name/role/plaintext tests and renewed peer serials; local CA is not public browser trust |
| Unbounded LLM spend or runaway tools | PostgreSQL admission reservation before each request, explicit credit cap, four steps/eight tools, size/token caps/no retries | Rolled-back real exhaustion test; conservative reservations are not a provider invoice or billing hard-stop outside Relay |

## Operational limits

Do not show keys, cookies, invitation tokens, Secret data, private key files or private error snapshots in recordings. Generated acceptance identities are synthetic; public deployment needs new operator-owned credentials. Secret bootstrap refuses silent rotation when backups/ownership do not match.

Native PostgreSQL/Redis/PHP/client identities require controlled reload after renewal. Node HTTPS servers reload their projected leaf. Root CA rotation needs overlapping trust and an independent reviewed procedure. This release does not claim automatic root rotation, HA, PITR, general image sandboxing, a complete security audit or a public VPS deployment.

The historical M4 local token disclosure and its real repair remain documented in the evidence; they are not hidden by a later passing scan. Final review scans the Git index/history for known values and recognizable secret patterns, with raw values kept private.
