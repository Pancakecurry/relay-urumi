# Original technical roadmap — preserved baseline

The following milestone/product gates are retained from the October9 owner-authored research plan. They are historical estimates and acceptance specifications, not current completion claims. The October22 directive narrows this assessment submission to M0–M6 plus M10; all later product scope remains active. The submission form was actually inspected on October22 (see M10 evidence). Private hiring correspondence/source-account metadata are not copied here.

## 10. Milestone plan, effort and decision gates

### Forecast and delivery discipline

The earlier 130–190-hour estimate preceded the deeper product/security/protocol research. The detailed allowances below sum to **approximately 124–202 focused implementation hours** for core + all employer bonus/differentiator work + release evidence, **before a 25–40% integration/rework allowance**: roughly **155–283 hours**. These are judgment estimates, not measured productivity. Post-bonus creative/product work adds a separate programme of milestones.

October 9–24 provides 16 calendar days. Fitting the full employer scope would require roughly 10–18 focused hours/day at that estimate; the upper end is not a credible sustained solo schedule. AI assistance and verified library reuse may improve throughput, but do not establish that all integrations can finish before the deadline. The plan retains the entire objective and makes the forecast visible. Re-estimate after M0/M3 using actual gate completion; do not silently cut bonuses or promise an unsupported date.

Maintain a runnable core branch/release as later features develop. Each completed stage has a reproducible install, meaningful tests, evidence, a walkthrough and explicit remaining defects. Unfinished feature code must not corrupt the working submission. Documentation, basic security and telemetry start during core because they are foundational; advanced bonus features start only after Gate A.

### Assessment and all-bonus milestones

| Milestone | Aggressive target | Allowance | Concrete work and exit gate |
|---|---|---|---|
| M0 — Source/stack/feasibility | Oct 9 | 6–10h | Freeze requirements and versions; verify container resources/storage; tiny official-SDK client/server through Ingress; auth/OAuth spike, Gemini credit applicability and model tool test; free VPS availability decision. Gate: real client/protocol path and documented feasibility, no assumed paid dependencies. |
| M1 — Stateful cluster foundation | Oct 10–11 | 8–14h | Helm platform/store charts, PostgreSQL/Redis/WordPress/MariaDB, PVC/Secrets/probes/requests/limits, stable domains/bootstrap/COD. Gate: checkout order visible in admin; restart persistence; clean setup reproduced. |
| M2 — Store MCP + utility upstreams | Oct 11–12 | 8–12h | Handwritten five Woo tools, calendar/totals, schema/input/output errors, date/pagination, private network boundaries. Gate: actual SDK calls and real product/order updates; collision fixture. |
| M3 — Gateway + durable enforcement | Oct 12–13 | 14–22h | Dynamic aggregation/routing, identities/key hashing/revoke, role checks, Secret references, audit, timeouts/status, admin registry APIs. Gate: B's next call denied on revoke; healthy tools survive outage; no client-token passthrough. |
| M4 — Dashboard + real chat; Gate A | Oct 13–15 | 14–22h | Team/invitations/keys, server status/tools/CRUD, audit, Gemini/local loop, external host. Gate A: every K/W/G/T/U/A/E core row passes in the real two-user journey; full core walkthrough and clean install. |
| M5 — Complete multi-store bonus | Oct 16–18 | 18–30h | Durable lifecycle/outbox/reconciler, concurrent create, automatic registration, per-store namespaces/quotas/policy/PVCs, retry/recovery/delete. Gate: B01–B07, real compare-orders then verified teardown, restart at partial phases. |
| M6 — Permissions/OAuth/hardening | Oct 19–20 | 18–30h | Full per-role/user tool policy, real external OAuth, encrypted Secret lifecycle, SSRF/admission/non-root/deny-default negative tests. Gate: D02/D03/D06; no policy bypass through search, cached alias or second replica. |
| M7 — Hosted services + many tools | Oct 20–21 | 12–18h | Image-based deployment/delete, sandbox boundary, catalogue selection/search/execute. Gate: D04/D05 with real hosted MCP and labelled large fixture. |
| M8 — Replicas/rate limits/observability | Oct 21–22 | 10–18h | Shared state/rate buckets, session/upstream reconnect, metrics/trace/alerts, load and killed-replica tests. Gate: D07/D08; record actual throughput/latency/resources and failure behavior. |
| M9 — Real VPS/TLS/upgrade/recovery; Gate B | Oct 22–23 | 8–14h | Available genuine free VPS, same-chart deployment, DNS/TLS, image compatibility, upgrade/rollback and backup restore drill. Gate B: all B/D rows pass, including real D01; unresolved free-cloud capacity remains a blocker to this gate. |
| M10 — Release/submission | Oct 24–25 | 8–12h | README/design/threat/runbooks/feature evidence, fresh install and full regression, live video, link access, form. Gate: all S rows plus Gate A and accurate bonus state; target submission Oct 25. |
| Contingency | Oct 26 | Reserved | Only repairs/re-record/upload/access issues; confirmed deadline 11:59 PM IST. |

Overlapping dates are planning windows, not a suggestion to start advanced bonus implementation before the core gate passes. The forecasts above are aggressive targets. A delayed gate shifts dependent work. Free-cloud/OAuth/model compatibility receive short discovery spikes early, while the full implementation follows the mandated order.

If the deadline is approaching with Gate A green and Gate B incomplete, report the exact incomplete rows and actual remaining effort. The employer explicitly prefers a working core. The user still intends the complete product; a deadline-safe submission and subsequent full completion are distinct milestones. Do not submit or describe absent features as present, and do not silently redefine the final product objective.

### Core acceptance scenario and run card

