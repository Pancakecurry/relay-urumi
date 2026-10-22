# Resolved M0/M1/M2 versions — 2026-10-10

The exact installed dependency graph, including transitives and package integrity hashes, is `pnpm-lock.yaml`. Root/workspace manifests use exact direct versions, with no caret/tilde ranges. Registry provenance and documentation links are in [dependency-provenance.json](evidence/dependency-provenance.json). Versions of future-only components are deliberately not presented as installed or tested.

| Component | Exact selected / observed version | Verification |
|---|---|---|
| macOS / architecture | 27.0.1 / arm64 | environment inspection; native ARM image built and run |
| Node.js | 24.16.0 | `.node-version`, `node --version`, `pnpm exec node --version`; container also uses this patch |
| pnpm | 11.25.0 | root `packageManager`, frozen install, peers check, image build |
| Docker Engine | 29.2.1 | `docker info`; existing desktop installation reused |
| k3d | 5.9.0 | downloaded darwin-arm64 binary, official checksum verified |
| Helm | 4.3.0 (`gbec5b06`) | official tar checksum, lint/template/install/upgrade |
| kubectl | 1.37.1 | official binary checksum; actual server queries |
| k3s / Kubernetes | v1.37.1-k3s1 / v1.37.1+k3s1 | explicit cluster image; Ready node and deployed resources |
| MCP server / client | `@modelcontextprotocol/server` 2.3.1 / `@modelcontextprotocol/client` 2.3.1 | exact installed definitions, strict compilation and real calls |
| MCP Fastify / Node adapters | 2.0.1 / 2.1.1 | `@modelcontextprotocol/fastify`, `@modelcontextprotocol/node`; deployed path |
| Independent host | `@modelcontextprotocol/inspector` 2.10.1 | CLI connection/catalog/ping, config-based bearer header |
| Fastify | 5.12.5 | real loopback and deployed server |
| Zod | 4.6.5 | deployed ping schema and invalid-input test |
| Better Auth | 1.7.7 | isolated real SQLite signup/session/forgery/signout/origin test |
| TypeScript / Node types | 6.0.3 / `@types/node` 24.19.1 | strict typecheck/build |
| ESLint / JS preset | 10.12.0 / `@eslint/js` 10.0.1 | lint |
| typescript-eslint | 8.71.1 | compatible TypeScript peer range; lint |
| Vitest | 5.0.3 | nine executed tests including three budget guard tests |
| Platform chart / proof app | 0.0.1 / 0.0.0 | initial proof only; not a full platform release |

k3d's `version` command reports its default k3s 1.35.5-k3s1; this deployment explicitly uses 1.37.1-k3s1. The pre-existing global kubectl was 1.34.1 and was preserved; scripts use the project-local 1.37.1 client. A bundled Node 24.19.0 launcher was observed during initial tool inspection; the final `pnpm exec node` resolves 24.16.0. No compatibility claim for unexecuted OS/CPU combinations is made.

## Checksummed host tools

| Artifact | SHA-256 |
|---|---|
| k3d darwin-arm64 5.9.0 | `fe106541d5d0a3f18debcd4d432a16f8c0ce3e6ddc06f8fbb6f696a122313e00` |
| Helm 4.3.0 darwin-arm64 tarball | `d3870437e1e95b67f8edbde964156c84a26503f560821d40c542441658934fba` |
| kubectl 1.37.1 darwin-arm64 | `fd65982c97ddad3106754b69ffa196d0e543aa591930ae52aed1adfb92f8c77f` |

Actual verification output: [tool-bootstrap.txt](evidence/tool-bootstrap.txt). Downloads use official release checksum files; no global tool is replaced.

## Images and protocol

Both Dockerfile stages pin `node:24.16.0-alpine3.23@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14`. The proof image uses a deterministic content-derived tag, currently `relay/m0-proof:m0-9a981955b6f472ea`; the observed runtime image ID and every bundled system image/tag/digest are recorded in [cluster-image-identities.json](evidence/cluster-image-identities.json). The build/tag script prevents reusing a stale fixed tag after source changes. Kubernetes system images are supplied by the exact k3s release, rather than separate untested version overrides. Only native arm64 execution was performed; amd64 is a later deployment check.

The automatic v2 client uses modern `server/discover` and protocol `2026-07-28`. Explicit legacy negotiation initializes protocol `2025-11-25`. Both discover and call the real tool through Ingress. No session ID is issued by this stateless proof; legacy's optional GET receives 405 while tool POSTs succeed. Inspector independently verifies its host/header configuration, but uses the official SDK family underneath; it is not evidence of a separate protocol implementation. See [official-client.txt](evidence/official-client.txt) and [inspector-client.json](evidence/inspector-client.json).

