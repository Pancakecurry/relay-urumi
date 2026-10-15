# Requirement and acceptance ledger

Authority: [employer brief](https://docs.google.com/document/d/1wE4j9_Y_iydrkiMu7p9N_Kd4ltFztUqjssyBd4tSwkU/view), research baseline dated 2026-10-09, and the owner’s milestone execution directives. All core, multi-store, nine differentiator areas and C1–C10 remain in scope. Internal submission target: October 25; deadline: October 26, 2026, 11:59 PM IST.

Allowed feature statuses: planned / implemented / tested locally / verified on VPS / demonstrated. A proof of a transport is not a completed WooCommerce gateway. Evidence below is the required future evidence until replaced with an actual file/run path.

| ID | Employer requirement | Implementation path | Milestone | Status | Test or evidence path / required evidence | Known limitations |
|---|---|---|---|---|---|---|
| K01 | Local Kind/k3d/Minikube Kubernetes; all store/DB/MCP/backend/dashboard components in cluster | charts/; infra/ | M1–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Native arm64 local cluster only; all mandatory store, upstream, platform and dashboard workloads run inside Kubernetes. Actual VPS/amd64 remain pending. |
| K02 | Same mandatory Helm charts, no Kustomize; local/prod values-only differences | charts/; infra/ | M1–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Same three store/hosted-mcp/platform Helm charts pass local/prod lint/render and empty-cluster values overrides. Public deployment remains pending. |
| K03 | Production-like VPS deployability | charts/; infra/ | M9 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Production-like values/runbook and optional TLS Secret references tested as configuration only. No actual VPS or certificate deployment; D01/M9 remains planned. |
| K04 | Persistent store DB and WordPress content | charts/; infra/ | M1 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Both store pod replacements and actual server restart preserve product42/order43/content/PVC identity, plus original M1 data. Disaster restore/HA remains future. |
| K05 | Storefront/dashboard Ingress and stable URLs; documented local domain | charts/; infra/ | M1–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Storefront/console/MCP use real named loopback Ingress. Local HTTP only; public DNS/TLS remains D01. |
| K06 | Readiness/liveness on every workload; resource requests/limits | charts/; infra/ | M1–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Actual workload probes/limits/PVCs/Secret refs inspected; real pod and server restart recovery. No HA or capacity claim. |
| K07 | No hardcoded secrets; credentials in Kubernetes Secrets | charts/; infra/ | M1–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Final staged known-secret/pattern scan and runtime mount/response checks. One local join-token inventory disclosure was repaired by actual rotation/restart; security-incident.md records it honestly. |
| W01 | Handwritten WooCommerce MCP, not an installed MCP plugin | apps/woocommerce-mcp/ | M2 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Handwritten five-tool Woo REST adapter plus info; no Woo MCP plugin or SQL order bypass. |
| W02 | Streamable HTTP | apps/woocommerce-mcp/ | M2 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Modern2026-07-28 and legacy2025-11-25 real MCP calls and independent Inspector pass. Local HTTP is not TLS. |
| W03 | list/create products, list/get orders, update order status | apps/woocommerce-mcp/ | M2 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | All five real tools, strict schemas, pages/day bounds, product44, order43 change/read/restoration and business failures. Six reviewed currencies/standard statuses only. |
| W04 | Internal-only WooCommerce MCP; only gateway calls it; document store interface choice | apps/woocommerce-mcp/ | M2 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Actual authenticated gateway plus negative network/RBAC tests; private adapter has no public route. Cluster operators can exec/port-forward; internal HTTP unencrypted. |
| G01 | Admin adds/edits/disables/removes Streamable HTTP URL upstreams, optional static header/bearer | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real admin UI/API CRUD, write-only bearer/static headers, disabled/unreachable feedback. Conservative reviewed destination categories; orphan cleanup remains M6. |
| G02 | One endpoint aggregates enabled tools and routes calls | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | One /mcp endpoint exposes12 collision-safe tools across3 independent services, routes real calls and refreshes after registry changes. |
| G03 | Same-name tools handled/documented | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Three info collisions route distinctly; immutable-ID aliases survive rename. Catalog notifications disabled; explicit refresh/reconnect required. |
| G04 | Slow/dead upstream isolation, timeouts and clear error | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Actual deadline/cancellation/outage and pod replacement preserve healthy upstream calls; real UI status. Sampled health is not a continuous SLO. |
| G05 | Upstream credentials remain server-side | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Caller identity never becomes upstream credentials; Secret least privilege and real response non-disclosure pass. Internal HTTP and operator access remain residual limits. |
| G06 | At least 3 upstreams: WooCommerce plus two choices | apps/gateway/ | M3 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Three real upstreams plus actual autonomous Calendar-to-Woo prompt. Totals runs independently and all info aliases pass fresh installation. |
| T01 | Admin/member roles; admin server/member management | apps/api/; packages/auth/; packages/db/ | M3–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Admin/member UI and server-side management boundaries, last-admin, active-membership and cross-team tests pass. No SSO/MFA completion claimed. |
| T02 | Invite members; admin issue/revoke; member self-generate API key | apps/api/; packages/auth/; packages/db/ | M3–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real email-bound invitation acceptance, member self-key, admin issuance/revocation and one-time copying. Manual invitation sharing; no SMTP. |
| T03 | Personal API keys stored hashed, revocable | apps/api/; packages/auth/; packages/db/ | M3–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Personal keys stored only as hashes; next existing-client call rejects revoked key. Retained B acceptance key is permanently revoked. |
| T04 | Every tool call audited with user/server/tool/time/duration/outcome, visible dashboard | apps/api/; packages/auth/; packages/db/ | M3–M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Durable success/failure/rejection records and real dashboard filters; actual tool/audit correlation attributed to A/B. Full DB outage cannot persist a rejection; admission fails closed. |
| U01 | Admin server status Connected/Unreachable/Disabled and tool list; WooCommerce already registered | apps/dashboard/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real topology and Connected/Unreachable/Disabled states, server tools/schema and operator Woo bootstrap. Arbitrary new teams do not inherit private store access. |
| U02 | Member configures only gateway URL/key in external MCP client | apps/dashboard/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | B external CLI model host and independent Inspector use only gateway URL/personal key for MCP. No branded desktop-client claim. |
| A01 | Real LLM chat through gateway, tool calls visible | apps/api/; packages/model-provider/; packages/mcp-client/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real Gemini product/orders and actual execution inspector with durable events. Four-step/eight-tool bounds; independent turns; M4 inspector is not complete C1. |
| A02 | Logged-in chat identity preserved; LLM key follows Secret rule | apps/api/; packages/model-provider/; packages/mcp-client/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Session-derived fresh gateway delegation and owner/tenant-scoped chat, API-only model Secret. Cross-replica cancellation/recovery remains M8. |
| E01 | Storefront add-to-cart/COD checkout and order in admin | tests/e2e/; docs/demo/ | M1 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real COD storefront/admin/REST order43 and independent fresh-install checkout; synthetic data only. |
| E02 | A creates named/priced product; storefront order; today's orders returned | tests/e2e/; docs/demo/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real A product42 at199.00INR -> COD order43 -> Calendar/Woo today page; semantic wrong-date attempt retained and repaired. Recorded Oct11 journey is timestamped. |
| E03 | B lists all enabled tools, asks orders, one prompt uses 2 upstreams | tests/e2e/; docs/demo/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Distinct B real model prompt uses Calendar/Woo; independent client discovers12 tools and original-server aliases. New paid rehearsal requires sufficient authorized credit. |
| E04 | Revoke B; disable server removes tools in chat/client; kill one pod while others work | tests/e2e/; docs/demo/ | M4 | tested locally | [M4 evidence](evidence/m4.md); m4/gate-a.json; m4/clean-install.json; prior milestone evidence retained | Real disable/stale-alias rejection, independent pod outage/recovery, active membership and next-call key revocation with correct actor audits; state restored. |
| B01 | Dashboard create/delete stores; status/URL/created-time; concurrent provisioning | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/provisioning.json; m5/ui-creation.json; m5/ui-deletion.json; m5/visual/review.json | Two concurrent dashboard-created stores and new orchestration create/delete passed. Live observations are sampled, not continuous availability guarantees. |
| B02 | Per-store namespace/DB/Secrets/PVs/Ingress via Helm/API | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/resources-ec2a6b2c.json; m5/resources-85079ca7.json | Actual distinct namespaces, Helm releases, WordPress/MariaDB/PVCs/Secrets/Ingress and private adapters. Native arm64 local cluster; no VPS claim. |
| B03 | Automatic per-store MCP registration and identifiable tools | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/business.json; m5/inspector.json; m5/provisioning.json | Automatic six-tool discovery per store, full UUID aliases and real modern/legacy calls. Original core aliases preserved. |
| B04 | Clean namespace/volume/Secret/MCP teardown | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/teardown.json; m5/ui-deletion.json; m5/create-delete-race.json | Actual namespace, recorded PV/local-path data, Secret-vault slot and active routes removed. Historical audit tombstones retained. No arbitrary storage-provider secure-erasure claim. |
| B05 | Store-to-store DB/WordPress isolation demonstrated with policies | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/isolation.json | Actual own-WordPress allow and cross-store WordPress/database/adapter deny in both directions, plus RBAC/admission checks. Restricted internal HTTP is unencrypted. |
| B06 | ResourceQuota/LimitRange, max stores/user, provisioning timeout | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/guardrails.json; m5/recovery.json; m5/failures.json | Actual quota/LimitRange denials, cross-team per-owner cap, image-pull deadline, bootstrap and registration failures/recovery passed. Default two stores per owner; local resource budget only. |
| B07 | Retry safety/restart recovery; compare today's orders across 2 stores then delete one | apps/provisioner/; charts/store/ | M5 | tested locally | [M5 evidence](evidence/m5.md); m5/recovery.json; m5/failed-job-repair.json; m5/create-delete-race.json; m5/chat-verification.json; m5/teardown.json | Ten worker-restart boundaries, SQL repair after queue loss/exhausted job, concurrent cancellation and verified cleanup passed. Real five-tool Gemini comparison is dated Oct11; it is not represented as an Oct15 today query. |
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
| Clean source + empty cluster | m4/clean-install.json | tested locally; exact committed source and empty-cluster acceptance, provider disabled |

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