1. Show actual cluster resources, domains, Secrets names, PVCs, probes/limits and enforcement map.
2. A logs in as admin; WooCommerce is pre-registered; register calendar/totals and show distinct aliases.
3. A invites B; B accepts as member and self-generates a key. Show reveal-once behavior without exposing the value on video.
4. A asks chat to publish “Urumi Demo Mug” at ₹199. Show actual MCP call, created ID and storefront product.
5. Buy it manually with COD; show order ID in WooCommerce admin.
6. A asks today's Asia/Kolkata orders and gets the same order with correct attribution.
7. B connects external client using gateway URL/key only, lists all tools and asks orders. Run calendar→WooCommerce (and optionally totals) in one real model-backed prompt.
8. Disable totals while B's key is still valid; refresh catalog and show tool disappearance plus cached-name rejection.
9. Kill calendar pod; capture unreachable and healthy Woo calls. A Deployment may replace the pod quickly; rehearse detection and label any separately sustained scaled-to-zero outage accurately. Restore it.
10. Revoke B's key; B's next call on its existing connection fails. A remains functional.
11. Show persisted success/error/rejection audit under correct users; explain a request's credential/policy flow and residual risks.

Do not use unrelated third-party shopping accounts or real payment/customer data. Unique seeded demo names and captured IDs make rehearsal repeatable. Model/provider failures need actual troubleshooting/re-recording, not replacement with a deterministic fake.

### All-bonus demonstration

After the core path: provision two stores concurrently; show namespaces/quotas/limits, create orders and compare via chat; demonstrate cross-store network denial, restart/retry evidence and delete one with resources/tools gone. Then prove OAuth/permissions, hosted MCP lifecycle, large-tool selection, replica/rate-limit correctness, diagnostics, actual free VPS/TLS and compatible upgrade/rollback.

Suggested video is 12–18 minutes if the form permits, with a short required-flow spine and concise bonus evidence. Put detailed automated run output and architecture explanation in the repo; make the main video clearly cover all mandatory points. The form could not be read through the web tool during this run, so upload limits/video length requirements remain unverified and must be checked at M0/M10. No form submission occurred.


## 12. Creative product expansion after all bonuses

Start substantive creative implementation **after Gate B**. Keep this phase as a product programme rather than a promise that an unlimited product roadmap fits the assessment deadline. No bonus is silently removed to make room for these ideas. The listed programme adds concrete milestones and acceptance gates; scope beyond it is handled through explicit product decisions.

| Product milestone | Capability | Acceptance gate / scale trigger |
|---|---|---|
| C1 — Gateway Flight Recorder | Live topology and request timeline from actual audit/trace data; identity/policy/routing/failure explanations | Click a real A/B request and inspect each step, elapsed time and source; secret/PII redaction; interrupted writes shown unknown. Read-only replay never reruns mutations. |
| C2 — Explainable policy and action preview | “Why was this tool denied?” plus dry-run policy evaluation and explicit destructive-action confirmation | Same policy engine explains execution result; previews cannot grant permission; approvals bound to exact actor/tool/arguments/version and expire. |
| C3 — Store/connection Doctor | Operator diagnostics for DNS/TLS/readiness/credentials/PVCs/catalog freshness with recommended repair | Diagnose controlled failures correctly; read-only by default; remediation is authorized/audited and cannot cross tenants. |
| C4 — Workflow studio | Versioned multi-tool playbooks for catalog updates, sales reporting and store operations | Typed inputs, policy checks at each step, replay/retry semantics, approval boundary and provenance; no arbitrary shell/eval exposed to members. |
| C5 — Integration registry | Connector packages, capability manifests, schema/version review, compatibility tests and safe upgrades | New non-Woo source plugs into the same gateway contract; unreviewed schema/image rejected; public marketplace trust is separately defined. |
| C6 — Enterprise organization | Multi-team/tenant onboarding, MFA/SSO federation, service accounts, exports/retention and account deletion | Tenant/isolation test suite, audited admin events, identity federation, complete deletion/export and billing-independent quotas. |
| C7 — Reliable operating platform | Backup/PITR restore, HA database/storage, independent nodes, runbooks, disaster drills and incident views | Measure RPO/RTO/availability on actual independent failure domains; no public SLO without evidence. Free resources may limit demonstration but not design scope. |
| C8 — Scale and efficiency | HPA/KEDA, connection/admission budgets, caching/catalog search, capacity forecasts and fair scheduling | Measured scaling curve, no wrong-user caches, revocation consistency, bounded queue/backpressure, verified resource budget. |
| C9 — Hardened public hosting | Sandboxed untrusted MCP workloads, signed registry policy, egress controls, abuse mitigation and credential rotation | Hostile workload tests and threat review; namespace/non-root alone cannot close this gate. |
| C10 — Developer/product experience | SDK/CLI, connector templates, API docs, onboarding tour, accessibility/mobile console and evidence export | Fresh user completes documented first store/client flow; keyboard/screen-reader checks; usable failure recovery and generated compatibility report. |

C1–C3 are the strongest initial creative differentiators because they turn complex internals into understandable operational evidence. C4–C10 make the system a broader platform. Choose one cohesive product design language and test the user journeys; a large collection of superficial screens does not meet these gates.

Effort estimates for C milestones should be made after Gate B with measured architecture constraints and user priorities. An initial C1 allowance of 12–20 hours is a provisional estimate. Multi-node HA, public hostile-image hosting, enterprise retention/legal review and sustained large-scale operation cannot be guaranteed under permanently zero infrastructure spend. Keep the engineering architecture ready while truthfully separating locally testable features from externally resource-limited demonstrations.

