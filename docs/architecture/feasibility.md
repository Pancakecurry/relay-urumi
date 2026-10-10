# M0 compatibility and external feasibility

| Spike | Executed result | What remains |
|---|---|---|
| Official SDK/Fastify/Streamable HTTP | Modern and legacy real calls pass through local Ingress | Aggregation, identity, audit and actual upstreams at M2–M3 |
| Independent MCP host / headers | Inspector CLI uses private config bearer header; real `ping` passes | Chosen owner's external AI host/account, full two-user demonstration and OAuth remain unverified |
| Better Auth | 1.7.7 works with real in-memory SQLite and explicitly enabled Origin/CSRF checks | Fastify control API handler + browser cookies + PostgreSQL/Drizzle migrations at M3–M4 |
| Kubernetes | Ready node; DNS, Ingress, Secret volume, encryption-enabled status, network allow/deny, retained PVC data pass | Stateful store behavior, backup/restore, production storage and full tenant isolation |
| Local model | No runtime/model download performed | Review additional disk/RAM and tool-capable model before installing if needed |
| Free VPS | Documentation only; no account accessed, capacity reserved or service provisioned | Genuine free capacity, owner approval for account access, DNS and k3s deployment |

Better Auth's documented Fastify integration uses its handler/session APIs; select HttpOnly cookies for interactive identity and platform-owned hashed personal API keys for external MCP. The session spike proves library behavior, not the final cookie/CORS/proxy configuration. Postgres integration remains pending. See [Fastify integration](https://better-auth.com/docs/integrations/fastify) and [session ADR](../decisions/0003-session-strategy.md).


Oracle's documented Always Free Ampere allowance can potentially host a modest test stack (currently 2 OCPU/12 GB total and 200 GB block storage), but region capacity and account eligibility are unknown and idle resources may be reclaimed. This is an option, not acquired capacity or a promise of uptime. See [official Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). Tiny shared/free VMs need an actual memory/disk review before selecting them for the complete stateful stack. D01 stays planned and unverified. Production values in this repository are renderable examples only.

No non-core VPS/OAuth/local-model uncertainty blocks the local M0 MCP proof. No core employer feature is declared complete on the strength of these spikes.
