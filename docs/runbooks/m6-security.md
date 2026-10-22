# M6 security operations

Use the project-local tools and explicit kubeconfig. The local console is https://relay.localhost:18443; the original shop is https://store.relay.localhost:18443. Trust is limited to `.local/relay-ca.crt`. External clients must explicitly load that CA. Browser acceptance pins only the current project leaf keys in isolated test browser contexts; it does not establish system trust or public certificate validity.

## Bootstrap and reproduce

Follow the base environment/cluster and Secret setup runbooks, preserving existing private backups. `bash scripts/security-pki-setup.sh` fetches the exact signed chart and checks both the pinned SHA256 and signer fingerprint, installs the bounded certificate controller and bootstraps the owner-checked local CA. `node scripts/run-acceptance.mjs scripts/security-ingress-setup.mjs` creates only explicit project trust and the loopback HTTPS mapping. `security-data-tls-config.mjs` prepares a separate Redis TLS configuration, retaining the original Secret/password for compatible rollback. `security-deploy.sh` runs the full checks, builds/imports source-fingerprinted images, migrates the vault idempotently, and deploys the security values. The M6 Helm profile enables OAuth, authenticated internal TLS, native data TLS and HTTPS-only upstreams.

The local security store image is built from the exact contents of `infra/store`; record its source hash and reviewed wpdb bridge hashes. Do not use the legacy root-entrypoint image with `runtime.nonRoot=true`. WordPress/bootstrap run as33 and MariaDB as999 with explicit writable paths and persistent UID-compatible content. The version-guarded wpdb change supplies native verified mysqli TLS; unknown core driver hashes fail closed. WordPress upgrades must review that bridge again.

Migration0009 must be included in the actual runner and readiness gate. It retains the legacy store function for compatible older clients while the new API calls the explicit-scheme signature. Never mark an API rollout healthy merely because the pod is Running. Fresh store desired state freezes its transport/image/profile; retained-store migrations require namespace/PVC/Secret ownership checks and normal durable reconcile. Do not silently rewrite persisted image selections on a routine platform redeploy.

## Leaf renewal and native reload

Install the pinned operator utility using `bash scripts/security-cmctl-fetch.sh`. Use `.tools/bin/cmctl renew CERTIFICATE -n NAMESPACE` to request genuine native renewal; wait for a changed Secret serial and Ready Certificate. This also works for imported Secrets without an associated CertificateRequest. Changing duration alone does not reliably trigger renewal in that case. Do not delete Secrets or fabricate Ready conditions to force a pass.

Node HTTPS service contexts reload a consistent projected cert/key generation. PostgreSQL, Redis, PHP/mysqlnd, Apache and existing SQL/cache clients need explicit native reload or controlled rollout after the new projection arrives. Use a maintenance window and restart one store at a time; retain a callable independent upstream. Restart data services, wait for readiness, then roll API/gateway/provisioner clients. For a store, roll database, WordPress and adapter, verify checkout/order/product/marker and unchanged PVCs. `security-certificate-rotation.mjs` is the acceptance exercise for these paths. Leaf renewal preserves the CA; root CA rotation is a separate reviewed overlap/trust-distribution procedure and is not claimed by leaf tests.

Certificate-manager renews before expiry; check projected/live certificate serials and finish native reloads inside that renewal window. This deployment does not claim a zero-downtime single-node database rotation or a later observability/rotation scheduler milestone.

## Credentials, policies and incident checks

Upstream credentials are write-only immutable references inside an authenticated encrypted Kubernetes Secret. Runtime keyring access is limited to API/provisioner; gateway receives only execution-time headers, not vault decryption keys. Registry revisions bind credential retrieval. Endpoint changes require an explicit fresh credential or clearing. Rotate via management, confirm the new real service call, and let reachability/grace-period garbage collection retire the old envelope. Keyring rewrap and old-key retirement are separate operations; never discard the only key for a live envelope.

Use current membership/session checks inside the same tenant transaction as management mutations. Tool allow rules never grant administrator management. Deny wins over allow across discovery/search/direct calls/chat. Native OAuth token, resource, session, client and membership checks remain active on every request; disabling the client affects existing tokens immediately. Preserve API-key compatibility and never re-enable an old revoked demonstration key.

The destination resolver validates all DNS answers, pins a literal address, keeps original Host/SNI, rejects redirects/private external addresses, and bounds bytes/time/sockets. MCP data and descriptions remain untrusted. A server can legitimately see its own stored credential and can encode arbitrary covert output; redaction is not a proof of general data-loss prevention or prompt-injection immunity.

`security-at-rest.mjs` writes an ephemeral Secret, checks actual encrypted SQLite/Kine bytes and deletes its sentinel/private temporary copy. The native K3s status command must unset the stale short `K3S_TOKEN` environment so it reads the current server token file; do not print the token. Do not rotate production datastore encryption keys merely to run this test.

## Disk and recovery

Inspect headroom before builds. Preserve personal files, credentials, PVCs, backups, known-good release images and unrelated resources. A full disk can stop Docker and evict local iCloud-backed files. Reclaim only disposable download/build caches and explicitly inventoried unused project candidate images. Never reset Docker or delete its data disk. If the engine has stopped, use supported stop/start controls, then verify the existing cluster, service readiness, stores and all persistent IDs before resuming acceptance. The local host's stale kubelet capacity can differ from the owned Docker container's actual4GiB limit; report both honestly.
