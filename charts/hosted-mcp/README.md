# Hosted MCP chart

M2 uses the same templates for three independently deployed private ClusterIP services. A pinned image is required; no Ingress is generated. Gateway namespace AND pod selectors guard ingress. Non-root read-only workloads mount only their own credentials. See ../../docs/runbooks/mcp-upstreams.md. Arbitrary hosted-server provisioning remains future work.
