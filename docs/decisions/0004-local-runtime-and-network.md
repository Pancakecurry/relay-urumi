# ADR 0004 — Local executable cache and explicit network names

Status: accepted at M0; macOS arm64 only.

Downloaded executable tools in synced Documents were killed with SIGKILL; kernel messages showed file-provider rehydration and code-signature loading errors. Compiler/linter file reads also stalled there. Only this project's installed tools and dependency directory were moved to a non-synced project cache, with ignored symlinks from the repository. `scripts/local-cache.mjs` makes that setup reproducible and refuses to replace normal directories. No security policy, quarantine setting, unrelated resource or personal file was changed.

The MCP SDK rejects unapproved Host headers. Kubernetes health probes explicitly use `localhost`; the allowed in-cluster client uses the actual Service DNS name `relay-m0-proof.relay-m0.svc.cluster.local`, which is explicitly allowed. The unapproved Host/Origin negative tests continue to pass. Future upstream endpoints must get their own documented routing and authorization policies.

k3d initially published its administration port on all interfaces even though Ingress was loopback-only. The actual dedicated load balancer was repaired using separate port-delete and port-add commands (combined operations are unsupported). The k3s node, namespace, Secret and PVC were preserved. Future cluster config explicitly sets `kubeAPI.hostIP` to `127.0.0.1`; setup and capabilities check both API and Ingress bindings. This does not establish production TLS or multi-tenant security.

Evidence: `docs/evidence/api-binding-repair.txt`, `cluster-capabilities.json`, `checks.txt`, `reproducibility.txt`.
