# ADR 0002: Tested compatible package versions

Status: accepted for M0, 2026-10-10.

The published official MCP split packages are available: server/client 2.3.1, Fastify adapter 2.0.1, Node adapter 2.1.1. Keep v2; no v1 tutorial or monolithic SDK substitution.

The initial TypeScript 7.0.2 resolution failed `pnpm peers check`: typescript-eslint 8.71.1 supports TypeScript below 6.1. Choose stable TypeScript 6.0.3 and rerun all checks, preserving strict and exact optional property checks. Refine the SDK’s Node request bridge with routed method/url values rather than using a cast or weakening compiler settings.

@types/node 24.19.2 was less than 24 hours old and rejected by the package release-age policy. Use 24.19.1. Keep the policy. Inspector’s exact 2.10.1 install script was inspected: it exits when installed under node_modules and does not cascade client installs. Allow only that exact package/version to run its install script; no blanket build permission.

The system Node executable is 24.16.0; the configured pnpm runtime uses 24.19.0. Both are Node 24 LTS. The application container is pinned to Node 24.16.0 and an OCI digest. Record both host execution versions rather than pretending they are identical. The engine range admits those tested Node 24 patches; `.node-version` specifies the application patch.

See [dependency provenance](../evidence/dependency-provenance.json), the lockfile and executed check evidence. No package/image uses an unrecorded `latest` tag.
