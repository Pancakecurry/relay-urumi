# ADR0012 — authenticated, immutable credential references

Status: implementation under local acceptance; complete D06 is pending.

The fixed Kubernetes Secret remains the only upstream header vault. Each entry now contains an AES-256-GCM envelope with a random 96-bit nonce, a key ID and authentication tag. Authenticated data binds the format/key ID, team and reference; a swapped or modified envelope cannot decrypt in another scope. The keyring is a separate mounted Kubernetes Secret value available to the API/provisioner, never to the dashboard/gateway or SQL. K3s Secret encryption is a separate storage-layer control, not a substitute for transport protection.

Human-managed credential changes allocate an immutable new UUID reference. Registry updates remain revision checked. The private credential endpoint requires the expected registry revision, preventing a delayed gateway from pairing an old URL with new credentials. Managed-store references retain their durable store UUID and can only be written idempotently with the same headers; changing an existing reference fails closed. Managed-store deletion removes that slot after the existing call-drain gate.

A SQL rollback or crash between Secret and SQL writes can leave an encrypted orphan. A narrow security-definer function returns live reference IDs only, including pending/retrying managed stores. API maintenance removes unreferenced entries after a one-hour create grace, using Kubernetes resourceVersion compare-and-swap. Failure to query or update preserves entries. Disabled but existing connections retain credentials; deletion and rotation make old human references unreachable immediately. No plaintext header is written to SQL or Helm values.

The reviewed operator migration verifies every actual envelope round trip before one resourceVersion-protected replacement. Operator key rotation first adds a new key while retaining the old one, rewraps and verifies all entries, then removes the old key only after readers use the overlap bundle. Keys/old state are held only in ignored private safety copies. Rotation acceptance must test actual running clients and restart behavior before this ADR is marked verified.

Local service transport remains an explicit open D06 item until the TLS acceptance matrix passes. This change alone does not establish protection against an attacker controlling both the vault and keyring, a privileged cluster operator, or a credential-holding malicious upstream's covert output channel.