`pnpm deploy --legacy` in the Dockerfile selects pnpm's workspace packaging mode. It does not select an older MCP SDK or protocol.

## Historical M0: not installed / not yet locked

React/Vite/TanStack Query, PostgreSQL/Drizzle, production k3s configuration and any local model runtime are future milestones. Pin their exact packages/images when implemented and verify them at the corresponding gate. M0's Better Auth SQLite database is an isolated test; PostgreSQL remains the application baseline.

The tested Gemini model is `gemini-3.5-flash-lite`, a stable model ID rather than an immutable weight revision; both actual responses report that `modelVersion`. The isolated spike uses the official REST `v1beta/models/...:generateContent` contract, with no new Gemini SDK dependency. See [model-feasibility.json](evidence/model-feasibility.json), [actual loop evidence](evidence/gemini-spike.json) and [Gemini runbook](runbooks/gemini-setup.md). Official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [REST reference](https://ai.google.dev/api/generate-content), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking) and [standard pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on 2026-10-10. Provider billing totals remain unverified.

## M1 store pins — October 10, 2026

| Component | Exact immutable/version selection | Evidence |
|---|---|---|
| WordPress/PHP packaging | `wordpress:7.1.3-php8.3-apache@sha256:8ecd8d8e374167ea22235acf30f80d1165b82f07ffa5bcef90c1cad8f7be251f` | Reviewed official index; native arm64 image build and real store |
| WP-CLI source image | `wordpress:cli-2.12.0-php8.3@sha256:36243da432a0f0a3b56dc3240ecee9b159108d71305e7c064d987a20a465bfde` | Official image; PHAR copied into same PHP runtime |
| WooCommerce | `11.2.1`; download SHA-256 `5317434cb381b5fdc7c1dd6ee258324f08c390976aaf8d1199f2a0e9a3ab8586` | Official plugin API/tag/download; Docker ADD checksum verified; runtime WC_VERSION |
| MariaDB LTS | `mariadb:11.8.9-noble@sha256:6422478cb8e159f080fb1d8ccf65101e26fe51385787fde7d16c3b165a331f15` | Official manifest; running version/healthcheck/store persistence |
| Dockerfile frontend | `docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e` | Actual builder resolution, then pinned |
| Store chart | `0.1.0`, appVersion `7.1.3-woocommerce11.2.1` | Helm lint/server dry-run/clean install/upgrade |
| Browser test runner | `@playwright/test` / Playwright `1.64.0` | Exact manifest/lock graph; real existing Google Chrome channel, no browser download |

Derived `relay/store:m1-<source hash>` is built from sorted `infra/store` filenames/contents, imported into the local cluster and selected by deploy script. The chart default records the current tested content tag. Exact pod runtime imageID, PHP patch, WP-CLI and MariaDB version strings and browser version are in `evidence/m1/inventory.json` and `evidence/m1/checkout.json`; they are actual execution evidence, not inferred tags. Multi-platform source indexes are pinned, but only arm64 deployment was executed. Production registry digest must be supplied after an authorized publication; the example is not a published image.

Official sources reviewed: [WordPress image](https://hub.docker.com/_/wordpress), [WordPress release archive](https://wordpress.org/download/releases/), [MariaDB image](https://hub.docker.com/_/mariadb), [WooCommerce pinned source](https://github.com/woocommerce/woocommerce/tree/11.2.1), [WooCommerce authentication](https://developer.woocommerce.com/docs/apis/rest-api/authentication), [WP-CLI commands](https://developer.wordpress.org/cli/commands/), [Playwright 1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0), [Chrome channel](https://playwright.dev/docs/browsers). The guessed WooCommerce release-blog URL did not open; version selection instead used the live official plugin API, pinned Git tag and checksum-verified archive. No unsupported blog claim is used.

## M2 additions — October 10, 2026

`@js-temporal/polyfill` **0.5.1**, transitive `jsbi` as recorded in pnpm-lock.yaml, is the sole new third-party runtime library. It supplies tested IANA/DST calendar arithmetic; BigInt handles money without another arithmetic dependency. MCP server/client remain **2.3.1**, Fastify/Node adapters **2.0.1/2.1.1**, Fastify **5.12.5**, Zod **4.6.5**, Node **24.16.0**, pnpm **11.25.0**. All initialized manifests select exact direct versions. Shared @relay/contracts and @relay/mcp-runtime plus the three apps are internal version **0.0.0**; hosted-mcp Helm chart **0.1.0**. No SDK v1 package is introduced.

The MCP Dockerfile pins the same immutable Node/alpine index as M0. Content-derived relay/upstreams:m2-<hash>, actual arm64 runtime imageID, final manifests, mounts/resources and resolved protocol calls are in evidence/m2/inventory.json, image.txt, acceptance.json and inspector.json. The fingerprint covers runtime source/manifests/Dockerfiles/lock/config, excluding documentation changes. Current M0 rebuild identity is captured in evidence/m2/m0-rebuild.txt; historical M0/M1 snapshots and tags remain preserved. Only this local arm64 cluster is verified.

Primary references reviewed: [official v2 Fastify server API](https://ts.sdk.modelcontextprotocol.io/v2/serving/fastify.html), [SDK client API](https://ts.sdk.modelcontextprotocol.io/v2/api/index/%40modelcontextprotocol/client/), [Temporal docs](https://tc39.es/proposal-temporal/docs/), [polyfill 0.5.1 release](https://github.com/js-temporal/temporal-polyfill/releases/tag/v0.5.1), and pinned WooCommerce 11.2.1 authentication/controller sources linked in ADR 0007. Installed declarations and the locked graph are the exact-version reference; web documentation alone is not interoperability evidence.

## M3 additions — exact installed/runtime versions

- Better Auth and `@better-auth/drizzle-adapter`: **1.7.7**; Drizzle ORM **0.45.4**; `pg` **8.23.1**; types/pg **8.15.6** (development).
- `ioredis` **6.0.0**, Ajv **8.20.0**. All workspace packages/lockfile remain exact; Node 24.16.0, pnpm 11.25.0 and official MCP v2 2.3.1 are unchanged.
- PostgreSQL **18.6-alpine3.23**, index `sha256:885cf05d376c7cf27afef02073e6bdac3841252537f16e244fd1c1e6a7c99fb1`.
- Redis **8.2.10-alpine3.22**, current maintained patch in the selected 8.2 branch, index `sha256:b51665e66f00759be7c3152ad5ac3c66fb2f619c13ef62dea7cc1f9914524635`. An initial 8.2.3 probe was superseded after checking the official supported-tag list; it is not the final deployment pin.
- Platform runtime source fingerprint includes `.ts`, `.sql`, package manifests, Dockerfiles, root config and the frozen lock. Actual tag/image ID and Pod image IDs: `evidence/m3/image.txt`, `evidence/m3/inventory.json`.

Documentation checked during M3: [Better Auth 1.7.7 Drizzle](https://better-auth.com/docs/adapters/drizzle), [Fastify integration](https://better-auth.com/docs/integrations/fastify), [sessions](https://better-auth.com/docs/concepts/session-management), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [PostgreSQL 18 RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [PostgreSQL image](https://hub.docker.com/_/postgres), [Redis image](https://hub.docker.com/_/redis), [ioredis guidance](https://redis.io/docs/latest/develop/clients/ioredis/), [node-postgres pools](https://node-postgres.com/features/pooling), [Ajv security](https://ajv.js.org/security.html). Installed v2 declarations were inspected for Standard Schema, client request options, per-request factories and cancellation; no v1 tutorial APIs were substituted.

## M4 exact additions — October 11, 2026

React/React DOM **19.3.0**; React Router DOM **7.18.4**; TanStack Query **5.104.1**; Radix Dialog **1.2.0**; Lucide React **1.53.0**; react-markdown **10.1.0** (MIT); Vite **8.3.4**; @vitejs/plugin-react **6.1.2**; @types/react and @types/react-dom **19.3.0**; TypeScript **6.0.3**; Prettier **3.9.9**. Direct versions and complete resolved graph are frozen in package manifests/pnpm-lock.yaml. Existing Node **24.16.0**, pnpm **11.25.0**, official MCP v2 **2.3.1**, Fastify **5.12.5**, Better Auth **1.7.7**, Drizzle **0.45.4**, PostgreSQL **18.6**, Redis **8.2.10** and store versions are retained.

AI SDK **7.0.135** and @ai-sdk/google **4.0.93** execute Gemini **gemini-3.5-flash-lite**, a stable ID, not immutable model weights. Actual model/provider events are in m4/chat-create.json, chat-orders.json and external-agent.json. The initial gemini-2.5-flash-lite request failed before tool execution and remains recorded. No costly automatic model fallback exists. Fixed official HTTPS endpoint, request/output bounds and conservative prepaid reservation precede every request. See ADR 0009 and [official thinking limits](https://ai.google.dev/gemini-api/docs/thinking), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [AI SDK Google adapter](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai).

Self-hosted Geist Sans/Mono assets originate from **geist 1.7.2**, retained with the SIL Open Font License under apps/dashboard/src/assets. No Next.js runtime is required. Safe CommonMark rendering uses the [pinned react-markdown README](https://github.com/remarkjs/react-markdown/tree/10.1.0), rejects HTML, and permits safe links with opener isolation.

Runtime fingerprint additionally covers TSX/CSS/HTML/font/static-server inputs. Exact current image, native architecture, digest/image IDs and Kubernetes references: m4/image.txt and m4/inventory.json. Final source reproduction must match that fingerprint. Helm platform chart version is recorded in charts/platform/Chart.yaml. Playwright **1.64.0** uses the installed Chrome channel; screenshots record genuine browser output.

## M5 additions — October15

BullMQ6.3.12 is pinned in the root and shared runtime manifests/lockfile; tested with existing ioredis6.0.0, Redis8.2.10 and Node24.16.0. Optional msgpackr-extract build is explicitly disabled; actual queue operations and restart/loss tests use the supported JavaScript path. The controller embeds Helm4.3.0, verified download SHA256 arm64 `31c5794dd55c66a51e6b7d2e2ac7a114ae8b1de41ff1d9ba51748ac973b06a08`, amd64 `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb`. Only native arm64 was executed. Kubernetes metrics use the running Metrics API v1beta1; missing samples remain explicitly unavailable. No frontend framework or MCP dependency generation changed. Current image fingerprints are recorded in evidence/m5/images.txt after deployment.

Final M5 native arm64 runtime and embedded chart fingerprint is recorded in `evidence/m5/images.txt`; PostgreSQL/BullMQ/Helm and all other exact dependency pins above are unchanged. The final UI-only wording correction does not change lifecycle or security behavior. M5 live/regression, frozen source reproduction and credential-scan evidence supersede M4-only image references for the current runtime.

## M6 additions — October16, in progress

`@better-auth/oauth-provider` **1.7.7** and `jose` **6.2.3** are pinned exactly in the root manifest/lock after registry peer checks against Better Auth1.7.7. Installed declarations are inspected before integration. Official sources: [OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider), [JWT encryption/rotation](https://better-auth.com/docs/plugins/jwt), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization). No M6 live acceptance is claimed from dependency installation.

M6 certificate compatibility spike: cert-manager chart/app1.21.2, signed chart SHA25673a56e1728edd6c99f1f31082618c3259d279a76b7ebd3d4bdc5475c2442d34a, signing fingerprint1020CF3C033D4F35BAE1C19E1226061C665DF13E. Four exact image-index digests are recorded in `infra/local/cert-manager-values.json`. Published support matrix ends at Kubernetes1.36; observed local1.37 issuance/TLS/renewal compatibility is recorded without a vendor-support claim. Native Node TLS1.3 and AES-256-GCM use the pinned Node24.16.0 runtime; no crypto dependency is invented.

M6 operator renewal utility: cmctl2.6.1, macOS arm64 artifact SHA256 `158413ab2f8466c2680317a9618396ed206f4207451d6c24f6f14ccdc6788d4e`; fetched from the [official release](https://github.com/cert-manager/cmctl/releases/tag/v2.6.1) and matched to its published checksums. `scripts/security-cmctl-fetch.sh` reproduces the selected artifact. This is an operator client, not an additional runtime service. Native manual renewal is documented in [cert-manager's CLI reference](https://cert-manager.io/docs/reference/cmctl/); imported certificates without CertificateRequests require that path rather than assuming a duration edit forces reissue.

## Final M6/M10 verified release — October 22, 2026

All existing package and image pins remain. Core Helm revision41 runs `relay/platform:m6-99a36532c5ab56f3` and `relay/provisioner:m6-99a36532c5ab56f3`; rootless WordPress image `relay/store:m6-5698c668ea0141c1`. Exact image IDs/digests remain in `evidence/m6/images.txt` and deployment inventories. Nine database migrations and42 tests pass. Native arm64 is tested; amd64/public VPS is not claimed.

Official Playwright1.64.0's optional FFmpeg artifact build1013 (`n7.0.1`) was installed for genuine browser QA recording. It is a workstation recording tool, not a runtime service. The actual silent clips are supplementary evidence; a full narrated/uploaded assessment recording is still required. No dependency or framework generation was changed during final QA.
