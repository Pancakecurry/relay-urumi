# Requirement and acceptance ledger

Authority: [employer brief](https://docs.google.com/document/d/1wE4j9_Y_iydrkiMu7p9N_Kd4ltFztUqjssyBd4tSwkU/view), research baseline dated 2026-10-09, and the owner’s milestone execution directives. All core, multi-store, nine differentiator areas and C1–C10 remain in scope. Internal submission target: October 25; deadline: October 26, 2026, 11:59 PM IST.

Allowed feature statuses: planned / implemented / tested locally / verified on VPS / demonstrated. A proof of a transport is not a completed WooCommerce gateway. Evidence below is the required future evidence until replaced with an actual file/run path.

| ID | Employer requirement | Implementation path | Milestone | Status | Test or evidence path / required evidence | Known limitations |
|---|---|---|---|---|---|---|
| K01 | Local Kind/k3d/Minikube Kubernetes; all store/DB/MCP/backend/dashboard components in cluster | charts/; infra/ | M1–M4 | planned | Clean local install, workload inventory and live core journey. M1 store and M2 upstream supporting evidence: evidence/m1.md, evidence/m2.md. M3 backend/data supporting evidence: evidence/m3.md and m3/inventory.json. | Store/private upstreams and M3 API/gateway/PostgreSQL/Redis contributions tested locally. Full dashboard/core journey remains M4; VPS unverified. |
| K02 | Same mandatory Helm charts, no Kustomize; local/prod values-only differences | charts/; infra/ | M1–M4 | planned | Versioned chart templates, rendered manifests, actual environment setup and config diff. M1 store and M2 upstream supporting evidence: evidence/m1.md, evidence/m2.md. M3 backend/data supporting evidence: evidence/m3.md and m3/inventory.json. | Store/private upstreams and M3 API/gateway/PostgreSQL/Redis contributions tested locally. Full dashboard/core journey remains M4; VPS unverified. |
| K03 | Production-like VPS deployability | charts/; infra/ | M9 | planned | Working production values and setup instructions; actual deployment evidence under D01. | Full requirement unimplemented at M0. |
| K04 | Persistent store DB and WordPress content | charts/; infra/ | M1 | tested locally | [M1 evidence](evidence/m1.md), m1/persistence.json, m1/after-replacement.json | Product 13, COD order 17 and upload file survive both pod replacements; disaster restore/HA not yet tested. |
| K05 | Storefront/dashboard Ingress and stable URLs; documented local domain | charts/; infra/ | M1–M4 | planned | Browser/client access through Ingress, exact local mapping and public DNS runbook. M1 store supporting evidence: evidence/m1.md. M3 backend/data supporting evidence: evidence/m3.md and m3/inventory.json. | Store/private upstreams and M3 API/gateway/PostgreSQL/Redis contributions tested locally. Full dashboard/core journey remains M4; VPS unverified. |
| K06 | Readiness/liveness on every workload; resource requests/limits | charts/; infra/ | M1–M4 | planned | Resource inventory plus probe failure/recovery checks, including data services and added dependencies. M1 store and M2 upstream supporting evidence: evidence/m1.md, evidence/m2.md. M3 backend/data supporting evidence: evidence/m3.md and m3/inventory.json. | Store/private upstreams and M3 API/gateway/PostgreSQL/Redis contributions tested locally. Full dashboard/core journey remains M4; VPS unverified. |
| K07 | No hardcoded secrets; credentials in Kubernetes Secrets | charts/; infra/ | M1–M4 | planned | Source/history/values scan, mounted/referenced Secret map, no plaintext browser/client/audit data. M1 store and M2 upstream supporting evidence: evidence/m1.md, evidence/m2.md. M3 backend/data supporting evidence: evidence/m3.md and m3/inventory.json. | Store/private upstreams and M3 API/gateway/PostgreSQL/Redis contributions tested locally. Full dashboard/core journey remains M4; VPS unverified. |
| W01 | Handwritten WooCommerce MCP, not an installed MCP plugin | apps/woocommerce-mcp/ | M2 | tested locally | [M2 evidence](evidence/m2.md), m2/acceptance.json, m2/network.json, m2/inspector.json; ADR 0007 | Handwritten five-tool REST adapter plus info; no plugin/SQL order adapter. |
| W02 | Streamable HTTP | apps/woocommerce-mcp/ | M2 | tested locally | [M2 evidence](evidence/m2.md), m2/acceptance.json, m2/network.json, m2/inspector.json; ADR 0007 | Modern 2026-07-28 and legacy 2025-11-25 plus Inspector 2.10.1 pass; local HTTP is not TLS. |
| W03 | list/create products, list/get orders, update order status | apps/woocommerce-mcp/ | M2 | tested locally | [M2 evidence](evidence/m2.md), m2/acceptance.json, m2/network.json, m2/inspector.json; ADR 0007 | Real product creation, duplicate rejection, order status change/readback/restoration, explicit pages and both UTC day boundaries. Supported standard statuses and six reviewed currencies only. |
| W04 | Internal-only WooCommerce MCP; only gateway calls it; document store interface choice | apps/woocommerce-mcp/ | M2 | tested locally | [M2 evidence](evidence/m2.md), m2/acceptance.json, m2/network.json, m2/inspector.json; ADR 0007 | Network boundary tested with a privileged gateway-labelled fixture; M3 additionally tests the production authenticated gateway/user identity in m3/acceptance.json and m3/network.json. Cluster operators can exec/port-forward; internal HTTP is unencrypted. |
| G01 | Admin adds/edits/disables/removes Streamable HTTP URL upstreams, optional static header/bearer | apps/gateway/ | M3 | tested locally | evidence/m3.md, m3/acceptance.json, m3/integration.json | API add/edit/disable/remove and bearer/static-header/no-auth paths pass. Dashboard controls await M4; conservative destination categories are documented in ADR 0008. |
| G02 | One endpoint aggregates enabled tools and routes calls | apps/gateway/ | M3 | tested locally | evidence/m3.md, m3/acceptance.json, m3/inspector.json | One real gateway /mcp aggregates 12 tools and routes all five Woo operations plus utilities. Modern/legacy official clients and independent Inspector pass; local HTTP only. |
| G03 | Same-name tools handled/documented | apps/gateway/ | M3 | tested locally | m3/acceptance.json; tests/protocol/upstreams.test.ts; packages/mcp-client/src/routes.ts | Three independent info tools route distinctly; immutable-ID 45-character aliases survive rename. Catalog change notifications are explicitly disabled; client refresh/reconnect is tested. |
| G04 | Slow/dead upstream isolation, timeouts and clear error | apps/gateway/ | M3 | tested locally | m3/integration.json, m3/acceptance.json | 500 ms real-tool deadline, cancellation, controlled absent Calendar and healthy Totals/readiness pass. Backend status works; dashboard display awaits M4. |
| G05 | Upstream credentials remain server-side | apps/gateway/ | M3 | tested locally | m3/integration.json, m3/network.json, m3/credential-scan.json; ADR 0008 | Real upstream capture proves server header and no caller cookie/user header. Fixed-Secret RBAC and gateway without K8s token. Internal HTTP unencrypted; crash-orphan cleanup/full lifecycle remains M6. |
| G06 | At least 3 upstreams: WooCommerce plus two choices | apps/gateway/ | M3 | tested locally | m3/acceptance.json, m3/inspector.json | Three independently running real servers aggregate and execute a Calendar-to-Woo-to-Totals sequence. Autonomous model prompt remains A01/E03 at M4. |
| T01 | Admin/member roles; admin server/member management | apps/api/; packages/auth/; packages/db/ | M3–M4 | implemented | m3/acceptance.json, m3/integration.json | Backend admin/member management, active membership, last-admin and cross-team boundaries tested locally. Dashboard/two-user video remains M4/M10. |
| T02 | Invite members; admin issue/revoke; member self-generate API key | apps/api/; packages/auth/; packages/db/ | M3–M4 | implemented | m3/acceptance.json, m3/security.json | Backend single-use invitation race, expiry/revoke, admin issue/revoke and self-key paths tested locally. Dashboard invitation/key workflows remain M4; no SMTP claimed. |
| T03 | Personal API keys stored hashed, revocable | apps/api/; packages/auth/; packages/db/ | M3–M4 | tested locally | m3/acceptance.json, m3/integration.json; packages/auth/src/identity.ts | 256-bit personal keys persist only SHA-256 hashes, last-use/revocation metadata; next existing-client request denies revoke. Dashboard demonstration still M4. |
| T04 | Every tool call audited with user/server/tool/time/duration/outcome, visible dashboard | apps/api/; packages/auth/; packages/db/ | M3–M4 | implemented | m3/acceptance.json, m3/integration.json, m3/security.json; packages/telemetry/src/audit.ts | Durable backend success/business-error/rejected/cancelled calls have actor/source/duration and result-to-audit correlation. Member/admin audit views tested; dashboard remains M4. Audit admission outage fails closed; total DB outage cannot persist a rejection. |
| U01 | Admin server status Connected/Unreachable/Disabled and tool list; WooCommerce already registered | apps/dashboard/ | M4 | planned | Fresh setup dashboard with all states and predefined first server. | Full requirement unimplemented at M0. |
| U02 | Member configures only gateway URL/key in external MCP client | apps/dashboard/ | M4 | planned | Real B client setup and discovery, no upstream credentials/configuration. | Full requirement unimplemented at M0. |
| A01 | Real LLM chat through gateway, tool calls visible | apps/api/; packages/model-provider/; packages/mcp-client/ | M4 | planned | A's model-driven create and orders answer, visible trace. | Full requirement unimplemented at M0. |
| A02 | Logged-in chat identity preserved; LLM key follows Secret rule | apps/api/; packages/model-provider/; packages/mcp-client/ | M4 | planned | A/B audit attribution and key source map. | Full requirement unimplemented at M0. |
| E01 | Storefront add-to-cart/COD checkout and order in admin | tests/e2e/; docs/demo/ | M1 | tested locally | m1/checkout.json, m1/admin-order.png, m1/after-replacement.json | Real Chrome COD checkout and matching HPOS administration screen; synthetic data only. |
| E02 | A creates named/priced product; storefront order; today's orders returned | tests/e2e/; docs/demo/ | M4 | planned | Product and order IDs linked across chat/store/admin/audit. | Full requirement unimplemented at M0. |
| E03 | B lists all enabled tools, asks orders, one prompt uses 2 upstreams | tests/e2e/; docs/demo/ | M4 | planned | External model/tool trace with correct identity. | Full requirement unimplemented at M0. |
| E04 | Revoke B; disable server removes tools in chat/client; kill one pod while others work | tests/e2e/; docs/demo/ | M4 | planned | Live demonstrations and automated failure/enforcement evidence. | Full requirement unimplemented at M0. |
| B01 | Dashboard create/delete stores; status/URL/created-time; concurrent provisioning | apps/provisioner/; charts/store/ | M5 | planned | Two concurrent operations become Ready, visible time/host and lifecycle. | Full requirement unimplemented at M0. |
| B02 | Per-store namespace/DB/Secrets/PVs/Ingress via Helm/API | apps/provisioner/; charts/store/ | M5 | planned | Actual independent resources with ownership labels and values. | Full requirement unimplemented at M0. |
| B03 | Automatic per-store MCP registration and identifiable tools | apps/provisioner/; charts/store/ | M5 | planned | Tools appear after readiness without manual registry edits. | Full requirement unimplemented at M0. |
| B04 | Clean namespace/volume/Secret/MCP teardown | apps/provisioner/; charts/store/ | M5 | planned | Namespace/PVC/PV/data/Secret/registration checks after delete. | Full requirement unimplemented at M0. |
| B05 | Store-to-store DB/WordPress isolation demonstrated with policies | apps/provisioner/; charts/store/ | M5 | planned | A→B TCP/HTTP denied and allowed own-store flow succeeds. | Full requirement unimplemented at M0. |
| B06 | ResourceQuota/LimitRange, max stores/user, provisioning timeout | apps/provisioner/; charts/store/ | M5 | planned | Inspect resources and trigger each guardrail. | Full requirement unimplemented at M0. |
| B07 | Retry safety/restart recovery; compare today's orders across 2 stores then delete one | apps/provisioner/; charts/store/ | M5 | planned | Crash/retry test matrix, real comparison trace and converged teardown. | Full requirement unimplemented at M0. |
| D01 | Actual production-like VPS with same charts; values changes; optional TLS now in our scope | see milestone decisions; charts/; tests/ | M6–M9 | planned | Real free-cloud k3s, DNS/Ingress/storage/secrets evidence and valid HTTPS. | Full requirement unimplemented at M0. |
| D02 | Per-role/per-user server/tool permissions; hide and direct-call deny | see milestone decisions; charts/; tests/ | M6–M9 | planned | Policy matrix plus cached-alias denial on both entry paths. | Full requirement unimplemented at M0. |
| D03 | Gateway OAuth MCP authorization/browser login | see milestone decisions; charts/; tests/ | M6–M9 | planned | Discovery, registration, PKCE, consent, protected call, expiry/revocation in real host. | Full requirement unimplemented at M0. |
| D04 | Many-tools approach, such as search/execute | see milestone decisions; charts/; tests/ | M6–M9 | planned | Large fixture and labelled tool-selection tests with bounded context. | Full requirement unimplemented at M0. |
| D05 | Admin adds container image; deploy Secret/limits/policy and remove cleanly | see milestone decisions; charts/; tests/ | M6–M9 | planned | Hosted MCP ready through gateway, prohibited config denied, cleanup verified. | Full requirement unimplemented at M0. |
| D06 | SSRF, least-privilege RBAC, deny-default/non-root, encrypted upstream credentials | see milestone decisions; charts/; tests/ | M6–M9 | planned | Destination/admission/runtime/Secret encryption/access negative tests. | M0 proof provides supporting evidence only; full requirement remains planned. |
| D07 | Multiple gateway replicas, session/upstream correctness, per-user/key rate limits | see milestone decisions; charts/; tests/ | M6–M9 | planned | Alternating replica traffic, kill/reconnect and shared-bucket/revoke tests. | Full requirement unimplemented at M0. |
| D08 | Calls/errors/latency metrics and meaningful failure diagnostics | see milestone decisions; charts/; tests/ | M6–M9 | planned | Dashboards/alerts, induced outage correlation and reason codes. | Full requirement unimplemented at M0. |
| D09 | Store/MCP/gateway Helm upgrades and safe rollback | see milestone decisions; charts/; tests/ | M6–M9 | planned | Compatible app upgrade/rollback and data-preservation evidence, DB caveats. | Full requirement unimplemented at M0. |
| S01 | README local + production, checkout/external client/chat instructions | README.md; docs/ | M10 | planned | Fresh reader follows exact steps with no undocumented changes. | Full requirement unimplemented at M0. |
| S02 | All source, charts/local+prod values, system design/tradeoffs | README.md; docs/ | M10 | planned | Repo inventory and design walkthrough. | Full requirement unimplemented at M0. |
| S03 | Threat note: shared credential capabilities, no token passthrough, malicious descriptions, cross-user risks | README.md; docs/ | M10 | planned | Threats mapped to enforcement tests and explicit residual risks. | Full requirement unimplemented at M0. |
| S04 | Optional feature list with implementation location | README.md; docs/ | M10 | planned | This ledger completed with evidence instead of marketing claims. | Full requirement unimplemented at M0. |
| S05 | Video: live two users; architecture, Kubernetes, MCP, security, agent, local→VPS and rollback | README.md; docs/ | M10 | planned | Timed run card and accessible video with each required point. | Full requirement unimplemented at M0. |
| S06 | Repo + demo video submitted via supplied form | README.md; docs/ | M10 | planned | Link-access check and actual submission confirmation; preparation alone is not submission. | Full requirement unimplemented at M0. |

## M0 acceptance (separate from full employer requirements)

See [M0 report](evidence/M0_REPORT.md) for actual acceptance results. No complete employer requirement is promoted by scaffolding.

| M0 item | Status | Actual evidence / limitation |
|---|---|---|
| Sources read and source authority recorded | tested locally | `evidence/source-verification.json`; complete plan read outside repo; private correspondence not copied |
| Exact dependency/tool/image versions | tested locally | `versions.md`, lockfile, `evidence/dependency-provenance.json`, `evidence/cluster-image-identities.json` |
| Cluster healthy; Ingress/network/Secret/storage capabilities | tested locally | `evidence/cluster-capabilities.json`; retained marker after pod replacement, allowed/denied traffic, both host ports loopback |
| Real MCP ping through Ingress | tested locally | `evidence/official-client.txt`, `evidence/inspector-client.json`; modern and legacy |
| Request path and actual protocol understood | tested locally | `architecture/overview.md`, `versions.md`, wire trace; stateless optional GET 405 documented |
| Environment/external limitations recorded | tested locally | `architecture/feasibility.md`, `evidence/resources.json`, `evidence/model-feasibility.json`; two bounded model requests verified, VPS unverified |
| Unrelated resources preserved | tested locally | `evidence/resources.json`, ownership guards in `scripts/cluster-capabilities.mjs`; no system cleanup |
| Requirement/evidence tracking files | implemented | This ledger, architecture/decisions/runbooks/demo/worklog/evidence |
| Reproducible fresh-checkout installation | tested locally | `evidence/reproducibility.json`, `evidence/reproducibility.txt`; frozen offline install and full checks pass in clean clone |
| Tested Git checkpoint | tested locally | Implementation `6ef47d4593fa437281b545d7dce30e98e4d72713`; final evidence checkpoint tagged `m0-verified`, credential/whitespace scans pass |

M0 evidence supports K01/K02/K05/K06/K07/W02/D06, but their full feature scope still requires M1–M4 or bonus acceptance. The Better Auth/header feasibility spikes support the future T01–T04/U02 path; they do not implement team roles, hashed personal keys or the two-user workflow.

The real Gemini loop is locally tested supporting evidence for A01/A02 (`evidence/gemini-spike.json`). Both full features remain planned: the spike uses the M0 Secret identity and one ping tool, with no dashboard chat, logged-in user, WooCommerce or durable audit. Its runtime key is stored in a Kubernetes Secret. The filesystem budget guard is an isolated spike control, not a product-wide distributed quota.

## M1 acceptance ledger — October 10, 2026

The store acceptance is distinct from the full platform requirements. No gateway, dashboard or M2 adapter is implemented here.

| Gate | Status | Actual evidence |
|---|---|---|
| Pinned chart/images and valid rendered manifests | tested locally | m1/helm.txt, m1/manifests.yaml, m1/manifest-validation.txt, versions.md |
| Empty namespace/database/content installation | tested locally | m1/clean-install.txt, m1/clean-rest.json, m1/clean-state.json |
| Ready WordPress/MariaDB through hostname Ingress | tested locally | m1/inventory.json, real checkout browser evidence |
| Signed authenticated REST, unauthorized order rejection | tested locally | m1/checkout.json, m1/clean-rest.json |
| Real cart/COD purchase and matching admin order | tested locally | m1/checkout.json, m1/cod-checkout.png, m1/admin-order.png |
| Both pods replaced, original products/order/file and PVCs persist | tested locally | m1/persistence.json, m1/after-replacement.json |
| Repeated/interrupted setup preserves one admin/key/each SKU | tested locally | m1/idempotence.json; interruption.json records the targeted actual Job termination test |
| Resource/probe/PVC/Secret inventory and no public database | tested locally | m1/inventory.json, m1/network.json |
| Credential-safe final source/evidence/checkpoint | tested locally | m1/credential-scan.json; fresh-checkout reproduction and tested checkpoint in evidence/m1.md |

K01/K02/K05/K06/K07 remain planned as whole-platform requirements despite the verified store contribution. VPS, disaster recovery, non-root redesign and full tenant isolation are not inferred from this gate.

## M2 status boundary

W01–W04 are tested locally for the M2 handwritten/private upstream scope. G06's three-server portion and G03/G04/G05 supporting behavior are proven, but their full gateway/model workflows remain planned. All 51 original feature IDs and all product expansion scope remain preserved. The fixture's Kubernetes label is an operator privilege, not an authenticated user's identity. No VPS, final two-user model demonstration, team/audit or bonus requirement is upgraded on the strength of M2 alone.

## M3 status boundary

G01–G06 and T03 backend features are tested locally. T01/T02/T04 backend portions are tested but retain implemented status while their required dashboard/user walkthrough remains M4. Trusted chat delegation is tested supporting evidence for A02, not completed product chat. D02/D06/D07 have foundational negative-test support; all full optional gates remain planned. Every original ID and all expansion scope remain preserved.

## M4 local Gate A tracking

M4 live integration is tested. The final exact-source empty-cluster installation is pending until m4/clean-install.json exists with passed:true. Do not infer a VPS/video/submission from local tests. All K/W/G/T/U/A/E requirement IDs are retained; final status promotion follows that gate.

| Acceptance area | Evidence | Status / limitation |
|---|---|---|
| Real A product → COD/admin → today's orders | m4/chat-create.json; m4/checkout.json; m4/chat-orders.json; m4/persistence.json | tested locally; product42/order43; wrong-date first attempt preserved and repaired |
| B external model prompt / 3 upstreams / Inspector | m4/external-agent.json; m4/inspector.json | tested locally; Relay CLI host, not a branded desktop host claim |
| UI management, failure, membership/key enforcement, audit correlation | m4/browser.json; m4/operations.json; m4/business-regression.json | tested locally; revoked keys stay revoked |
| Security and network boundaries | m4/security.json; m4/network.json; m4/regression.json | tested locally; internal HTTP/operator privilege residual limits remain |
| All-screen desktop/mobile formatting | m4/visual/review.json; design/REVIEW.md | tested locally;49 post-repair desktop/mobile states pass |
| Clean source + empty cluster | m4/clean-install.json | planned final gate, no new provider traffic |

## Product expansion scope — retained C1–C10

These are additional full-product gates, not replacement names for M4 features. Each remains planned, with its original acceptance specification in the authoritative research baseline.

| ID | Product expansion | Implementation path | Milestone/status | Required evidence / limitations |
|---|---|---|---|---|
| C1 | Complete Gateway Flight Recorder | telemetry, gateway, dashboard | post-core / planned | Real policy/identity/routing timeline, safe replay, redaction and unknown writes; M4 inspector is supporting work only |
| C2 | Explainable policy and action preview | auth, gateway, dashboard | post-core / planned | Same-engine dry-run explanations and exact expiring actor/tool/argument-bound approvals |
| C3 | Store/connection Doctor | provisioner, gateway, dashboard | post-core / planned | Correct diagnosis of DNS/TLS/readiness/credentials/PVC failures; authorized audited remediation |
| C4 | Workflow studio | API, gateway, dashboard | post-core / planned | Versioned typed playbooks, per-step policy/provenance/retry/approval boundaries |
| C5 | Integration registry | hosted-mcp, contracts, dashboard | post-core / planned | Capability/schema/image review, compatibility and safe upgrades |
| C6 | Enterprise organization | auth, DB, API, dashboard | post-core / planned | MFA/SSO/service accounts, tenant export/retention/deletion gates |
| C7 | Reliable operating platform | infra, DB, runbooks | post-core / planned | Actual backup/PITR/HA/disaster drill RPO/RTO; independent failure domains may require external capacity |
| C8 | Scale and efficiency | gateway, telemetry, infra | post-core / planned | Measured scaling/fair scheduling/caches/revocation/backpressure; no synthetic scale claims |
| C9 | Hardened public hosting | hosted-mcp, infra, security | post-core / planned | Hostile workload sandbox/signature/egress/abuse/rotation tests; namespaces alone insufficient |
| C10 | Developer/product experience | SDK/CLI/docs/dashboard | post-core / planned | Connector templates, complete onboarding, screen-reader/accessibility and export compatibility report |
