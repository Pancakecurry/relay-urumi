# Release status

The M0–M6 application is verified locally against real Kubernetes, WooCommerce, MCP and model integrations. The implementation includes the persistent store, three independent upstreams, team gateway, React control room, real tool-loop chat, multi-store provisioning, permissions, native OAuth and security enforcement.

The [evidence index](TEST_EVIDENCE.md) covers the actual two-user journey, COD checkout/admin verification, external client, audit attribution, key revocation, cached-alias rejection, upstream failure isolation, concurrent provisioning/recovery/deletion, negative security tests and independent clean installation. Root checks pass 42 tests plus lint, strict types and production build. Three additional credential-scanner controls and repeated real TLS/MCP renewal tests pass.

Public cloud hosting is **not deployed**: the free compute candidate returned unavailable host capacity. No cloud URL or VPS acceptance is claimed. Local/production Helm values have been linted and rendered from the same templates.

A technical demonstration is in [the walkthrough](../demo/WALKTHROUGH.md). Silent QA recordings are genuine supplementary evidence; they do not constitute a complete narrated uploaded submission video. External video upload and actual assessment submission are not verified here.

M7–M9 and C1–C10 remain [planned roadmap work](ROADMAP.md). Known limits include single-node/local-path storage, controlled reload for native certificate consumers, unimplemented root-CA rotation/HA/disaster recovery and no universal branded OAuth-client compatibility claim.

Public evidence omits workstation identities and private account metadata. `[PROJECT_ROOT]` and `[LOCAL_HOME]` mark redacted paths; test outcomes are preserved. [Source mapping](../evidence/publication/source-map.json) connects historical evidence IDs to privacy-cleaned progress commits.
