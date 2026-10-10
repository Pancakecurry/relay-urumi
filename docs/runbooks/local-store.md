# Local persistent WooCommerce store

M1 uses the M0 cluster; first follow `local-m0.md` for the exact host tools, Node/pnpm, private kubeconfig and cluster. No cloud resources or model calls are required. Read ADR 0006 before changing the image or permissions.

From the repository root:

```sh
node scripts/local-cache.mjs
pnpm install --frozen-lockfile
pnpm cluster:setup
pnpm store:deploy
pnpm store:checkout
```

The deploy script creates an owned empty store namespace and private Secret backup before building/importing a deterministic source-tagged image and installing Helm. Database/content PVCs start empty on a new namespace. Pinned base images and WooCommerce download require internet during image build; pods bootstrap offline. Repeating deployment reruns the idempotent hook. Helm waits for both workload readiness and successful configuration, not only Pod Running. Do not start concurrent deployments. If a hook fails, inspect its logs and fix the cause before repeating; never reset credentials to hide it.

Storefront: <http://store.relay.localhost:18080/shop/>. Administration: <http://store.relay.localhost:18080/wp-admin/>. Chrome resolves `.localhost` without editing system hosts. If another client does not, use a client-only DNS mapping to 127.0.0.1, retaining the canonical hostname/port. Do not change the owner's system hosts automatically.

Administrator username is `relay_admin`. The password is in the ignored mode-0600 `.local/relay-store-m1-credentials.json`, `admin.password`; open this private file locally to copy it. Do not print it into logs, paste it into public artifacts or commit it. The interactive admin can manage WooCommerce keys, as in a normal store; no public endpoint returns credentials. The adapter Secret is not mounted into the WordPress runtime. Keep the private backup securely: losing it must trigger recovery review, not silent password/key rotation.

Products labelled `[SYNTHETIC DEMO]` have stable `RELAY-DEMO-*` SKUs. Add a product to cart, proceed to checkout, enter synthetic customer details and select Cash on delivery. There is no collected payment or fulfilment. Capture the received order ID. In administration use WooCommerce → Orders (HPOS order screen) to see the same ID, product, customer, COD and total. The automated checkout script performs this real browser workflow and writes synthetic-only evidence. Each explicit checkout run creates a new real test order; it is not an idempotent setup command.

```sh
pnpm store:status
pnpm store:persistence
```

Persistence verification replaces only this store's WordPress pod and MariaDB StatefulSet pod, waits for readiness, then checks the existing recorded order/product in REST and administration and a real persisted upload file. It never deletes PVCs. Re-run deployment and compare bootstrap IDs/counts to verify setup creates no duplicate administrator, SKU or adapter key. `node scripts/store-interruption-check.mjs` runs an owned Job, terminates it after setup mutations but before successful completion, and reruns the actual Helm bootstrap to compare identities. A failed test is not success; inspect its actual log.

The local REST client reads the Kubernetes adapter Secret into memory and sends signed OAuth Authorization headers; it never writes raw credentials, request headers or browser authentication traces to evidence. Unauthorized order requests must return 401. Future M2 adapter uses its own mounted Secret and private service transport. Local HTTP is confined to loopback; production uses HTTPS.

For k3s use the **same** chart with `infra/prod/store-values.example.yaml`, approved registry image digest, real DNS/TLS Secret, storage sizes/class and separately created Secrets. The example is render-only and not a public deployment. K3s local-path remains node-local; backup/restore and HA are later gates. Do not treat pod replacement as disaster recovery.

Uninstall retains the two chart PVCs. Removing a namespace deletes its Secrets/PVCs despite keep annotations: never use namespace deletion as a restart test. Secrets are installation inputs and are managed separately from Helm, not stored in Helm values/release manifests. No default kubeconfig or unrelated workloads are changed.

Clean-install acceptance uses `STORE_NAMESPACE=relay-store-clean STORE_RELEASE=clean-store STORE_VALUES=infra/local/store-clean-values.yaml bash scripts/store-deploy.sh`, creating separate empty PVCs/Secrets. That acceptance release is now scaled to zero to save RAM; its PVCs/Secrets are retained. Deploying it again resumes it. This verifies a second clean store on the existing cluster, not an independent host/cluster.

The corrected installer reads the admin password inside PHP (`install.php`), not WP-CLI's interactive prompt, which was found to echo passwords. The affected initial password was rotated, old hook deleted and raw test capture replaced before staging. Final pod/evidence/index scans must pass. Do not reintroduce `wp core install --prompt=admin_password`.

Upstream WP-CLI emits a hard-rewrite warning about Apache detection; the tested pinned image's actual `.htaccess` and pretty routes work, including REST/product/cart/checkout after pod replacement. SMTP is absent: COD succeeds and the administration order notes accurately report failed email notifications. Email delivery is not implemented; do not claim receipt of mail. Installation suppresses synthetic bootstrap mail attempts. App URLs/configuration and catalog/COD options are recorded in state evidence.
