# Project engineering policy

- Use the employer requirements, requirement ledger, architecture decisions and verified implementation as the technical baseline.
- Inspect existing code and milestone evidence before changing behavior. Preserve working integrations and application data.
- Build complete vertical slices with real Kubernetes, WooCommerce, MCP and model integrations. Never present mocks or placeholder success states as production behavior.
- Keep credentials in ignored local configuration and Kubernetes Secrets. Enforce identity, membership and permissions on the server.
- Run meaningful checks, record actual failures and results, and maintain small, reviewable commits.
- Keep source, evidence and documentation suitable for public publication. Do not commit workstation identities, private correspondence, personal account metadata or private preparation documents.
- Treat source-control privacy redaction separately from runtime changes. Do not weaken authentication, network isolation, certificate validation or admission controls to pass tests.
- Keep the complete M0–M10 and C1–C10 roadmap. The assessment release implements M0–M6; remaining milestones stay planned and must not be presented as complete.
- Cloud hosting is unverified. Do not enable paid infrastructure or provider traffic without an explicit bounded configuration.
