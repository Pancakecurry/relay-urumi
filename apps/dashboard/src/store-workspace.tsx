import { useState, useEffect, type ReactNode } from "react";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  Search,
  ArrowUpRight,
  RefreshCw,
  Check,
  Clock3,
  AlertTriangle,
  Box,
  Database,
  HardDrive,
  Network,
  Server,
  ShieldCheck,
  Trash2,
  X,
  ChevronRight,
  Copy,
  Terminal,
} from "lucide-react";
import type { StoreObservation } from "../../../packages/contracts/src/stores";
import "./store-workspace.css";
type Client = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
interface StoreRow {
  id: string;
  name: string;
  namespace: string;
  host: string;
  url: string;
  status: string;
  desired: string;
  phase: string;
  generation: number;
  attempt: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  deadline: string;
  upstream_id: string | null;
  user_id: string;
}
interface Event {
  generation: number;
  phase: string;
  code: string | null;
  created_at: string;
}
const stamp = (value: string | undefined | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Not recorded";
const elapsed = (start: string, end: number) => {
  const secs = Math.max(
    0,
    Math.floor((end - new Date(start).getTime()) / 1000),
  );
  return secs < 60
    ? `${secs}s`
    : secs < 3600
      ? `${Math.floor(secs / 60)}m ${secs % 60}s`
      : `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
};
const success = new Set(["Ready", "Active", "Connected", "Bound", "Deleted"]);
function requestError(message: string) {
  const explanations: Record<string, string> = {
    STORE_LIMIT:
      "Your store limit is reached. Delete an existing store and wait for verified cleanup before creating another.",
    STORE_IDEMPOTENCY_CONFLICT:
      "This request ID belongs to a different operation. Review the operation log before starting a new request.",
    STORE_STATE_CONFLICT:
      "The store state changed. Refresh its lifecycle before retrying.",
    STORE_NOT_FOUND:
      "This store is unavailable or your identity cannot manage it.",
    INVALID_INPUT:
      "Use a store name with letters, numbers, spaces, hyphens or underscores.",
    OBSERVATION_UNAVAILABLE:
      "Live infrastructure details are unavailable. The durable lifecycle remains available.",
  };
  return explanations[message] ?? message.replaceAll("_", " ");
}
function State({ value }: { value: string }) {
  return (
    <span
      className={`os-state ${success.has(value) ? "good" : ["Failed", "RecoveryRequired", "Unreachable", "Not ready"].includes(value) ? "bad" : ["Provisioning", "Deleting", "Terminating", "Discovering"].includes(value) ? "busy" : "neutral"}`}
    >
      <i />
      {value === "RecoveryRequired" ? "Recovery required" : value}
    </span>
  );
}
const diagnostics: Record<
  string,
  { title: string; reason: string; action: string }
> = {
  PROVISIONING_TIMEOUT: {
    title: "This operation reached its deadline",
    reason:
      "The controller stopped waiting before every acceptance check completed. Existing owned resources are retained for safe recovery.",
    action:
      "Retry to start a new bounded attempt, or delete the partial store.",
  },
  IMAGE_UNAVAILABLE: {
    title: "A workload image could not be pulled",
    reason:
      "Kubernetes reported an image pull error. The previous working deployment may still be serving.",
    action:
      "Ask the operator to check the pinned image and registry availability, then retry.",
  },
  PERSISTED_STORE_SECRET_MISSING: {
    title: "A persisted store is missing a credential",
    reason:
      "Generating a replacement could disconnect the database or change an existing identity, so recovery stopped safely.",
    action:
      "The operator must restore the missing Secret from its secure backup before you retry.",
  },
  OWNERSHIP_CONFLICT: {
    title: "A resource belongs to a different owner",
    reason:
      "The controller refused to reuse or delete a resource whose ownership did not match this store.",
    action:
      "Ask the operator to inspect ownership. Retrying cannot safely take over this resource.",
  },
  RESOURCE_IDENTITY_CHANGED: {
    title: "The namespace identity changed",
    reason:
      "Its current Kubernetes UID differs from the identity recorded during provisioning.",
    action:
      "An operator must investigate the replacement and data before retrying or deleting.",
  },
  CLEANUP_PENDING: {
    title: "Kubernetes cleanup is still pending",
    reason:
      "The namespace has not disappeared yet. Finalizers or storage cleanup may still be running.",
    action:
      "The controller will keep checking until the deadline. Do not remove unknown finalizers.",
  },
  VOLUME_CLEANUP_PENDING: {
    title: "Persistent storage cleanup is pending",
    reason:
      "A recorded persistent volume still exists. Deletion cannot be marked complete yet.",
    action:
      "Wait for the storage controller, or ask the operator to inspect its reclaim policy and finalizers.",
  },
  HELM_RECONCILE_FAILED: {
    title: "Helm could not complete this deployment",
    reason:
      "A chart operation failed before the store passed its readiness checks.",
    action:
      "Inspect the component diagnostics. Retry reuses owned resources instead of creating a duplicate store.",
  },
  BOOTSTRAP_FAILED: {
    title: "WooCommerce initialization failed",
    reason:
      "The real bootstrap Job reported a failure. The store is not being presented as ready.",
    action:
      "Ask the operator to inspect database readiness and the bootstrap Job, then retry.",
  },
  RESOURCE_QUOTA_EXCEEDED: {
    title: "The namespace resource budget was exceeded",
    reason:
      "Kubernetes refused a resource that would exceed the configured quota.",
    action:
      "Ask the operator to review the chart requests and namespace budget, then retry.",
  },
};
function Problem({ code }: { code: string }) {
  const d = diagnostics[code] ?? {
    title: code.replaceAll("_", " ").toLowerCase(),
    reason: "The controller could not verify this lifecycle step.",
    action:
      "Inspect the observed components and operation history before retrying.",
  };
  return (
    <div className="os-problem" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>{d.title}</strong>
        <p>{d.reason}</p>
        <p>{d.action}</p>
        <code>{code}</code>
      </div>
    </div>
  );
}
function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal">
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {title}. All lifecycle changes are enforced by the platform.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function ComponentIcon({ kind }: { kind: string }) {
  const Icon =
    kind === "StatefulSet"
      ? Database
      : kind === "PersistentVolumeClaim"
        ? HardDrive
        : kind === "Gateway registration"
          ? Network
          : kind === "Namespace"
            ? ShieldCheck
            : kind === "Store"
              ? Box
              : Server;
  return <Icon size={19} />;
}
const creation = [
  ["Requested", "Request accepted"],
  ["Admission", "Namespace created"],
  ["StoreInstall", "Resources configured"],
  ["DatabaseReady", "Helm deployment"],
  ["DatabaseReady", "Database ready"],
  ["WooCommerceInitialized", "WooCommerce initialized"],
  ["Ready", "MCP registered"],
  ["Ready", "Store ready"],
] as const;
const deletion = [
  ["Drain", "Routes denied"],
  ["Uninstall", "Calls drained"],
  ["NamespaceCleanup", "Workloads uninstalled"],
  ["NamespaceRemoved", "Namespace removed"],
  ["VolumesRemoved", "Volumes removed"],
  ["CredentialsRemoved", "Credentials removed"],
  ["Deleted", "Cleanup verified"],
] as const;
function Lifecycle({
  store,
  events,
  operations,
  now,
}: {
  store: StoreRow;
  events: Event[];
  operations: { generation: number; kind: string; created_at: string }[];
  now: number;
}) {
  const [generation, setGeneration] = useState(store.generation);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setGeneration(store.generation);
  }, [store.generation]);
  const relevant = events.filter((e) => e.generation === generation);
  const operation = operations.find((o) => o.generation === generation);
  const isDeleting =
    generation === store.generation
      ? store.desired === "absent"
      : operation?.kind === "delete" ||
        relevant.some((e) =>
          ["Teardown", "Uninstall", "NamespaceCleanup", "Deleted"].includes(
            e.phase,
          ),
        );
  const steps = isDeleting ? deletion : creation;
  const initial =
    operation?.created_at ??
    (generation === 1 ? store.created_at : relevant[0]?.created_at);
  const terminal =
    generation < store.generation ||
    ["Ready", "Failed", "Deleted", "RecoveryRequired"].includes(store.status);
  const latest = relevant.at(-1);
  const ready =
    relevant.some((e) => e.phase === "Ready" && !e.code) ||
    (generation === store.generation && store.status === "Ready");
  const deleted = generation === store.generation && store.status === "Deleted";
  const matches = steps.map(([phase]) =>
    phase === "Requested" && (operation || generation === 1)
      ? {
          generation,
          phase,
          code: null,
          created_at: operation?.created_at ?? store.created_at,
        }
      : relevant.find((e) => e.phase === phase && !e.code),
  );
  const active = Math.min(
    steps.length - 1,
    matches.reduce((n, e, i) => (e ? i + 1 : n), 0),
  );
  return (
    <section
      className="os-lifecycle"
      aria-label={isDeleting ? "Deletion lifecycle" : "Provisioning lifecycle"}
    >
      <div className="os-section-heading">
        <div>
          <h3>{isDeleting ? "Verified cleanup" : "Provisioning journey"}</h3>
          <p>
            {terminal
              ? "Recorded lifecycle checkpoints"
              : "Live operation · no estimated percentages"}
          </p>
        </div>
        <label className="os-generation">
          Attempt
          <select
            aria-label="Lifecycle generation"
            value={generation}
            onChange={(e) => {
              setGeneration(Number(e.target.value));
              setSelected(null);
            }}
          >
            {[
              ...new Set([
                store.generation,
                ...events.map((e) => e.generation),
              ]),
            ]
              .sort((a, b) => b - a)
              .map((g) => (
                <option key={g} value={g}>
                  Generation {g}
                </option>
              ))}
          </select>
        </label>
      </div>
      <ol className="os-steps">
        {steps.map(([, label], index) => {
          const event = matches[index];
          const complete =
            (isDeleting && index === 0 && generation === store.generation) ||
            !!event ||
            (index === 0 && generation === 1) ||
            (ready && !isDeleting) ||
            deleted;
          const failed =
            !complete &&
            index === active &&
            generation === store.generation &&
            ["Failed", "RecoveryRequired"].includes(store.status);
          const running = !terminal && !complete && index === active;
          return (
            <li
              key={label}
              className={
                complete ? "done" : failed ? "failed" : running ? "current" : ""
              }
            >
              <button
                aria-label={`${label}: ${complete ? "verified" : failed ? "failed" : running ? "in progress" : "not yet verified"}`}
                aria-pressed={selected === index}
                onClick={() => setSelected(selected === index ? null : index)}
              >
                <span className="os-step-marker">
                  {complete ? (
                    <Check size={12} />
                  ) : failed ? (
                    <X size={12} />
                  ) : running ? (
                    <Clock3 size={12} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>
                    {event
                      ? stamp(event.created_at)
                      : index === 0 && initial
                        ? stamp(initial)
                        : complete
                          ? "Verified before completion"
                          : running
                            ? "In progress"
                            : failed
                              ? "Needs attention"
                              : "Awaiting verification"}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {selected !== null && (
        <div className="os-checkpoint">
          <Terminal size={15} />
          <div>
            <strong>{steps[selected]![1]}</strong>
            <p>
              {matches[selected]
                ? `Recorded ${stamp(matches[selected]!.created_at)} in generation ${generation}.`
                : ready || deleted
                  ? "Verified by the completed lifecycle. A separate timestamp was not recorded in this historical generation."
                  : "This checkpoint has not been recorded as complete."}
            </p>
          </div>
        </div>
      )}
      <div className="os-operation-footer">
        <span>
          <Clock3 size={13} />
          {initial
            ? `${terminal ? "Recorded span" : "Elapsed"} ${elapsed(initial, terminal ? new Date(latest?.created_at ?? store.updated_at).getTime() : now)}`
            : "Waiting for the controller"}
        </span>
        <span>
          {store.attempt} retry attempt{store.attempt === 1 ? "" : "s"} ·{" "}
          {store.status === "Ready"
            ? "Checks passed"
            : `Deadline ${stamp(store.deadline)}`}
        </span>
      </div>
    </section>
  );
}
export function StoreWorkspace({
  api,
  team,
  admin,
  userId,
}: {
  api: Client;
  team: string;
  admin: boolean;
  userId: string;
}) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [tab, setTab] = useState("infrastructure");
  const [component, setComponent] = useState("wordpress");
  const [create, setCreate] = useState(false);
  const [deleting, setDeleting] = useState<StoreRow | null>(null);
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stores = useQuery({
    queryKey: [team, "stores"],
    queryFn: () => api<{ stores: StoreRow[]; limit: number }>("stores"),
    refetchInterval: 2500,
  });
  const rows = stores.data?.stores ?? [];
  const current =
    rows.find((s) => s.id === params.get("store")) ??
    rows.find((s) => s.status !== "Deleted") ??
    rows[0];
  const visible = rows.filter(
    (s) =>
      (includeDeleted || s.status !== "Deleted") &&
      `${s.name} ${s.host} ${s.namespace}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const observations = useQueries({
    queries: rows
      .filter((s) => s.status !== "Deleted")
      .map((s) => ({
        queryKey: [team, "store-observed", s.id],
        queryFn: () => api<StoreObservation>(`stores/${s.id}/observed`),
        refetchInterval: 10000,
        retry: false,
        staleTime: 5000,
      })),
  });
  const byId = new Map(
    observations.flatMap((o) =>
      o.data ? [[o.data.storeId, o.data] as const] : [],
    ),
  );
  const observed = current ? byId.get(current.id) : undefined;
  const events = useQuery({
    queryKey: [team, "store-events", current?.id],
    queryFn: () =>
      api<{
        events: Event[];
        operations: { generation: number; kind: string; created_at: string }[];
      }>(`stores/${current!.id}/events`),
    enabled: !!current,
    refetchInterval: 2500,
  });
  const catalog = useQuery({
    queryKey: [team, "store-tool-catalog", current?.id],
    queryFn: () =>
      api<{
        tools: {
          upstreamId: string;
          name: string;
          alias: string;
          description?: string;
          inputSchema: unknown;
          outputSchema?: unknown;
        }[];
      }>("tools"),
    enabled: !!current && current.status !== "Deleted",
    refetchInterval: 10000,
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      id,
      key,
    }: {
      action: string;
      id?: string;
      key: string;
    }) =>
      api<{ store: StoreRow }>(
        action === "create" ? "stores" : `stores/${id}/${action}`,
        "POST",
        { idempotencyId: key, ...(action === "create" ? { name } : {}) },
      ),
    onSuccess: (r) => {
      qc.setQueryData<{ stores: StoreRow[]; limit: number }>(
        [team, "stores"],
        (previous) =>
          previous
            ? {
                ...previous,
                stores: previous.stores.some((s) => s.id === r.store.id)
                  ? previous.stores.map((s) =>
                      s.id === r.store.id ? r.store : s,
                    )
                  : [r.store, ...previous.stores],
              }
            : undefined,
      );
      void qc.invalidateQueries();
      setCreate(false);
      setDeleting(null);
      setNotice(
        `${r.store.name}: ${r.store.status === "Deleting" ? "deletion requested. Tools are denied while cleanup is verified." : "operation accepted. Follow its live lifecycle below."}`,
      );
      setParams({ store: r.store.id });
      setTab("lifecycle");
      setIntent(crypto.randomUUID());
    },
    onError: () => setNotice(""),
  });
  const canManage = current && (admin || current.user_id === userId);
  const selected = observed?.components.find((c) => c.id === component);
  const healthy = rows.filter((s) => s.status === "Ready").length;
  const pending = rows.filter((s) =>
    ["Provisioning", "Deleting"].includes(s.status),
  ).length;
  const attention = rows.filter((s) =>
    ["Failed", "RecoveryRequired"].includes(s.status),
  ).length;
  function chooseComponent(id: string) {
    setComponent(id);
    if (window.matchMedia("(max-width:1249px)").matches)
      requestAnimationFrame(() =>
        document.getElementById("store-component-details")?.focus(),
      );
  }
  function select(s: StoreRow) {
    setParams({ store: s.id });
    setTab("infrastructure");
    setComponent("wordpress");
    setNotice("");
  }
  function copy(value: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => setNotice("Copied to clipboard."))
      .catch(() =>
        setNotice("Clipboard unavailable. Select and copy the value manually."),
      );
  }
  return (
    <div className="orchestration">
      <header className="page-title">
        <div>
          <div className="eyebrow">COMMERCE / ORCHESTRATION</div>
          <h1>Stores</h1>
          <p>Isolated infrastructure. A shared path to every tool.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setIntent(crypto.randomUUID());
            mutation.reset();
            setName("");
            setCreate(true);
          }}
        >
          <Plus size={16} />
          Create store
        </button>
      </header>
      <div className="os-summary">
        <div>
          <span className="os-summary-number">
            {rows.filter((s) => s.status !== "Deleted").length}
          </span>
          <span>Active stores</span>
        </div>
        <div>
          <i className="os-dot good" />
          <strong>{healthy}</strong>
          <span>Ready</span>
        </div>
        <div>
          <i className="os-dot busy" />
          <strong>{pending}</strong>
          <span>In progress</span>
        </div>
        <div>
          <i className="os-dot bad" />
          <strong>{attention}</strong>
          <span>Need attention</span>
        </div>
        <span className="os-summary-boundary">
          <ShieldCheck size={14} /> {stores.data?.limit ?? 2} stores / owner ·
          isolated by namespace
        </span>
      </div>
      {notice && (
        <div className="os-notice" role="status">
          <Check size={15} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(stores.error || mutation.error) && (
        <div className="feedback error" role="alert">
          {requestError(
            (stores.error ?? mutation.error)?.message ?? "Request unavailable",
          )}
          . No successful operation is assumed.
        </div>
      )}
      {stores.isLoading ? (
        <div className="os-loading" aria-label="Loading store orchestration">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : !rows.length ? (
        <section className="os-empty">
          <Box size={32} />
          <div className="eyebrow">YOUR NEXT ENVIRONMENT</div>
          <h2>One request. Its own infrastructure.</h2>
          <p>
            Create a persistent WooCommerce store with an isolated database,
            private MCP tools and a lifecycle you can inspect.
          </p>
          <button
            onClick={() => {
              setCreate(true);
              setIntent(crypto.randomUUID());
            }}
          >
            Create your first store <ChevronRight size={16} />
          </button>
          <div className="os-empty-foot">
            Kubernetes namespaces · Helm releases · Durable recovery
          </div>
        </section>
      ) : (
        <div className="os-layout">
          <aside className="os-rail" aria-label="Store navigation">
            <div className="os-search">
              <Search size={15} />
              <input
                aria-label="Search stores"
                placeholder="Find a store…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="os-show-deleted">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
              />
              Include deleted
            </label>
            <div className="os-store-list">
              {visible.map((s) => (
                <button
                  key={s.id}
                  className={`os-store-option ${current?.id === s.id ? "selected" : ""}`}
                  aria-label={`Select ${s.name}`}
                  aria-pressed={current?.id === s.id}
                  onClick={() => select(s)}
                >
                  <span className="os-store-monogram">
                    {s.name[0]?.toUpperCase()}
                  </span>
                  <span className="os-store-description">
                    <strong>{s.name}</strong>
                    <State value={s.status} />
                    <small>
                      {s.id.slice(0, 8)} ·{" "}
                      {s.status === "Deleted"
                        ? "Resources removed"
                        : byId.get(s.id)
                        ? `${byId.get(s.id)!.tools.length} visible tools`
                        : "Awaiting observation"}
                    </small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
            {!visible.length && (
              <p className="os-filter-empty">No stores match this search.</p>
            )}
            <div className="os-rail-gateway">
              <Network size={16} />
              <div>
                <strong>One shared gateway</strong>
                <code>/mcp</code>
              </div>
              <Link to="/servers" aria-label="Manage gateway connections">
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </aside>
          {current && (
            <article
              className="os-workspace"
              aria-label={`${current.name} workspace`}
            >
              <div className="os-store-heading">
                <div>
                  <div className="os-identity">
                    <span className="os-store-monogram large">
                      {current.name[0]?.toUpperCase()}
                    </span>
                    <div>
                      <h2>{current.name}</h2>
                      <span className="mono">
                        {current.id.slice(0, 8)}{" "}
                        <button
                          className="icon-button"
                          aria-label="Copy store ID"
                          onClick={() => copy(current.id)}
                        >
                          <Copy size={12} />
                        </button>
                      </span>
                    </div>
                  </div>
                  <div className="os-store-meta">
                    <State value={current.status} />
                    <span>Created {stamp(current.created_at)}</span>
                  </div>
                </div>
                <div className="os-actions">
                  {current.status === "Ready" && (
                    <a
                      className="os-storefront"
                      href={current.url + "/shop/"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Storefront <ArrowUpRight size={14} />
                    </a>
                  )}
                  {canManage && current.status === "Ready" && (
                    <button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          action: "reconcile",
                          id: current.id,
                          key: crypto.randomUUID(),
                        })
                      }
                    >
                      <RefreshCw size={14} />
                      Verify / repair
                    </button>
                  )}
                  {canManage &&
                    ["Failed", "RecoveryRequired"].includes(current.status) && (
                      <button
                        className="primary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            action: "retry",
                            id: current.id,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        <RefreshCw size={14} />
                        Retry operation
                      </button>
                    )}
                  {canManage &&
                    !["Deleted", "Deleting"].includes(current.status) && (
                      <button
                        className="icon-button danger"
                        aria-label={`Delete ${current.name}`}
                        onClick={() => {
                          setDeleting(current);
                          setIntent(crypto.randomUUID());
                          setConfirm("");
                          mutation.reset();
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                </div>
              </div>
              <div className="os-address">
                <span>STOREFRONT</span>
                <code>{current.host}</code>
                <button
                  className="icon-button"
                  aria-label="Copy storefront URL"
                  onClick={() => copy(current.url)}
                >
                  <Copy size={13} />
                </button>
              </div>
              <div className="os-tabs" role="tablist" aria-label="Store views">
                {[
                  ["infrastructure", "Infrastructure"],
                  ["lifecycle", "Lifecycle"],
                  ["tools", "MCP tools"],
                  ["activity", "Operation log"],
                ].map(([id, label]) => (
                  <button
                    role="tab"
                    id={`tab-${id}`}
                    aria-controls={`panel-${id}`}
                    aria-selected={tab === id}
                    tabIndex={tab === id ? 0 : -1}
                    key={id}
                    onClick={() => setTab(id!)}
                    onKeyDown={(e) => {
                      if (
                        ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                          e.key,
                        )
                      ) {
                        e.preventDefault();
                        const values = [
                          "infrastructure",
                          "lifecycle",
                          "tools",
                          "activity",
                        ];
                        const next =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? 3
                              : (values.indexOf(tab) +
                                  (e.key === "ArrowRight" ? 1 : 3)) %
                                4;
                        setTab(values[next]!);
                        document.getElementById(`tab-${values[next]}`)?.focus();
                      }
                    }}
                  >
                    {label}
                    {id === "tools" && observed && (
                      <span>{observed.tools.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {current.error_code && <Problem code={current.error_code} />}
              <div
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
                className="os-panel"
              >
                {tab === "infrastructure" && (
                  <>
                    {current.status === "Deleted" ? (
                      <div className="os-deleted">
                        <Check size={24} />
                        <h3>Cleanup verified</h3>
                        <p>
                          The namespace, workloads, credentials and recorded
                          volumes were verified absent before this store became
                          Deleted.
                        </p>
                        <button onClick={() => setTab("lifecycle")}>
                          Inspect deletion lifecycle
                        </button>
                      </div>
                    ) : !observed ? (
                      <div className="os-awaiting">
                        <Network size={24} />
                        <h3>
                          {observations.some((q) => q.error)
                            ? "Infrastructure observation unavailable"
                            : "Reading Kubernetes state"}
                        </h3>
                        <p>
                          {observations.some((q) => q.error)
                            ? "The durable lifecycle remains available. No health or usage values are being inferred."
                            : "Health and resource values appear only after the private observer responds."}
                        </p>
                        <button
                          onClick={() =>
                            void qc.invalidateQueries({
                              queryKey: [team, "store-observed"],
                            })
                          }
                        >
                          Refresh observation
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="os-observation-heading">
                          <div>
                            <h3>Infrastructure map</h3>
                            <p>
                              Each connection reflects an observed resource
                              relationship.
                            </p>
                          </div>
                          <span>
                            <i className="os-dot good" />
                            Observed {stamp(observed.observedAt)}
                          </span>
                        </div>
                        <div
                          className="os-topology"
                          aria-label="Interactive Kubernetes topology"
                          id="store-topology"
                          tabIndex={-1}
                        >
                          <div className="os-topology-lanes">
                            {[
                              ["store"],
                              ["namespace"],
                              ["wordpress", "database"],
                              ["content-volume", "database-volume"],
                              ["mcp", "gateway"],
                            ].map((ids, lane) => (
                              <div
                                className={`os-topology-lane lane-${lane}`}
                                key={lane}
                              >
                                {ids.map((id) => {
                                  const c = observed.components.find(
                                    (x) => x.id === id,
                                  );
                                  if (!c) return null;
                                  return (
                                    <button
                                      className={`os-node ${component === id ? "selected" : ""}`}
                                      key={id}
                                      aria-label={`Inspect ${c.name}`}
                                      aria-pressed={component === id}
                                      onClick={() => chooseComponent(id)}
                                    >
                                      <ComponentIcon kind={c.kind} />
                                      <span>
                                        <strong>{c.name}</strong>
                                        <State value={c.state} />
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          <div className="os-relationships">
                            <span>Connections</span>
                            {observed.edges.map((e) => (
                              <button
                                key={e.from + e.to}
                                onClick={() => chooseComponent(e.to)}
                              >
                                {
                                  observed.components.find(
                                    (c) => c.id === e.from,
                                  )?.name
                                }
                                <ChevronRight size={11} />
                                {
                                  observed.components.find((c) => c.id === e.to)
                                    ?.name
                                }
                                <small>{e.relationship}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="os-resource-strip">
                          <div>
                            <span>CPU · sampled</span>
                            <strong>
                              {observed.metrics.available
                                ? `${observed.metrics.cpuMillicores?.toFixed(1)} mCPU`
                                : "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Memory · sampled</span>
                            <strong>
                              {observed.metrics.available
                                ? `${observed.metrics.memoryMiB?.toFixed(1)} MiB`
                                : "Unavailable"}
                            </strong>
                          </div>
                          <div>
                            <span>Storage · allocated</span>
                            <strong>
                              {observed.components
                                .filter(
                                  (c) => c.kind === "PersistentVolumeClaim",
                                )
                                .map((c) => c.configuration.allocated)
                                .join(" + ") || "Not observed"}
                            </strong>
                          </div>
                          <div>
                            <span>Gateway discovery</span>
                            <State value={observed.toolState} />
                          </div>
                        </div>
                        {selected && (
                          <section
                            className="os-component"
                            aria-label="Selected component details"
                            id="store-component-details"
                            tabIndex={-1}
                          >
                            <div className="os-section-heading">
                              <div>
                                <div className="eyebrow">{selected.kind}</div>
                                <h3>{selected.name}</h3>
                                <button
                                  className="os-back-map"
                                  onClick={() =>
                                    document
                                      .getElementById("store-topology")
                                      ?.focus()
                                  }
                                >
                                  Back to map
                                </button>
                              </div>
                              <State value={selected.state} />
                            </div>
                            <p className="mono os-wrap">{selected.detail}</p>
                            <dl>
                              {Object.entries(selected.configuration).map(
                                ([key, value]) => (
                                  <div key={key}>
                                    <dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt>
                                    <dd>{String(value ?? "Not observed")}</dd>
                                  </div>
                                ),
                              )}
                              {selected.resources && (
                                <>
                                  <div>
                                    <dt>Resource requests</dt>
                                    <dd>
                                      {Object.entries(
                                        selected.resources.requests,
                                      )
                                        .map(([k, v]) => `${k}: ${v}`)
                                        .join(" · ") || "Not observed"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Resource limits</dt>
                                    <dd>
                                      {Object.entries(selected.resources.limits)
                                        .map(([k, v]) => `${k}: ${v}`)
                                        .join(" · ") || "Not observed"}
                                    </dd>
                                  </div>
                                </>
                              )}
                              {selected.usage && (
                                <div>
                                  <dt>Measured usage</dt>
                                  <dd>
                                    {selected.usage.cpuMillicores.toFixed(1)}{" "}
                                    mCPU · {selected.usage.memoryMiB.toFixed(1)}{" "}
                                    MiB · {stamp(selected.usage.sampledAt)}
                                  </dd>
                                </div>
                              )}
                              {selected.uid && (
                                <div>
                                  <dt>Kubernetes UID</dt>
                                  <dd>{selected.uid}</dd>
                                </div>
                              )}
                            </dl>
                            {selected.diagnostics.map((d) => (
                              <p key={d} className="feedback error">
                                {d}
                              </p>
                            ))}
                          </section>
                        )}
                        {observed.quota && (
                          <details className="os-quota">
                            <summary>
                              <ShieldCheck size={15} />
                              Namespace budget & isolation
                            </summary>
                            <dl>
                              {Object.entries(observed.quota.hard).map(
                                ([key, value]) => (
                                  <div key={key}>
                                    <dt>{key}</dt>
                                    <dd>
                                      {observed.quota?.used[key] ??
                                        "Not observed"}{" "}
                                      reserved / {value} limit
                                    </dd>
                                  </div>
                                ),
                              )}
                            </dl>
                            <p>
                              Runtime CPU and memory samples are separate from
                              admission reservations. Allocated volume capacity
                              is not disk usage.
                            </p>
                          </details>
                        )}
                        {observed.conditions.map((c) => (
                          <p className="os-muted" key={c}>
                            {c}
                          </p>
                        ))}
                      </>
                    )}
                  </>
                )}
                {tab === "lifecycle" && (
                  <>
                    <Lifecycle
                      key={current.id}
                      store={current}
                      events={events.data?.events ?? []}
                      operations={events.data?.operations ?? []}
                      now={now}
                    />
                    {events.error && (
                      <p role="alert">
                        Lifecycle history is unavailable. Current durable state
                        is shown above.
                      </p>
                    )}
                  </>
                )}
                {tab === "tools" && (
                  <section className="os-tools">
                    <div className="os-section-heading">
                      <div>
                        <h3>Tools for this store</h3>
                        <p>
                          Discovered and permission-filtered through your
                          gateway identity.
                        </p>
                      </div>
                      <Link to="/tools">
                        Tool library <ArrowUpRight size={13} />
                      </Link>
                    </div>
                    {catalog.isLoading ? (
                      <div className="skeleton" />
                    ) : catalog.error ? (
                      <p role="alert">
                        Gateway discovery is unavailable. No tool success is
                        assumed.
                      </p>
                    ) : !catalog.data?.tools.filter(
                        (t) => t.upstreamId === current.id,
                      ).length ? (
                      <p className="os-muted">
                        No enabled, permitted tools are visible. Registration
                        follows adapter readiness; disabled or deleted stores
                        cannot accept new calls.
                      </p>
                    ) : (
                      catalog.data.tools
                        .filter((t) => t.upstreamId === current.id)
                        .map((t) => (
                          <details key={t.alias}>
                            <summary>
                              <Terminal size={15} />
                              <strong>{t.name}</strong>
                              <ChevronRight size={14} />
                            </summary>
                            <p>{t.description}</p>
                            <code className="os-wrap">{t.alias}</code>
                            <h4>Input schema</h4>
                            <pre className="json">
                              {JSON.stringify(t.inputSchema, null, 2)}
                            </pre>
                            {t.outputSchema !== undefined && (
                              <>
                                <h4>Output schema</h4>
                                <pre className="json">
                                  {JSON.stringify(t.outputSchema, null, 2)}
                                </pre>
                              </>
                            )}
                          </details>
                        ))
                    )}
                  </section>
                )}
                {tab === "activity" && (
                  <section className="os-log">
                    <h3>Actual lifecycle events</h3>
                    <p className="os-muted">
                      Append-only checkpoints include prior attempts and
                      recovery. No synthetic activity is added.
                    </p>
                    {events.data?.events.length ? (
                      <ol>
                        {[...events.data.events]
                          .reverse()
                          .map((event, index) => (
                            <li key={index}>
                              <time>{stamp(event.created_at)}</time>
                              <span
                                className={event.code ? "os-log-error" : ""}
                              >
                                {event.phase}
                              </span>
                              <small>g{event.generation}</small>
                              {event.code && <code>{event.code}</code>}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p>Accepted; awaiting the first controller checkpoint.</p>
                    )}
                  </section>
                )}
              </div>
            </article>
          )}
        </div>
      )}
      <Modal
        title="Create store"
        open={create}
        onClose={() => setCreate(false)}
      >
        <div className="os-create-intro">
          <Box size={24} />
          <p>
            A real WooCommerce environment, isolated from every other store.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ action: "create", key: intent });
          }}
        >
          <label className="field">
            Store name
            <input
              name="name"
              required
              maxLength={60}

              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Northstar demo"
            />
          </label>
          <ul className="os-create-facts">
            <li>
              <ShieldCheck size={15} />
              Dedicated namespace, database and Secrets
            </li>
            <li>
              <HardDrive size={15} />
              Persistent content and order storage
            </li>
            <li>
              <Terminal size={15} />
              Automatic private MCP registration
            </li>
          </ul>
          <p className="os-muted">
            Up to {stores.data?.limit ?? 2} stores per owner across teams. Cash
            on Delivery and labelled synthetic products are enabled. The default
            provisioning deadline is ten minutes. Closing this dialog does not
            cancel an accepted operation.
          </p>
          {mutation.error && (
            <p className="feedback error" role="alert">
              {requestError(mutation.error.message)}
            </p>
          )}
          <button className="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting request…" : "Provision store"}
          </button>
        </form>
      </Modal>
      <Modal
        title="Delete store"
        open={!!deleting}
        onClose={() => setDeleting(null)}
      >
        <div className="os-delete-warning">
          <Trash2 size={20} />
          <div>
            <strong>Delete {deleting?.name} permanently</strong>
            <p>
              Orders, database, content and credentials cannot be restored
              through this application.
            </p>
          </div>
        </div>
        <ol className="os-delete-sequence">
          <li>Immediately deny this store’s tools</li>
          <li>Drain calls and uninstall workloads</li>
          <li>Remove Secrets, namespace and volumes</li>
          <li>Verify absence before marking Deleted</li>
        </ol>
        <label className="field">
          Type the store name to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {mutation.error && (
          <p className="feedback error" role="alert">
            {requestError(mutation.error.message)}
          </p>
        )}
        <div className="os-dialog-actions">
          <button onClick={() => setDeleting(null)}>Keep store</button>
          <button
            className="danger"
            disabled={confirm !== deleting?.name || mutation.isPending}
            onClick={() =>
              deleting &&
              mutation.mutate({
                action: "delete",
                id: deleting.id,
                key: intent,
              })
            }
          >
            {mutation.isPending ? "Requesting deletion…" : "Delete permanently"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
