# External MCP clients

The product endpoint is `https://relay.localhost:18443/mcp`. A personal client supplies only that URL and its user's Bearer key. Ordinary local DNS and explicit project-CA trust are transport prerequisites, not upstream credentials. No private MCP URL, Woo key, database password or team-actor header belongs in the client configuration.

## Reproducible local reference client

Copy `infra/local/demo-client.example.json` to ignored `.local/demo-client.json`, set mode 0600, and paste B's freshly self-issued key privately. Never place it on a command line or show the configuration during recording.

```sh
node scripts/demo-client.mjs list
# Substitute the actual order ID captured from your checkout.
node scripts/demo-client.mjs call woocommerce get_order '{"order_id":53}'
node scripts/demo-client.mjs call calendar day_range '{"timezone":"Asia/Kolkata"}'
node scripts/demo-client.mjs call totals sum_amounts '{"currency":"INR","amounts":["0.10","0.20"]}'
```

The displayed 53 is the October 22 release test's actual order, not a fixed ID for another installation. Capture the current ID when recording. The helper uses the pinned official SDK and explicitly scoped local CA/loopback resolver. It finds a permitted alias through server-owned tool metadata; it never guesses a hash. It does not call a model or consume provider credit.

## Independent MCP Inspector

The release acceptance uses the independently installed MCP Inspector 2.10.1 CLI against `https://localhost:18443/mcp` (the real additional Ingress hostname, covered by the local certificate), with B's own key and `NODE_EXTRA_CA_CERTS` pointing to the project CA. Temporary config/storage stay ignored mode 0600 and are wiped afterward. Initialize,24-tool discovery while two stores exist, and the actual core Woo order retrieval are recorded in `docs/evidence/m10/inspector.json` after passing.

The final model reference host separately provides its Gemini credential/credit guard and executes all tools through the same gateway using B's personal key. That is distinct from Inspector protocol compatibility. Neither is a claim of an installed Claude Code or Cursor host. Key revocation must reject the next request; use a newly issued key for a later demonstration instead of reactivating a revoked key.

## OAuth

As A, open Settings → OAuth client connections → Register client. Enter the exact public client's callback URI and copy the public client ID. No client secret is issued. The tested host is the pinned official MCP SDK client with a real loopback callback and Chrome login/consent. It follows protected-resource/authorization-server metadata, uses S256 PKCE, validates callback state/issuer, exchanges the native code and calls real tools. Open dynamic registration, machine grants and arbitrary client metadata are disabled.

See `security-oauth-client.mjs` and M6 evidence for exact tested behavior. Native access tokens last 300 seconds, refresh rotation/reuse/revocation and client disabling are tested, and live membership/session/policy apply to OAuth as to keys. Client compatibility beyond the recorded official host must be tested rather than assumed.
