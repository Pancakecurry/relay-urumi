import type pg from "pg";
import { kube, owned, Fault, type Resource } from "./kubernetes.js";
import type { StoreRow } from "./controller.js";
import type {
  StoreObservation,
  StoreComponent,
} from "../../../packages/contracts/src/stores.js";
type Pod = Resource & {
  status?: {
    phase?: string;
    containerStatuses?: {
      ready?: boolean;
      restartCount?: number;
      state?: {
        waiting?: { reason?: string };
        terminated?: { reason?: string };
      };
    }[];
  };
  spec?: {
    containers?: {
      name: string;
      image: string;
      resources?: {
        requests?: Record<string, string>;
        limits?: Record<string, string>;
      };
    }[];
  };
};
type Workload = Resource & {
  spec?: { replicas?: number; template?: { spec?: Pod["spec"] } };
  status?: { readyReplicas?: number; replicas?: number };
};
type Claim = Resource & {
  spec?: {
    volumeName?: string;
    storageClassName?: string;
    resources?: { requests?: { storage?: string } };
  };
  status?: { phase?: string; capacity?: { storage?: string } };
};
type Metric = Resource & {
  timestamp: string;
  containers: { name: string; usage: { cpu: string; memory: string } }[];
};
function cpu(v: string) {
  if (v.endsWith("n")) return Number(v.slice(0, -1)) / 1e6;
  if (v.endsWith("u")) return Number(v.slice(0, -1)) / 1000;
  if (v.endsWith("m")) return Number(v.slice(0, -1));
  return Number(v) * 1000;
}
function memory(v: string) {
  const m = v.match(/^([0-9.]+)(Ki|Mi|Gi|Ti|k|M|G)?$/);
  if (!m) return NaN;
  const scales: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    k: 1000,
    M: 1e6,
    G: 1e9,
  };
  return (Number(m[1]) * (scales[m[2] ?? ""] ?? 1)) / 1024 ** 2;
}
const knownReasons = new Set([
  "ImagePullBackOff",
  "ErrImagePull",
  "CrashLoopBackOff",
  "CreateContainerConfigError",
  "OOMKilled",
  "Error",
  "Completed",
  "ContainerCreating",
]);
export async function observeStore(
  db: pg.Pool,
  id: string,
  team: string,
): Promise<StoreObservation> {
  const s = (
    await db.query<StoreRow>(
      "SELECT * FROM app.stores WHERE id=$1 AND team_id=$2",
      [id, team],
    )
  ).rows[0];
  if (!s) throw new Fault("STORE_NOT_FOUND", false);
  if (s.namespace !== `relay-store-${s.id.replaceAll("-", "")}`)
    throw new Fault("INVALID_RESOURCE_IDENTITY", false);
  const out: StoreObservation = {
    storeId: id,
    observedAt: new Date().toISOString(),
    namespace: s.namespace,
    components: [],
    edges: [],
    metrics: {
      available: false,
      reason: "Metrics not sampled",
      cpuMillicores: null,
      memoryMiB: null,
      sampledAt: null,
    },
    quota: null,
    tools: [],
    toolState: "Not registered",
    toolCheckedAt: null,
    conditions: [],
  };
  out.components.push({
    id: "store",
    kind: "Store",
    name: s.name,
    state: s.status,
    detail: "Durable desired state",
    configuration: {
      desired: s.desired,
      generation: s.generation,
      phase: s.phase,
      host: s.host,
    },
    diagnostics:
      s.status === "Failed" || s.status === "RecoveryRequired"
        ? ["Inspect lifecycle diagnostics before retrying."]
        : [],
  });
  const registration = (
    await db.query<{
      enabled: boolean;
      deleted_at: Date | null;
      state: string | null;
      checked_at: Date | null;
      tools: { name: string }[] | null;
    }>(
      "SELECT u.enabled,u.deleted_at,c.state,c.checked_at,c.tools FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.id=$1 AND u.team_id=$2",
      [id, team],
    )
  ).rows[0];
  if (registration) {
    out.toolState = registration.deleted_at
      ? "Removed"
      : !registration.enabled
        ? "Disabled"
        : (registration.state ?? "Discovering");
    out.toolCheckedAt = registration.checked_at?.toISOString() ?? null;
    if (
      registration.enabled &&
      !registration.deleted_at &&
      registration.state === "Connected"
    )
      out.tools = (registration.tools ?? []).map((t) => ({
        name: t.name,
        alias: `store_${id.replaceAll("-", "")}_${t.name}`,
      }));
  }
  const gateway: StoreComponent = {
    id: "gateway",
    kind: "Gateway registration",
    name: "Shared MCP gateway",
    state: out.toolState,
    detail: "This store’s sampled discovery state",
    configuration: {
      endpoint: "/mcp",
      upstreamId: s.upstream_id,
      tools: out.tools.length,
      checkedAt: out.toolCheckedAt,
    },
    diagnostics:
      out.toolState === "Unreachable"
        ? [
            "Gateway discovery could not reach this adapter. Other stores are independent.",
          ]
        : [],
  };
  let ns: Resource | null = null;
  try {
    ns = await kube("GET", `/api/v1/namespaces/${s.namespace}`);
    owned(ns, id);
    if (
      s.resources.namespaceUid &&
      ns.metadata.uid !== s.resources.namespaceUid
    )
      throw new Fault("RESOURCE_IDENTITY_CHANGED", false);
  } catch (e) {
    if (!(e instanceof Fault && e.code === "NOT_FOUND")) throw e;
  }
  out.components.push({
    id: "namespace",
    kind: "Namespace",
    name: s.namespace,
    state: ns
      ? ns.metadata.deletionTimestamp
        ? "Terminating"
        : "Active"
      : "Absent",
    ...(ns?.metadata.uid ? { uid: ns.metadata.uid } : {}),
    detail: ns
      ? "Isolated Kubernetes boundary"
      : "Namespace not present in Kubernetes",
    configuration: { ownershipVerified: !!ns },
    diagnostics: [],
  });
  out.edges.push({ from: "store", to: "namespace", relationship: "owns" });
  if (!ns) {
    out.components.push(gateway);
    if (s.status === "Deleted") {
      out.conditions.push(
        "Lifecycle cleanup was verified before Deleted. Namespace is currently absent.",
      );
    } else {
      out.conditions.push(
        "Namespace is not present; workloads and metrics cannot be observed.",
      );
    }
    return out;
  }
  const base = `/api/v1/namespaces/${s.namespace}`,
    apps = `/apis/apps/v1/namespaces/${s.namespace}`;
  const paths = [
    `${apps}/deployments/store-wp`,
    `${apps}/statefulsets/store-db`,
    `${apps}/deployments/store-mcp`,
    `${base}/persistentvolumeclaims`,
    `${base}/pods`,
    `${base}/resourcequotas/store-budget`,
    `/apis/metrics.k8s.io/v1beta1/namespaces/${s.namespace}/pods`,
  ];
  const results = await Promise.allSettled(
    paths.map((path) => kube("GET", path)),
  );
  const get = (index: number) => {
    const r = results[index];
    if (r?.status === "fulfilled") return r.value;
    if (
      r?.status === "rejected" &&
      r.reason instanceof Fault &&
      r.reason.code === "NOT_FOUND"
    )
      return null;
    out.conditions.push(
      index === 6
        ? "Live CPU/memory metrics unavailable."
        : "A Kubernetes resource could not be read; its status is unknown.",
    );
    return undefined;
  };
  const pods = get(4) as { items?: Pod[] } | null | undefined;
  const metrics = get(6) as { items?: Metric[] } | null | undefined;
  const podList = pods?.items ?? [];
  const metricsList = metrics?.items ?? [];
  if (metricsList.length) {
    const cpus = metricsList.flatMap((m) =>
      m.containers.map((c) => cpu(c.usage.cpu)),
    );
    const mems = metricsList.flatMap((m) =>
      m.containers.map((c) => memory(c.usage.memory)),
    );
    if ([...cpus, ...mems].every(Number.isFinite)) {
      out.metrics = {
        available: true,
        reason: null,
        cpuMillicores: Math.round(cpus.reduce((a, b) => a + b, 0) * 100) / 100,
        memoryMiB: Math.round(mems.reduce((a, b) => a + b, 0) * 100) / 100,
        sampledAt: metricsList.map((m) => m.timestamp).sort()[0]!,
      };
    }
  }
  const roleNames = ["wordpress", "database", "adapter"];
  for (const [index, key, name] of [
    [0, "wordpress", "WordPress"],
    [1, "database", "MariaDB"],
    [2, "mcp", "WooCommerce MCP"],
  ] as const) {
    const r = get(index) as Workload | null | undefined;
    const role = roleNames[index];
    const relevant = podList.filter(
      (p) => p.metadata.labels?.["role"] === role,
    );
    const reasons = relevant.flatMap((p) =>
      (p.status?.containerStatuses ?? []).flatMap((c) =>
        [c.state?.waiting?.reason, c.state?.terminated?.reason].filter(
          (v): v is string => !!v && knownReasons.has(v) && v !== "Completed",
        ),
      ),
    );
    const containers = r?.spec?.template?.spec?.containers ?? [];
    const usage = metricsList.filter((m) =>
      relevant.some((p) => p.metadata.name === m.metadata.name),
    );
    const usageCpu = usage.flatMap((m) =>
      m.containers.map((c) => cpu(c.usage.cpu)),
    );
    const usageMemory = usage.flatMap((m) =>
      m.containers.map((c) => memory(c.usage.memory)),
    );
    out.components.push({
      id: key,
      kind: index === 1 ? "StatefulSet" : "Deployment",
      name,
      state:
        r === null
          ? "Absent"
          : !r
            ? "Unknown"
            : r.metadata.deletionTimestamp
              ? "Terminating"
              : Number(r.status?.readyReplicas ?? 0) >=
                    Number(r.spec?.replicas ?? 1) &&
                  Number(r.spec?.replicas ?? 1) > 0
                ? "Ready"
                : "Not ready",
      ...(r?.metadata.uid ? { uid: r.metadata.uid } : {}),
      detail:
        r?.metadata.name ??
        (key === "wordpress"
          ? "store-wp"
          : key === "database"
            ? "store-db"
            : "store-mcp"),
      resources: {
        requests: containers[0]?.resources?.requests ?? {},
        limits: containers[0]?.resources?.limits ?? {},
      },
      ...(usage.length && [...usageCpu, ...usageMemory].every(Number.isFinite)
        ? {
            usage: {
              cpuMillicores:
                Math.round(usageCpu.reduce((a, b) => a + b, 0) * 100) / 100,
              memoryMiB:
                Math.round(usageMemory.reduce((a, b) => a + b, 0) * 100) / 100,
              sampledAt: usage[0]!.timestamp,
            },
          }
        : {}),
      configuration: {
        image: containers[0]?.image ?? null,
        readyReplicas: r?.status?.readyReplicas ?? 0,
        desiredReplicas: r?.spec?.replicas ?? 1,
        restarts: relevant.reduce(
          (sum, p) =>
            sum +
            (p.status?.containerStatuses ?? []).reduce(
              (n, c) => n + (c.restartCount ?? 0),
              0,
            ),
          0,
        ),
        pods: relevant.length,
      },
      diagnostics: [...new Set(reasons)],
    });
  }
  const claims = get(3) as { items?: Claim[] } | null | undefined;
  for (const claim of claims?.items ?? []) {
    const key =
      claim.metadata.name === "store-db" ? "database-volume" : "content-volume";
    out.components.push({
      id: key,
      kind: "PersistentVolumeClaim",
      name: key === "database-volume" ? "Database volume" : "Content volume",
      state: claim.status?.phase ?? "Unknown",
      ...(claim.metadata.uid ? { uid: claim.metadata.uid } : {}),
      detail: claim.metadata.name,
      configuration: {
        volumeName: claim.spec?.volumeName ?? null,
        storageClass: claim.spec?.storageClassName ?? null,
        allocated:
          claim.status?.capacity?.storage ??
          claim.spec?.resources?.requests?.storage ??
          null,
      },
      diagnostics: [],
    });
    out.edges.push({
      from: key === "database-volume" ? "database" : "wordpress",
      to: key,
      relationship: "persists to",
    });
  }
  const quota = get(5) as
    | {
        spec?: { hard: Record<string, string> };
        status?: { used: Record<string, string> };
      }
    | null
    | undefined;
  if (quota?.spec)
    out.quota = { hard: quota.spec.hard, used: quota.status?.used ?? {} };
  out.components.push(gateway);
  out.edges.push(
    { from: "namespace", to: "wordpress", relationship: "contains" },
    { from: "namespace", to: "database", relationship: "contains" },
    { from: "namespace", to: "mcp", relationship: "contains" },
    {
      from: "wordpress",
      to: "database",
      relationship: "stores commerce data in",
    },
    {
      from: "mcp",
      to: "wordpress",
      relationship: "calls private WooCommerce REST",
    },
    {
      from: "gateway",
      to: "mcp",
      relationship: "routes authenticated tool calls",
    },
  );
  return out;
}
