# System design and tradeoffs

## Responsibilities and request path

React is a client of the control API. It has no upstream, database, provider or Kubernetes credential. Better Auth establishes the browser session; the API rechecks active team membership and management role on the server. PostgreSQL row-level security and narrow SQL capabilities enforce tenant/owner boundaries.

The gateway is an MCP server at `/mcp` and an official MCP client to each registered Streamable HTTP server. It authenticates a hashed personal key, a provider-native OAuth token or short-lived trusted chat delegation. It resolves current membership and policy, discovers allowed tools, routes the selected immutable alias, obtains only that registration's execution credential privately, and writes durable audit admission/outcome. The caller's key/cookie/token is never used as the upstream credential.

The handwritten WooCommerce adapter calls Woo REST for products/orders with a scoped store identity. It does not install an MCP plugin or bypass Woo order logic with database writes. Calendar uses IANA timezone-aware UTC bounds; Decimal Totals uses integer minor units and decimal strings. Customer/private order metadata is omitted.

## Aggregation and failure independence

Aliases incorporate immutable server identity and the original tool name. Renaming a server preserves routing; identical `info` names from three upstreams remain distinct. Managed stores use their full UUID without hyphens, so store identities cannot collide by a short display name.

Discovery is cached and bounded per upstream. A slow/dead server has its own deadline and diagnostics; it does not suppress another healthy server's tools. Execution rechecks enabled state and current policy even for cached aliases. Removing/disabling a server immediately prevents new routes. Results/errors have size/schema limits and safe reason codes; an interrupted write is an unknown outcome to reconcile, not an invitation to retry blindly.

The official v2 SDK owns protocol parsing/negotiation. Actual evidence covers modern and legacy Streamable HTTP clients. The gateway is stateless between requests; optional streaming GET may return405 and is not advertised as successful catalog notification support.

## Real model loop

The API stores owner-scoped runs/events, reserves the shared bounded allowance before each provider request, and calls Gemini with strict request/output/tool-step limits and no automatic retry. It discovers and calls only through the gateway, using server-derived session identity. The model cannot choose a user/team identity. Actual tool arguments, outcomes, durations and audit correlations drive the inspector; it is not the future full Flight Recorder.

The external reference host separately supplies its model credential and guard. Its MCP configuration contains only the gateway URL and B's personal key. Independent MCP Inspector compatibility is separate from a model-backed host demonstration.

## Durable store lifecycle

PostgreSQL stores desired state, operations, outbox, phases, leases and generation fences. BullMQ dispatches work, while reconciliation repairs lost/stale queue work against the durable desired state. Idempotency and per-store/owner locks avoid duplicate stores and enforce limits across teams. The restricted provisioner creates a namespace, quota/limit range, Secrets, TLS, Helm store/database/PVCs/Ingress and private adapter, then registers it with the gateway.

Deletion first hides routes transactionally, drains bounded calls, uninstalls owned releases and verifies resource/storage cleanup before reporting Deleted. Historical audits remain durable. The application does not strip unknown finalizers. Namespace isolation is backed by actual network/admission/RBAC tests, not by naming convention alone.

## Security and deployment choices

Service mTLS complements user authorization; it does not replace it. PostgreSQL uses dedicated role client certificates plus SCRAM. Redis requires its password and service certificate. Upstream credentials are immutable revision-bound AES-GCM envelopes in an encrypted Kubernetes Secret; the gateway has no vault keyring. SSRF checks all DNS results and pins the dial address with original Host/SNI. Raw bounded JSON/SSE checks run before SDK normalization.

One node, RWO volumes and explicit native-client certificate reloads keep the assessment understandable and reproducible. They trade away HA and automatic failover. Reviewed WordPress/mysqlnd compatibility changes require known file hashes and explicit upgrade review. Same-chart k3s configuration is documented; actual VPS, public certificate automation and different-architecture image execution are not inferred from local rendering.

See the requirement ledger, exact versions, ADR0010–0015 and the threat model for evidence and residual risks.
