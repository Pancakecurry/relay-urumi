import { boundedFetch } from "../../../packages/auth/src/destinations.js";
import { Rejection } from "../../../packages/auth/src/identity.js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type pg from "pg";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { SecretVault } from "../../../packages/auth/src/secret-vault.js";
import {
  kube,
  owned,
  ensure,
  absent,
  Fault,
  type Resource,
} from "./kubernetes.js";
const exec = promisify(execFile);
export interface StoreRow {
  id: string;
  team_id: string;
  user_id: string;
  name: string;
  namespace: string;
  release: string;
  host: string;
  url: string;
  desired: "present" | "absent";
  status: string;
  phase: string;
  generation: number;
  attempt: number;
  deadline: Date;
  updated_at: Date;
  config: Record<string, unknown>;
  resources: {
    namespaceUid?: string;
    volumes?: { name: string; path?: string; reclaim: string }[];
  };
  upstream_id: string | null;
}
const hex = (n: number) => randomBytes(n).toString("hex");
export class Controller {
  readonly owner = randomUUID();
  readonly vault = new SecretVault();
  constructor(readonly pool: pg.Pool) {}
  async phase(s: StoreRow, phase: string, code: string | null = null) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const changed = await c.query(
        "UPDATE app.stores SET phase=$3,error_code=$4,updated_at=now() WHERE id=$1 AND generation=$2 RETURNING id",
        [s.id, s.generation, phase, code],
      );
      if (!changed.rowCount) throw new Fault("GENERATION_CHANGED", false);
      await c.query(
        "INSERT INTO app.store_events(id,team_id,store_id,generation,phase,code) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), s.team_id, s.id, s.generation, phase, code],
      );
      await c.query("COMMIT");
      s.phase = phase;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async current(s: StoreRow) {
    const r = (
      await this.pool.query<StoreRow>("SELECT * FROM app.stores WHERE id=$1", [
        s.id,
      ])
    ).rows[0];
    if (!r || r.generation !== s.generation)
      throw new Fault("GENERATION_CHANGED", false);
    if (r.deadline < new Date()) throw new Fault("PROVISIONING_TIMEOUT", false);
    return r;
  }
  async helm(
    s: StoreRow,
    chart: string,
    release: string,
    values: unknown,
    uninstall = false,
  ) {
    await this.current(s);
    const tmp = await mkdtemp("/tmp/relay-store-");
    try {
      const base = "/var/run/secrets/kubernetes.io/serviceaccount";
      const host = process.env["KUBERNETES_SERVICE_HOST"];
      const config = {
        apiVersion: "v1",
        kind: "Config",
        clusters: [
          {
            name: "local",
            cluster: {
              server: `https://${host}:${process.env["KUBERNETES_SERVICE_PORT_HTTPS"] ?? 443}`,
              "certificate-authority-data": readFileSync(
                `${base}/ca.crt`,
              ).toString("base64"),
            },
          },
        ],
        users: [
          {
            name: "controller",
            user: { token: readFileSync(`${base}/token`, "utf8").trim() },
          },
        ],
        contexts: [
          {
            name: "store",
            context: {
              cluster: "local",
              user: "controller",
              namespace: s.namespace,
            },
          },
        ],
        "current-context": "store",
      };
      await writeFile(`${tmp}/kubeconfig`, JSON.stringify(config), {
        mode: 0o600,
      });
      await writeFile(`${tmp}/values.json`, JSON.stringify(values), {
        mode: 0o600,
      });
      // Helm state is itself namespaced. An interrupted pending revision is repaired only under
      // our per-store SQL lock and after every resource/release ownership check below.
      const releaseList = await kube(
        "GET",
        `/api/v1/namespaces/${s.namespace}/secrets?labelSelector=owner%3Dhelm%2Cname%3D${release}`,
      );
      const releases = (releaseList["items"] ?? []) as Resource[];
      for (const item of releases) {
        if (item.metadata.labels?.["relay.store/id"] !== s.id)
          throw new Fault("HELM_OWNERSHIP_CONFLICT", false);
      }
      if (uninstall) {
        if (!releases.length) return;
        await exec(
          "/usr/local/bin/helm",
          [
            "uninstall",
            release,
            "--namespace",
            s.namespace,
            "--wait",
            "--timeout",
            "60s",
            "--ignore-not-found",
          ],
          {
            env: {
              ...process.env,
              KUBECONFIG: `${tmp}/kubeconfig`,
              HELM_CACHE_HOME: `${tmp}/cache`,
              HELM_CONFIG_HOME: `${tmp}/config`,
              HELM_DATA_HOME: `${tmp}/data`,
            },
            timeout: 65000,
            maxBuffer: 1048576,
          },
        );
        return;
      }
      const latest = releases.sort(
        (a, b) =>
          Number(b.metadata.labels?.["version"]) -
          Number(a.metadata.labels?.["version"]),
      )[0];
      if (latest?.metadata.labels?.["status"]?.startsWith("pending-")) {
        const data = latest["data"] as Record<string, string>;
        const { gunzipSync, gzipSync } = await import("node:zlib");
        const decoded = JSON.parse(
          gunzipSync(
            Buffer.from(
              Buffer.from(data["release"]!, "base64").toString(),
              "base64",
            ),
          ).toString(),
        ) as { info: { status: string; description: string } };
        decoded.info.status = "failed";
        decoded.info.description =
          "Recovered interrupted owned release under PostgreSQL lock";
        data["release"] = Buffer.from(
          gzipSync(JSON.stringify(decoded)).toString("base64"),
        ).toString("base64");
        latest.metadata.labels!["status"] = "failed";
        await kube(
          "PUT",
          `/api/v1/namespaces/${s.namespace}/secrets/${latest.metadata.name}`,
          latest,
        );
      }
      await exec(
        "/usr/local/bin/helm",
        [
          "upgrade",
          "--install",
          release,
          `/app/charts/${chart}`,
          "--namespace",
          s.namespace,
          "-f",
          `${tmp}/values.json`,
          "--labels",
          `relay.store/id=${s.id}`,
          "--wait",
          "--wait-for-jobs",
          "--timeout",
          `${Math.max(1, Math.min(300, Math.floor((s.deadline.getTime() - Date.now()) / 1000)))}s`,
          "--history-max",
          "5",
        ],
        {
          env: {
            ...process.env,
            KUBECONFIG: `${tmp}/kubeconfig`,
            HELM_CACHE_HOME: `${tmp}/cache`,
            HELM_CONFIG_HOME: `${tmp}/config`,
            HELM_DATA_HOME: `${tmp}/data`,
          },
          timeout: Math.max(
            1000,
            Math.min(310000, s.deadline.getTime() - Date.now()),
          ),
          maxBuffer: 1048576,
        },
      );
    } catch (e) {
      if (e instanceof Fault) throw e;
      const stderr = String((e as { stderr?: string }).stderr ?? "");
      if (stderr.includes("exceeded quota"))
        throw new Fault("RESOURCE_QUOTA_EXCEEDED");
      try {
        const pods = await kube(
          "GET",
          `/api/v1/namespaces/${s.namespace}/pods`,
        );
        for (const p of pods["items"] as Resource[]) {
          const statuses =
            (
              p["status"] as {
                containerStatuses?: {
                  state?: { waiting?: { reason?: string } };
                }[];
              }
            ).containerStatuses ?? [];
          if (
            statuses.some((c) =>
              ["ImagePullBackOff", "ErrImagePull"].includes(
                c.state?.waiting?.reason ?? "",
              ),
            )
          )
            throw new Fault("IMAGE_UNAVAILABLE");
          if (
            statuses.some(
              (c) => c.state?.waiting?.reason === "CreateContainerConfigError",
            )
          )
            throw new Fault("CONTAINER_CONFIGURATION_FAILED");
        }
        const jobs = await kube(
          "GET",
          `/apis/batch/v1/namespaces/${s.namespace}/jobs`,
        );
        if (
          (jobs["items"] as Resource[]).some(
            (j) => Number((j["status"] as { failed?: number }).failed) > 0,
          )
        )
          throw new Fault("BOOTSTRAP_FAILED");
      } catch (diagnostic) {
        if (
          diagnostic instanceof Fault &&
          [
            "IMAGE_UNAVAILABLE",
            "CONTAINER_CONFIGURATION_FAILED",
            "BOOTSTRAP_FAILED",
          ].includes(diagnostic.code)
        )
          throw diagnostic;
      }
      throw new Fault("HELM_RECONCILE_FAILED");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  async provision(s: StoreRow) {
    if (
      !/^relay-store-[a-f0-9]{32}$/.test(s.namespace) ||
      s.namespace !== `relay-store-${s.id.replaceAll("-", "")}` ||
      s.release !== "store"
    )
      throw new Fault("INVALID_RESOURCE_IDENTITY", false);
    await this.phase(s, "Namespace");
    const labels = {
      "relay.store/id": s.id,
      "relay.store/team": s.team_id,
      "relay-owned": "m5",
      "relay.store/managed": "true",
    };
    const ns = await ensure(
      "/api/v1/namespaces",
      {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: { name: s.namespace, labels },
      },
      s.id,
    );
    if (ns.metadata.deletionTimestamp) throw new Fault("NAMESPACE_TERMINATING");
    if (
      s.resources.namespaceUid &&
      s.resources.namespaceUid !== ns.metadata.uid
    )
      throw new Fault("RESOURCE_IDENTITY_CHANGED", false);
    await this.pool.query(
      "UPDATE app.stores SET resources=resources || $2::jsonb WHERE id=$1",
      [s.id, JSON.stringify({ namespaceUid: ns.metadata.uid })],
    );
    const base = `/api/v1/namespaces/${s.namespace}`;
    await ensure(
      `/apis/rbac.authorization.k8s.io/v1/namespaces/${s.namespace}/rolebindings`,
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "RoleBinding",
        metadata: { name: "store-controller", labels },
        subjects: [
          {
            kind: "ServiceAccount",
            name: "relay-provisioner",
            namespace: "relay-platform",
          },
        ],
        roleRef: {
          apiGroup: "rbac.authorization.k8s.io",
          kind: "ClusterRole",
          name: "relay-platform-relay-store-resources",
        },
      },
      s.id,
    );
    await this.phase(s, "Admission");
    await ensure(
      `${base}/resourcequotas`,
      {
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: { name: "store-budget", labels },
        spec: {
          hard: {
            "requests.cpu": "1",
            "limits.cpu": "4",
            "requests.memory": "768Mi",
            "limits.memory": "3Gi",
            pods: "8",
            persistentvolumeclaims: "2",
            "requests.storage": "2Gi",
            services: "4",
            secrets: "24",
          },
        },
      },
      s.id,
      true,
    ).catch((e) => {
      throw e;
    });
    await ensure(
      `${base}/limitranges`,
      {
        apiVersion: "v1",
        kind: "LimitRange",
        metadata: { name: "store-limits", labels },
        spec: {
          limits: [
            {
              type: "Container",
              default: { cpu: "500m", memory: "256Mi" },
              defaultRequest: { cpu: "25m", memory: "64Mi" },
              max: { cpu: "2", memory: "1Gi" },
              min: { cpu: "10m", memory: "16Mi" },
            },
          ],
        },
      },
      s.id,
    );
    // A deny policy exists before the first Secret/Helm workload, then charts add narrow flows.
    await ensure(
      `/apis/networking.k8s.io/v1/namespaces/${s.namespace}/networkpolicies`,
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: { name: "store-deny", labels },
        spec: {
          podSelector: {},
          policyTypes: ["Ingress", "Egress"],
          ingress: [],
          egress: [],
        },
      },
      s.id,
    );
    await this.phase(s, "Secrets");
    const runtime: Record<string, string> = {
      "db-password": hex(32),
      "root-password": hex(32),
    };
    for (const k of [
      "AUTH_KEY",
      "SECURE_AUTH_KEY",
      "LOGGED_IN_KEY",
      "NONCE_KEY",
      "AUTH_SALT",
      "SECURE_AUTH_SALT",
      "LOGGED_IN_SALT",
      "NONCE_SALT",
    ])
      runtime[k] = hex(48);
    const secrets = {
      "store-runtime": runtime,
      "store-admin": { username: "relay_admin", password: hex(32) },
      "store-adapter": {
        "consumer-key": `ck_${hex(20)}`,
        "consumer-secret": `cs_${hex(20)}`,
      },
      "upstream-mcp": { token: hex(32) },
    };
    // Never generate a replacement database/admin/OAuth identity for persisted data.
    const claimsBeforeSecrets = await kube(
      "GET",
      `${base}/persistentvolumeclaims`,
    );
    if ((claimsBeforeSecrets["items"] as Resource[]).length) {
      for (const name of Object.keys(secrets))
        if (await absent(`${base}/secrets/${name}`))
          throw new Fault("PERSISTED_STORE_SECRET_MISSING", false);
    }
    for (const [name, stringData] of Object.entries(secrets))
      await ensure(
        `${base}/secrets`,
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: { name, labels },
          type: "Opaque",
          stringData,
        },
        s.id,
      );
    if (!Object.keys(s.config).length) {
      s.config = {
        wordpressImage: process.env["STORE_IMAGE"],
        adapterImage: process.env["ADAPTER_IMAGE"],
        storageClass: process.env["STORE_STORAGE_CLASS"] ?? "local-path",
        transportVersion: process.env["STORE_TLS_ENABLED"] === "true" ? 1 : 0,
        tlsIssuer: process.env["STORE_TLS_ISSUER"] ?? "relay-local-ca",
        httpsPort: process.env["STORE_HTTPS_PORT"] ?? "443",
      };
      await this.pool.query(
        "UPDATE app.stores SET config=$2 WHERE id=$1 AND generation=$3",
        [s.id, s.config, s.generation],
      );
    }
    // Refuse takeover of any chart-resource name, even inside our owned namespace.
    for (const [path, names] of [
      [`${base}/services`, ["store-db", "store-wp", "store-mcp"]],
      [`${base}/persistentvolumeclaims`, ["store-db", "store-content"]],
      [
        `/apis/apps/v1/namespaces/${s.namespace}/deployments`,
        ["store-wp", "store-mcp"],
      ],
      [`/apis/apps/v1/namespaces/${s.namespace}/statefulsets`, ["store-db"]],
    ] as [string, string[]][]) {
      for (const name of names) {
        try {
          const resource = await kube("GET", `${path}/${name}`);
          if (
            resource.metadata.annotations?.["meta.helm.sh/release-name"] !==
            (name === "store-mcp" ? "store-mcp" : "store")
          )
            throw new Fault("CHART_RESOURCE_CONFLICT", false);
        } catch (e) {
          if (!(e instanceof Fault && e.code === "NOT_FOUND")) throw e;
        }
      }
    }
    const tls = s.config["transportVersion"] === 1;
    if (tls && new URL(s.url).protocol !== "https:")
      throw new Fault("STORE_TLS_URL_MISMATCH", false);
    await this.phase(s, "StoreInstall");
    await this.helm(s, "store", "store", {
      runtime: { nonRoot: tls },
      transportTls: {
        enabled: tls,
        issuer: s.config["tlsIssuer"] ?? "relay-local-ca",
        adapterCommonName: `store-mcp.${s.namespace}`,
      },
      wordpress: {
        image: s.config["wordpressImage"],
        resources: {
          requests: { cpu: "50m", memory: "128Mi" },
          limits: { cpu: "750m", memory: "512Mi" },
        },
      },
      mariadb: {
        resources: {
          requests: { cpu: "50m", memory: "96Mi" },
          limits: { cpu: "500m", memory: "384Mi" },
        },
      },
      bootstrap: {
        resources: {
          requests: { cpu: "50m", memory: "96Mi" },
          limits: { cpu: "750m", memory: "384Mi" },
        },
      },
      persistence: {
        storageClass: s.config["storageClass"],
        databaseSize: "1Gi",
        contentSize: "512Mi",
      },
      site: {
        url: s.url,
        title: s.name,
        timezone: "Asia/Kolkata",
        currency: "INR",
      },
      ingress: { hostname: s.host, httpsPort: s.config["httpsPort"] ?? "443" },
      managedStoreId: s.id,
    });
    await this.current(s);
    const pvcs = await kube("GET", `${base}/persistentvolumeclaims`);
    const volumes = [];
    for (const pvc of pvcs["items"] as Resource[]) {
      const volumeName = (pvc["spec"] as { volumeName?: string }).volumeName;
      if (!volumeName) throw new Fault("STORAGE_UNBOUND");
      const pv = await kube("GET", `/api/v1/persistentvolumes/${volumeName}`);
      const spec = pv["spec"] as {
        persistentVolumeReclaimPolicy: string;
        claimRef: { namespace: string };
        hostPath?: { path: string };
        local?: { path: string };
      };
      if (
        spec.claimRef.namespace !== s.namespace ||
        spec.persistentVolumeReclaimPolicy !== "Delete"
      )
        throw new Fault("STORAGE_RETAIN_POLICY", false);
      volumes.push({
        name: volumeName,
        reclaim: spec.persistentVolumeReclaimPolicy,
        ...(spec.hostPath?.path ? { path: spec.hostPath.path } : {}),
        ...(spec.local?.path ? { path: spec.local.path } : {}),
      });
    }
    s.resources = { ...s.resources, volumes };
    await this.pool.query(
      "UPDATE app.stores SET resources=resources || $2::jsonb WHERE id=$1",
      [s.id, JSON.stringify({ volumes })],
    );
    const database = await kube(
      "GET",
      `/apis/apps/v1/namespaces/${s.namespace}/statefulsets/store-db`,
    );
    if (
      Number(
        (database["status"] as { readyReplicas?: number }).readyReplicas ?? 0,
      ) !== 1
    )
      throw new Fault("DATABASE_NOT_READY");
    await this.phase(s, "DatabaseReady");
    const bootstrap = await kube(
      "GET",
      `/apis/batch/v1/namespaces/${s.namespace}/jobs/store-bootstrap`,
    );
    if (
      Number((bootstrap["status"] as { succeeded?: number }).succeeded ?? 0) !==
      1
    )
      throw new Fault("BOOTSTRAP_NOT_COMPLETE");
    await this.phase(s, "WooCommerceInitialized");
    await this.phase(s, "AdapterInstall");
    await this.helm(s, "hosted-mcp", "store-mcp", {
      kind: "woocommerce",
      transportTls: {
        enabled: tls,
        issuer: s.config["tlsIssuer"] ?? "relay-local-ca",
      },
      image: s.config["adapterImage"],
      credentialSecret: "upstream-mcp",
      gatewayNamespace: "relay-platform",
      provisionerEnabled: true,
      store: {
        connectionUrl: tls ? "https://store-wp" : "http://store-wp",
        canonicalUrl: s.url,
        wordpressRelease: "store",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    await this.phase(s, "Discovery");
    await this.current(s);
    const secret = await kube("GET", `${base}/secrets/upstream-mcp`);
    owned(secret, s.id);
    const token = Buffer.from(
      (secret["data"] as Record<string, string>)["token"]!,
      "base64",
    ).toString();
    const url = `${tls ? "https" : "http"}://store-mcp.${s.namespace}.svc.cluster.local:3000/mcp`;
    const client = new Client({ name: "relay-provisioner", version: "0.5.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          fetch: boundedFetch,
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
        { timeout: 5000 },
      );
      const tools = await client.listTools({}, { timeout: 5000 });
      if (
        ![
          "list_products",
          "create_product",
          "list_orders",
          "get_order",
          "update_order_status",
        ].every((name) => tools.tools.some((t) => t.name === name))
      )
        throw new Fault("ADAPTER_TOOLS_MISSING");
    } finally {
      await client.close();
    }
    await this.current(s);
    await this.phase(s, "Registration");
    await this.vault.set(s.team_id, s.id, { Authorization: `Bearer ${token}` });
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      const active = (
        await tx.query<StoreRow>(
          "SELECT * FROM app.stores WHERE id=$1 FOR UPDATE",
          [s.id],
        )
      ).rows[0]!;
      if (active.generation !== s.generation || active.desired !== "present")
        throw new Fault("GENERATION_CHANGED", false);
      await tx.query(
        "INSERT INTO app.upstreams(id,team_id,name,url,enabled,credential_ref) VALUES($1,$2,$3,$4,true,$1) ON CONFLICT(id) DO UPDATE SET url=EXCLUDED.url,credential_ref=EXCLUDED.credential_ref,deleted_at=NULL,revision=app.upstreams.revision+1",
        [s.id, s.team_id, `${s.name} · ${s.id.slice(0, 8)}`, url],
      );
      await tx.query(
        "UPDATE app.stores SET upstream_id=id,status='Ready',phase='Ready',error_code=NULL,updated_at=now() WHERE id=$1 AND generation=$2",
        [s.id, s.generation],
      );
      await tx.query("COMMIT");
    } catch (e) {
      await tx.query("ROLLBACK");
      throw e;
    } finally {
      tx.release();
    }
    await this.phase(s, "Ready");
  }
  async remove(s: StoreRow) {
    if (
      s.namespace !== `relay-store-${s.id.replaceAll("-", "")}` ||
      s.release !== "store"
    )
      throw new Fault("INVALID_RESOURCE_IDENTITY", false);
    // Route denial happened transactionally in the request; allow the bounded gateway calls to drain.
    if (Date.now() - s.updated_at.getTime() < 12000)
      throw new Fault("DRAINING");
    await this.phase(s, "Teardown");
    const path = `/api/v1/namespaces/${s.namespace}`;
    if (!(await absent(path))) {
      const ns = await kube("GET", path);
      owned(ns, s.id);
      if (
        s.resources.namespaceUid &&
        ns.metadata.uid !== s.resources.namespaceUid
      )
        throw new Fault("RESOURCE_IDENTITY_CHANGED", false);
      if (!ns.metadata.deletionTimestamp) {
        const claims = await kube("GET", `${path}/persistentvolumeclaims`);
        const volumes = [...(s.resources.volumes ?? [])];
        for (const claim of claims["items"] as Resource[]) {
          const name = (claim["spec"] as { volumeName?: string }).volumeName;
          if (!name || volumes.some((v) => v.name === name)) continue;
          const pv = await kube("GET", `/api/v1/persistentvolumes/${name}`);
          const spec = pv["spec"] as {
            persistentVolumeReclaimPolicy: string;
            claimRef: { namespace: string };
            hostPath?: { path: string };
          };
          if (
            spec.claimRef.namespace !== s.namespace ||
            spec.persistentVolumeReclaimPolicy !== "Delete"
          )
            throw new Fault("STORAGE_RETAIN_POLICY", false);
          volumes.push({
            name,
            reclaim: spec.persistentVolumeReclaimPolicy,
            ...(spec.hostPath?.path ? { path: spec.hostPath.path } : {}),
          });
        }
        s.resources.volumes = volumes;
        await this.pool.query(
          "UPDATE app.stores SET resources=resources || $2::jsonb WHERE id=$1",
          [s.id, JSON.stringify({ volumes })],
        );
      }
      if (!ns.metadata.deletionTimestamp) {
        await this.phase(s, "Uninstall");
        await this.helm(s, "hosted-mcp", "store-mcp", {}, true);
        await this.helm(s, "store", "store", {}, true);
        await this.phase(s, "NamespaceCleanup");
      }
      // Namespace deletion removes BOTH Helm histories and every workload, including retained PVCs.
      // Kubernetes Delete reclamation removes the PV/data; no finalizer is stripped.
      if (!ns.metadata.deletionTimestamp)
        await kube("DELETE", path, {
          apiVersion: "v1",
          kind: "DeleteOptions",
          preconditions: { uid: ns.metadata.uid },
          propagationPolicy: "Foreground",
        });
      throw new Fault("CLEANUP_PENDING");
    }
    await this.phase(s, "NamespaceRemoved");
    for (const volume of s.resources.volumes ?? [])
      if (!(await absent(`/api/v1/persistentvolumes/${volume.name}`)))
        throw new Fault("VOLUME_CLEANUP_PENDING");
    await this.phase(s, "VolumesRemoved");
    await this.vault.set(s.team_id, s.id, null);
    await this.phase(s, "CredentialsRemoved");
    await this.pool.query(
      "UPDATE app.stores SET status='Deleted',phase='Deleted',deleted_at=now(),error_code=NULL,updated_at=now() WHERE id=$1 AND generation=$2 AND desired='absent'",
      [s.id, s.generation],
    );
    await this.phase(s, "Deleted");
  }
  async inspectReady() {
    const stores = (
      await this.pool.query<StoreRow>(
        "SELECT * FROM app.stores WHERE status='Ready' ORDER BY updated_at LIMIT 100",
      )
    ).rows;
    for (const s of stores) {
      try {
        const ns = await kube("GET", `/api/v1/namespaces/${s.namespace}`);
        owned(ns, s.id);
        if (ns.metadata.uid !== s.resources.namespaceUid)
          throw new Fault("RESOURCE_IDENTITY_CHANGED", false);
        const resources = await Promise.all([
          kube(
            "GET",
            `/apis/apps/v1/namespaces/${s.namespace}/deployments/store-wp`,
          ),
          kube(
            "GET",
            `/apis/apps/v1/namespaces/${s.namespace}/deployments/store-mcp`,
          ),
          kube(
            "GET",
            `/apis/apps/v1/namespaces/${s.namespace}/statefulsets/store-db`,
          ),
        ]);
        if (
          resources.some(
            (r) =>
              Number(
                (r["status"] as { readyReplicas?: number }).readyReplicas ?? 0,
              ) !== 1,
          )
        ) {
          await this.pool.query("SELECT app.repair_store($1)", [s.id]);
        }
      } catch (e) {
        if (
          e instanceof Fault &&
          [
            "OWNERSHIP_CONFLICT",
            "RESOURCE_IDENTITY_CHANGED",
            "NOT_FOUND",
          ].includes(e.code)
        ) {
          await this.pool.query(
            "UPDATE app.stores SET status='RecoveryRequired',error_code=$2,updated_at=now() WHERE id=$1 AND status='Ready'",
            [s.id, e.code === "NOT_FOUND" ? "RESOURCE_MISSING" : e.code],
          );
        }
      }
    }
  }
  async run(id: string) {
    const lock = await this.pool.connect();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      if (
        !(
          await lock.query<{ locked: boolean }>(
            "SELECT pg_try_advisory_lock(hashtextextended($1,5)) locked",
            [id],
          )
        ).rows[0]!.locked
      )
        return;
      const s = (
        await lock.query<StoreRow>("SELECT * FROM app.stores WHERE id=$1", [id])
      ).rows[0];
      if (
        !s ||
        ["Ready", "Deleted", "Failed", "RecoveryRequired"].includes(s.status)
      )
        return;
      if (
        (
          await lock.query(
            "UPDATE app.stores SET lease_owner=$2,lease_until=now()+interval '30 seconds' WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",
            [id, this.owner],
          )
        ).rowCount !== 1
      )
        return;
      heartbeat = setInterval(() => {
        void this.pool
          .query(
            "UPDATE app.stores SET lease_until=now()+interval '30 seconds' WHERE id=$1 AND lease_owner=$2",
            [id, this.owner],
          )
          .catch(() => {});
      }, 10000);
      try {
        await this.current(s);
        if (s.desired === "present") await this.provision(s);
        else await this.remove(s);
      } catch (e) {
        const f =
          e instanceof Fault
            ? e
            : e instanceof Rejection
              ? new Fault(e.code, e.status >= 500)
              : new Fault("CONTROL_RECONCILE_FAILED");
        if (f.code === "GENERATION_CHANGED") return;
        const pending = [
          "DRAINING",
          "CLEANUP_PENDING",
          "VOLUME_CLEANUP_PENDING",
          "NAMESPACE_TERMINATING",
        ].includes(f.code);
        const timed = s.deadline < new Date();
        const terminal = timed || !f.retryable || (!pending && s.attempt >= 3);
        await this.pool.query(
          "UPDATE app.stores SET attempt=attempt+$3,status=CASE WHEN $4 THEN CASE WHEN desired='absent' THEN 'RecoveryRequired' ELSE 'Failed' END ELSE status END,error_code=$5,next_attempt_at=now()+make_interval(secs=>$6),updated_at=CASE WHEN $5='DRAINING' THEN updated_at ELSE now() END WHERE id=$1 AND generation=$2",
          [
            s.id,
            s.generation,
            pending ? 0 : 1,
            terminal,
            timed ? "PROVISIONING_TIMEOUT" : f.code,
            pending ? 3 : Math.min(30, 2 ** s.attempt * 3),
          ],
        );
        await this.pool.query(
          "INSERT INTO app.store_events(id,team_id,store_id,generation,phase,code) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            s.team_id,
            s.id,
            s.generation,
            s.phase,
            timed ? "PROVISIONING_TIMEOUT" : f.code,
          ],
        );
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await lock
        .query(
          "UPDATE app.stores SET lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2",
          [id, this.owner],
        )
        .catch(() => {});
      await lock
        .query("SELECT pg_advisory_unlock(hashtextextended($1,5))", [id])
        .catch(() => {});
      lock.release();
    }
  }
}
