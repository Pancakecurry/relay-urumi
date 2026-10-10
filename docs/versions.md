# Resolved M0 versions — 2026-10-10

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

## Not installed / not yet locked

React/Vite/TanStack Query, PostgreSQL/Drizzle, WordPress/WooCommerce/MariaDB, production k3s configuration and any local model runtime are future milestones. Pin their exact packages/images when implemented and verify them at the corresponding gate. M0's Better Auth SQLite database is an isolated test; PostgreSQL remains the application baseline.

The tested Gemini model is `gemini-3.5-flash-lite`, a stable model ID rather than an immutable weight revision; both actual responses report that `modelVersion`. The isolated spike uses the official REST `v1beta/models/...:generateContent` contract, with no new Gemini SDK dependency. See [model-feasibility.json](evidence/model-feasibility.json), [actual loop evidence](evidence/gemini-spike.json) and [Gemini runbook](runbooks/gemini-setup.md). Official [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [REST reference](https://ai.google.dev/api/generate-content), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking) and [standard pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on 2026-10-10. Provider billing totals remain unverified.
