# Owned local cluster token rotation

Use only for the single-server `relay-m0` cluster after the disposable `relay-m4-clean` restart proof passes. The script refuses other clusters and existing token configuration. It never prints credential bytes or private command output.

```sh
RELAY_ROTATION_CLUSTER=relay-m0 node scripts/cluster-token-rotation.mjs
```

The script validates the current token over the loopback API using the cluster CA and actual loopback-only Docker binding, stops the owned server, and saves a quiesced SQLite/bootstrap/TLS backup under a unique `.local/cluster-rotation-relay-m0-*` directory (private directory). It restarts, configures a persistent token-file, performs the official rotation, and restarts again. Acceptance requires old-token HTTP 401, new-token HTTP 200, ready API/node, unchanged token after restart, and unchanged PVC identities. Follow with store and platform regressions; Kubernetes readiness alone does not prove application preservation.

K3d's immutable container environment and labels retain the invalid old token. Do not add nodes using stale defaults. Future node additions require the current private token explicitly; changing metadata is not part of this repair. Do not print raw k3d JSON inventories, which include join credentials.

If interrupted, inspect private backups and actual state before retrying. Never recreate the working cluster or delete its volumes to hide a rotation problem. Keep the old token with pre-rotation snapshots; K3s uses it to encrypt bootstrap data. Private backup files must not enter Git or published evidence.

Sources: [K3s token lifecycle](https://docs.k3s.io/cli/token), [selected v1.37.1+k3s1 startup implementation](https://raw.githubusercontent.com/k3s-io/k3s/v1.37.1%2Bk3s1/pkg/cli/server/server.go). The selected source reads the token-file after the environment token; the disposable restart test must confirm that behavior before modifying the working cluster.
