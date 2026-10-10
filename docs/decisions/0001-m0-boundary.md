# ADR 0001: A real transport proof before platform features

Status: accepted for M0, 2026-10-10.

Keep the TypeScript/Fastify/official SDK v2 baseline. Publish only an M0 `ping` tool in `apps/gateway/src/proof-server.ts`, then prove it through a Helm-managed Ingress. Initialize the needed gateway and MCP-client workspace packages. Other requested directories stay explicitly unimplemented. No broad service scaffolding or fake business results.

One isolated cluster uses a private kubeconfig and loopback Ingress. Enable Secret encryption and test real storage/network behavior early because these are environment capabilities, not evidence of the later complete security bonus. No unrelated resources may be removed. All existing containers/volumes are preserved.

The handwritten WooCommerce adapter starts at M2; the store starts at M1. M0 must stop at its acceptance checkpoint. Optional product ambitions stay in the ledger.
