import React, {
  useState,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import Markdown from "react-markdown";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  X,
  Send,
  Copy,
  Workflow,
} from "lucide-react";
import "./style.css";
type Row = Record<string, unknown>;
type Tool = {
  name: string;
  alias?: string;
  upstreamName?: string;
  description?: string;
  inputSchema: Row;
  outputSchema?: Row;
  _meta?: Row;
};
type Upstream = {
  id: string;
  name: string;
  url?: string;
  status: string;
  reason?: string;
  checked_at?: string;
  tool_count?: number;
  enabled: boolean;
  revision: number;
  timeout_ms?: number;
  has_credentials: boolean;
};
type Overview = {
  upstreams: Upstream[];
  activity: Row[];
  role: string;
  userId: string;
  gatewayUrl: string;
  budget: { reserved_paise: string; remaining_paise: string };
  model: string;
  modelEnabled: boolean;
};
const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true, staleTime: 3000 },
  },
});
let currentTeam = localStorage.getItem("relay.team") ?? "";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(currentTeam ? { "x-relay-team": currentTeam } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      d.error?.code ?? d.code ?? d.message ?? `Request failed (${r.status})`,
    );
  return d as T;
}
function useData<T>(path: string, enabled = true, interval = 5000) {
  return useQuery({
    queryKey: [currentTeam, path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: interval || false,
  });
}
const str = (v: unknown) => String(v ?? "—");
const when = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
function Badge({ value }: { value: unknown }) {
  return (
    <span className={`badge ${String(value).toLowerCase()}`}>
      <i />
      {str(value)}
    </span>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Workflow size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Feedback({ error }: { error: Error | null | undefined }) {
  return error ? (
    <div role="alert" className="feedback error">
      {error.message.replaceAll("_", " ").toLowerCase()}. Review the details and
      try again.
    </div>
  ) : null;
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
            {title}. Changes are enforced by the platform.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, set] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            set(true);
            setTimeout(() => set(false), 2000);
          })
          .catch(() => setError(true));
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
      {error ? "Select and copy manually" : copied ? "Copied" : label}
    </button>
  );
}
function Form({
  children,
  onSubmit,
  pending,
  error,
  label = "Save changes",
}: {
  children: ReactNode;
  onSubmit: (d: FormData) => void;
  pending: boolean;
  error?: Error | null;
  label?: string;
}) {
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      {children}
      <Feedback error={error} />
      <button className="primary" disabled={pending}>
        {pending ? "Working…" : label}
      </button>
    </form>
  );
}
function Field({
  label,
  name,
  value = "",
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
    </label>
  );
}
function PageTitle({
  kicker,
  title,
  children,
  action,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <div className="eyebrow">{kicker}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </header>
  );
}
function Auth({ refresh }: { refresh: () => void }) {
  const [signup, setSignup] = useState(false);
  const action = useMutation({
    mutationFn: (d: FormData) =>
      api(`auth/${signup ? "sign-up" : "sign-in"}/email`, "POST", {
        email: d.get("email"),
        password: d.get("password"),
        ...(signup ? { name: d.get("name") } : {}),
      }),
    onSuccess: refresh,
  });
  return (
    <main className="auth">
      <div className="auth-story">
        <div className="brand">
          <Workflow size={25} /> relay<span>CONTROL PLANE</span>
        </div>
        <div>
          <div className="eyebrow">ONE ENDPOINT. EVERY TOOL.</div>
          <h1>
            Your infrastructure.
            <br />
            Within reach.
          </h1>
          <p>
            Connect your services, understand every execution, and give your
            team a secure path to work.
          </p>
          <div className="auth-path">
            <span>Identity</span>
            <ChevronRight />
            <span>Gateway</span>
            <ChevronRight />
            <span>Your tools</span>
          </div>
        </div>
        <small>Built on Kubernetes · Streamable HTTP · Team identities</small>
      </div>
      <section className="auth-form">
        <ShieldCheck size={28} />
        <h2>{signup ? "Create your identity" : "Welcome to Relay"}</h2>
        <p>
          {signup
            ? "Start with an identity, then create or join a team."
            : "Sign in to your team’s control room."}
        </p>
        <Form
          onSubmit={(d) => action.mutate(d)}
          pending={action.isPending}
          error={action.error}
          label={signup ? "Create account" : "Sign in"}
        >
          {signup && <Field label="Name" name="name" required />}
          <Field label="Email" name="email" type="email" required />
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              minLength={signup ? 12 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
          </label>
          {signup && <small>Use at least 12 characters.</small>}
        </Form>
        <button
          className="text-button"
          onClick={() => {
            setSignup(!signup);
            action.reset();
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
const nav = [
  { to: "/", label: "Control room", icon: LayoutDashboard },
  { to: "/servers", label: "MCP servers", icon: Server },
  { to: "/tools", label: "Tool library", icon: Boxes },
  { to: "/agent", label: "Agent workspace", icon: MessageSquare },
  { to: "/audit", label: "Audit explorer", icon: Activity },
  { to: "/team", label: "Team", icon: Users },
  { to: "/keys", label: "API keys", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
];
function App() {
  const [team, setTeam] = useState(currentTeam);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const paletteRefresh = useMutation({
    mutationFn: () => api("tools"),
    onSuccess: () => {
      void qc.invalidateQueries();
      setPalette(false);
      setSearch("");
    },
  });
  const config = useData<{ storefrontUrl: string }>("config", true, 0);
  const me = useData<{ user: { id: string; name: string; email: string } }>(
    "me",
    true,
    0,
  );
  const teams = useData<{
    teams: { id: string; name: string; role: string }[];
  }>("teams", !!me.data, 0);
  useEffect(() => {
    const first = teams.data?.teams[0];
    if (first && !teams.data?.teams.some((t) => t.id === team)) {
      currentTeam = first.id;
      localStorage.setItem("relay.team", first.id);
      setTeam(first.id);
      void qc.invalidateQueries();
    }
  }, [teams.data, team]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  if (me.isPending)
    return <main className="loading-screen">Connecting to Relay…</main>;
  if (!me.data)
    return (
      <Auth
        refresh={() => {
          void qc.invalidateQueries();
        }}
      />
    );
  const selected = teams.data?.teams.find((t) => t.id === team);
  const logout = () => {
    void api("auth/sign-out", "POST", {}).then(() => {
      currentTeam = "";
      localStorage.removeItem("relay.team");
      setTeam("");
      qc.clear();
      void qc.invalidateQueries();
    });
  };
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <Workflow size={23} /> relay
        </div>
        <label className="team-picker">
          Workspace
          <select
            aria-label="Team workspace"
            value={team}
            onChange={(e) => {
              currentTeam = e.target.value;
              localStorage.setItem("relay.team", currentTeam);
              setTeam(currentTeam);
              qc.clear();
            }}
          >
            {teams.data?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="palette-trigger" onClick={() => setPalette(true)}>
          <Search size={15} /> Jump to…<kbd>⌘ K</kbd>
        </button>
        <nav aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobile(false)}
            >
              <Icon size={17} />
              {label}
              {to === "/agent" && (
                <span className="nav-mark" aria-hidden="true">
                  AI
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <i /> KUBERNETES WORKSPACE
          </div>
          <div className="identity">
            <div className="avatar">{me.data.user.name[0]}</div>
            <div>
              <strong>{me.data.user.name}</strong>
              <small>{selected?.role ?? "No team yet"}</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            <Menu size={19} />
          </button>
          <span>
            {selected?.name ?? "Welcome"}
            <ChevronRight size={14} />
            <span className="muted">Control plane</span>
          </span>
          <a
            href={config.data?.storefrontUrl ?? ""}
            target="_blank"
            rel="noreferrer"
          >
            Open storefront <ArrowUpRight size={14} />
          </a>
        </div>
        <main id="main" key={team}>
          {!selected ? (
            <Onboarding />
          ) : (
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route
                path="/servers"
                element={<Servers admin={selected.role === "admin"} />}
              />
              <Route path="/tools" element={<Tools />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/audit" element={<Audit />} />
              <Route
                path="/team"
                element={<Team admin={selected.role === "admin"} />}
              />
              <Route
                path="/keys"
                element={<Keys admin={selected.role === "admin"} />}
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="*"
                element={
                  <Empty title="Workspace not found">
                    <NavLink to="/">Return to control room</NavLink>
                  </Empty>
                }
              />
            </Routes>
          )}
        </main>
      </div>
      <Modal
        title="Jump to a workspace"
        open={palette}
        onClose={() => setPalette(false)}
      >
        <label className="field">
          Search navigation
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Servers, tools, audit…"
          />
        </label>
        <Feedback error={paletteRefresh.error} />
        <div className="command-list">
          {selected &&
            "refresh workspace data".includes(search.toLowerCase()) && (
              <button
                disabled={paletteRefresh.isPending}
                onClick={() => paletteRefresh.mutate()}
              >
                <RefreshCw size={17} />
                {paletteRefresh.isPending
                  ? "Refreshing…"
                  : "Refresh workspace data"}
                <ChevronRight size={15} />
              </button>
            )}
          {nav
            .filter((n) => n.label.toLowerCase().includes(search.toLowerCase()))
            .map((n) => (
              <button
                key={n.to}
                onClick={() => {
                  navigate(n.to);
                  setPalette(false);
                  setSearch("");
                }}
              >
                <n.icon size={17} />
                {n.label}
                <ChevronRight size={15} />
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}
function Onboarding() {
  const [mode, setMode] = useState("create");
  const action = useMutation({
    mutationFn: (d: FormData) =>
      mode === "create"
        ? api("teams", "POST", { name: d.get("name") })
        : api("invitations/accept", "POST", { token: d.get("token") }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  return (
    <div className="onboarding">
      <div className="eyebrow">YOUR FIRST WORKSPACE</div>
      <h1>Give your tools a home.</h1>
      <p>
        Create a team or join one with an invitation. Credentials and activity
        stay scoped to that team.
      </p>
      <div className="segmented">
        <button
          onClick={() => setMode("create")}
          aria-pressed={mode === "create"}
        >
          Create team
        </button>
        <button onClick={() => setMode("join")} aria-pressed={mode === "join"}>
          Join team
        </button>
      </div>
      <Form
        onSubmit={(d) => action.mutate(d)}
        pending={action.isPending}
        error={action.error}
        label={mode === "create" ? "Create workspace" : "Accept invitation"}
      >
        <Field
          label={mode === "create" ? "Team name" : "Invitation token"}
          name={mode === "create" ? "name" : "token"}
          required
        />
      </Form>
      <p className="muted">
        New teams start without upstreams. An administrator connects their own
        approved services; operator credentials are never automatically granted
        to an arbitrary signup.
      </p>
    </div>
  );
}
function OverviewPage() {
  const q = useData<Overview>("overview");
  const [selected, setSelected] = useState<string>();
  const d = q.data;
  const active = d?.upstreams.find((u) => u.id === selected);
  const lastCall = d?.activity.find(
    (r) => r.upstream_id === selected && r.duration_ms != null,
  );
  return (
    <>
      <PageTitle
        kicker="OPERATIONS / LIVE"
        title="Control room"
        action={
          <button
            onClick={() => {
              void q.refetch();
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      >
        One gateway. A clear view of everything connected.
      </PageTitle>
      <Feedback error={q.error} />
      {!d ? (
        <div className="skeleton" />
      ) : (
        <>
          <div className="metrics">
            <div>
              <small>CONNECTED UPSTREAMS</small>
              <strong>
                {d.upstreams.filter((u) => u.status === "Connected").length}
                <span> / {d.upstreams.length}</span>
              </strong>
            </div>
            <div>
              <small>DISCOVERED TOOLS</small>
              <strong>
                {d.upstreams
                  .filter((u) => u.enabled)
                  .reduce((n, u) => n + (u.tool_count ?? 0), 0)}
              </strong>
            </div>
            <div>
              <small>RECENT AUDIT ATTEMPTS</small>
              <strong>
                {d.activity.length}
                <span> latest records</span>
              </strong>
            </div>
            <div>
              <small>MODEL RESERVATION LEFT</small>
              <strong>
                ₹{Number(d.budget.remaining_paise) / 100}
                <span> M4 ceiling</span>
              </strong>
            </div>
          </div>
          <section className="topology">
            <div className="section-heading">
              <div>
                <h2>Gateway connections</h2>
                <p>Observed discovery state · select a server to inspect</p>
              </div>
              <Badge
                value={
                  !d.upstreams.some((u) => u.enabled)
                    ? "No active servers"
                    : d.upstreams.some((u) => u.status === "Unreachable")
                      ? "Degraded"
                      : "Connected"
                }
              />
            </div>
            <div className="connection-map">
              <div className="gateway-node">
                <Workflow size={27} />
                <div>
                  <strong>Relay gateway</strong>
                  <code>/mcp</code>
                </div>
                <span>TEAM SCOPED</span>
              </div>
              <div className="connection-branch">
                {d.upstreams.map((u) => (
                  <button
                    aria-pressed={selected === u.id}
                    className={`server-node ${selected === u.id ? "selected" : ""}`}
                    key={u.id}
                    onClick={() => setSelected(u.id)}
                  >
                    <Server size={19} />
                    <div>
                      <strong>{u.name}</strong>
                      <small>{u.tool_count ?? 0} discovered tools</small>
                    </div>
                    <Badge value={u.status} />
                  </button>
                ))}
              </div>
            </div>
            {!d.upstreams.length && (
              <Empty title="Connect your first service">
                An administrator can add an approved Streamable HTTP upstream in
                MCP servers.
              </Empty>
            )}
            {active && (
              <div className="connection-detail">
                <strong>{active.name}</strong>
                <span>
                  {active.reason ?? "Discovery completed without an error"}
                </span>
                <code>Checked {when(active.checked_at)}</code>
                <code>
                  {lastCall
                    ? `Latest visible call: ${str(lastCall.duration_ms)} ms`
                    : "No recent call duration"}
                </code>
                <NavLink to="/tools">
                  Explore tools <ArrowUpRight size={13} />
                </NavLink>
              </div>
            )}
          </section>
          <section className="activity-section">
            <div className="section-heading">
              <div>
                <h2>Execution pulse</h2>
                <p>Durable gateway records, attributed to the caller</p>
              </div>
              <NavLink to="/audit">
                View audit <ChevronRight size={14} />
              </NavLink>
            </div>
            <ActivityTable rows={d.activity} upstreams={d.upstreams} />
          </section>
          <div className="endpoint-strip">
            <Terminal size={18} />
            <div>
              <small>YOUR SINGLE MCP ENDPOINT</small>
              <code>{d.gatewayUrl}</code>
            </div>
            <CopyButton value={d.gatewayUrl} />
          </div>
        </>
      )}
    </>
  );
}
function ActivityTable({
  rows,
  upstreams = [],
}: {
  rows: Row[];
  upstreams?: Upstream[];
}) {
  if (!rows.length)
    return (
      <Empty title="No executions yet">
        Use an enabled tool in the agent workspace or an external MCP client.
        Its real audit record will appear here.
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Tool / upstream</th>
            <th>Caller</th>
            <th>Outcome</th>
            <th>Duration</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={str(r.id)}>
              <td>
                <code>{str(r.tool_name)}</code>
                <small>
                  {upstreams.find((u) => u.id === r.upstream_id)?.name ??
                    str(r.upstream_id)}
                </small>
              </td>
              <td>
                <code title={str(r.user_id)}>
                  {str(r.user_id).slice(0, 12)}
                </code>
                <small>{str(r.auth_kind)}</small>
              </td>
              <td>
                <Badge value={r.status} />
                {Boolean(r.code) && <small>{str(r.code)}</small>}
              </td>
              <td>
                <code>
                  {r.duration_ms == null ? "—" : `${r.duration_ms} ms`}
                </code>
              </td>
              <td>{when(r.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Servers({ admin }: { admin: boolean }) {
  const q = useData<{ upstreams: Upstream[] }>("upstreams", admin);
  const overview = useData<Overview>("overview");
  const [editing, setEditing] = useState<Upstream | null | undefined>();
  const [remove, setRemove] = useState<Upstream>();
  const [disable, setDisable] = useState(false);
  const [cred, setCred] = useState("keep");
  const change = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body?: unknown;
    }) => api(path, method, body),
    onSuccess: () => {
      setEditing(undefined);
      setRemove(undefined);
      void qc.invalidateQueries();
    },
  });
  const submit = (d: FormData) => {
    let credentials: unknown = undefined;
    if (cred === "none") credentials = null;
    else if (cred === "bearer")
      credentials = { kind: "bearer", token: d.get("credential") };
    else if (cred === "headers")
      credentials = {
        kind: "headers",
        headers: { [str(d.get("header"))]: d.get("credential") },
      };
    change.mutate({
      path: `upstreams${editing ? `/${editing.id}` : ""}`,
      method: editing ? "PATCH" : "POST",
      body: {
        name: d.get("name"),
        url: d.get("url"),
        timeoutMs: Number(d.get("timeout")),
        enabled: d.get("enabled") === "on",
        ...(editing ? { revision: editing.revision } : {}),
        ...(credentials !== undefined ? { credentials } : {}),
      },
    });
  };
  const rows = admin ? q.data?.upstreams : overview.data?.upstreams;
  return (
    <>
      <PageTitle
        kicker="CONNECTIONS / MCP"
        title="MCP servers"
        action={
          admin && (
            <button
              className="primary"
              onClick={() => {
                setEditing(null);
                setCred("none");
                change.reset();
              }}
            >
              <Plus size={15} /> Connect server
            </button>
          )
        }
      >
        Manage the services behind your single gateway endpoint.
      </PageTitle>
      <Feedback error={q.error ?? overview.error ?? change.error} />
      {!admin && (
        <div className="feedback">
          Your administrator manages connections. Your tool library reflects
          your current permissions.
        </div>
      )}
      <div className="server-list">
        {rows?.map((u) => (
          <article className="server-row" key={u.id}>
            <div className="server-emblem">
              <Server size={23} />
            </div>
            <div className="server-info">
              <h2>{u.name}</h2>
              <code>{u.url ?? u.id}</code>
              <p>{u.reason ?? `Last discovery ${when(u.checked_at)}`}</p>
            </div>
            <Badge value={u.status} />
            <div className="row-actions">
              <NavLink to="/tools">Tools</NavLink>
              {admin && (
                <>
                  <button
                    onClick={() => {
                      setEditing(u);
                      setCred("keep");
                      change.reset();
                    }}
                  >
                    Configure
                  </button>
                  <button
                    disabled={change.isPending}
                    onClick={() => {
                      if (u.enabled) {
                        setDisable(true);
                        setRemove(u);
                      } else
                        change.mutate({
                          path: `upstreams/${u.id}`,
                          method: "PATCH",
                          body: { revision: u.revision, enabled: true },
                        });
                    }}
                  >
                    {u.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="danger text-button"
                    onClick={() => {
                      setDisable(false);
                      setRemove(u);
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {rows?.length === 0 && (
        <Empty title="No servers connected">
          Connect a reviewed upstream URL with optional write-only credentials.
        </Empty>
      )}
      <Modal
        title={editing ? "Configure connection" : "Connect MCP server"}
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
      >
        <Form
          onSubmit={submit}
          pending={change.isPending}
          error={change.error}
          label="Save connection"
        >
          <Field
            label="Server name"
            name="name"
            value={editing?.name}
            required
          />
          <Field
            label="Streamable HTTP URL"
            name="url"
            value={editing?.url}
            type="url"
            required
          />
          <label className="field">
            Tool deadline (100–10000 ms)
            <input
              name="timeout"
              type="number"
              min={100}
              max={10000}
              defaultValue={editing?.timeout_ms ?? 10000}
              required
            />
          </label>
          <label className="check-field">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={editing?.enabled ?? true}
            />{" "}
            Enable discovery and calls
          </label>
          <label className="field">
            Credential mode
            <select value={cred} onChange={(e) => setCred(e.target.value)}>
              {editing && (
                <option value="keep">
                  Keep stored credential (
                  {editing.has_credentials ? "present" : "none"})
                </option>
              )}
              <option value="none">No credential / clear stored</option>
              <option value="bearer">Bearer token</option>
              <option value="headers">Static header</option>
            </select>
          </label>
          {cred === "headers" && (
            <Field
              label="Header name"
              name="header"
              value="X-Upstream-Token"
              required
            />
          )}
          {["bearer", "headers"].includes(cred) && (
            <Field
              label="Credential (write only)"
              name="credential"
              type="password"
              required
            />
          )}
          <p className="muted">
            Stored in a Kubernetes Secret. Existing values are never returned.
            Only operator-approved destinations can be connected.
          </p>
        </Form>
      </Modal>
      <Modal
        title={disable ? "Disable connection?" : "Remove connection?"}
        open={!!remove}
        onClose={() => setRemove(undefined)}
      >
        <p>
          {disable
            ? "Tools disappear on refreshed discovery and cached calls are rejected immediately. You can enable this connection again."
            : "The registry entry and managed credential will be removed. This does not delete the upstream workload."}
        </p>
        <Feedback error={change.error} />
        <button
          className="danger-button"
          disabled={change.isPending}
          onClick={() =>
            remove &&
            change.mutate({
              path: `upstreams/${remove.id}`,
              method: disable ? "PATCH" : "DELETE",
              ...(disable
                ? { body: { revision: remove.revision, enabled: false } }
                : {}),
            })
          }
        >
          Confirm {disable ? "disable" : "removal"}
        </button>
      </Modal>
    </>
  );
}
function Tools() {
  const q = useData<{ tools: Tool[] }>("tools");
  const [search, set] = useState("");
  const [selected, select] = useState<Tool>();
  const tools = q.data?.tools.filter((t) =>
    `${t.name} ${t.alias} ${t.upstreamName} ${t.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle kicker="CATALOGUE / PERMISSION FILTERED" title="Tool library">
        Explore the schemas your identity is allowed to use.
      </PageTitle>
      <Feedback error={q.error} />
      <div className="toolbar">
        <Search size={17} />
        <input
          aria-label="Search tools"
          placeholder="Search descriptions, servers, aliases…"
          value={search}
          onChange={(e) => set(e.target.value)}
        />
        <span>
          {q.isPending ? "Discovering…" : `${tools?.length ?? 0} tools`}
        </span>
        <button
          onClick={() => {
            void q.refetch();
          }}
        >
          Refresh discovery
        </button>
      </div>
      {q.isPending && (
        <div
          className="skeleton"
          role="status"
          aria-label="Discovering gateway tools"
        />
      )}
      <div className="tool-library">
        {tools?.map((t) => (
          <button
            className="tool-row"
            key={t.alias ?? t.name}
            onClick={() => select(t)}
          >
            <Boxes size={17} />
            <div>
              <strong>{`${t.upstreamName ?? "Gateway"} / ${t.name}`}</strong>
              <code>{t.alias ?? t.name}</code>
            </div>
            <span>
              {Object.keys((t.inputSchema.properties ?? {}) as Row).length}{" "}
              parameters
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      {tools?.length === 0 && (
        <Empty title="No matching tools">
          Try a different search, refresh discovery, or ask your administrator
          to check server status and policies.
        </Empty>
      )}
      <Modal
        title="Tool inspection"
        open={!!selected}
        onClose={() => select(undefined)}
      >
        <h3>
          {selected?.upstreamName} / {selected?.name}
        </h3>
        <p>{selected?.description}</p>
        <code className="wrap">{selected?.alias ?? selected?.name}</code>
        <h4>Input schema</h4>
        <Json value={selected?.inputSchema} />
        <h4>Output schema</h4>
        <Json
          value={
            selected?.outputSchema ??
            "The upstream does not advertise an output schema."
          }
        />
      </Modal>
    </>
  );
}
function Keys({ admin }: { admin: boolean }) {
  const q = useData<{ keys: Row[] }>("api-keys");
  const [create, setCreate] = useState(false);
  const [once, setOnce] = useState("");
  const [revoke, setRevoke] = useState<Row>();
  const action = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body?: unknown;
    }) => api<{ key?: string }>(path, method, body),
    onSuccess: (d) => {
      if (d.key) setOnce(d.key);
      setCreate(false);
      setRevoke(undefined);
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <PageTitle
        kicker="IDENTITY / EXTERNAL CLIENTS"
        title="Personal API keys"
        action={
          <button
            className="primary"
            onClick={() => {
              setCreate(true);
              action.reset();
            }}
          >
            <Plus size={15} /> Generate key
          </button>
        }
      >
        One personal key. Every permitted upstream. Revocation takes effect on
        the next request.
      </PageTitle>
      <Feedback error={q.error} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name / key ID</th>
              <th>Owner</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.keys.map((k) => (
              <tr key={str(k.id)}>
                <td>
                  {str(k.name)}
                  <small>
                    <code>{str(k.id)}</code>
                  </small>
                </td>
                <td>
                  <code>{str(k.user_id).slice(0, 12)}</code>
                </td>
                <td>{when(k.created_at)}</td>
                <td>{when(k.last_used_at)}</td>
                <td>
                  <Badge value={k.revoked_at ? "Revoked" : "Active"} />
                </td>
                <td>
                  {!k.revoked_at && (
                    <button onClick={() => setRevoke(k)}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data?.keys.length === 0 && (
        <Empty title="Your first external connection">
          Generate a key and configure only the gateway URL and Bearer header in
          your MCP client.
        </Empty>
      )}
      <Modal
        title="Generate a personal key"
        open={create}
        onClose={() => setCreate(false)}
      >
        <Form
          onSubmit={(d) =>
            action.mutate({
              path: "api-keys",
              method: "POST",
              body: {
                name: d.get("name"),
                ...(d.get("userId") ? { userId: d.get("userId") } : {}),
              },
            })
          }
          pending={action.isPending}
          error={action.error}
          label="Generate key"
        >
          <Field label="Key name" name="name" required />
          {admin && (
            <Field
              label="Member user ID (optional; empty means yourself)"
              name="userId"
            />
          )}
          <p className="muted">
            The secret is revealed once. Only its hash is stored.
          </p>
        </Form>
      </Modal>
      <Modal
        title="Save your key now"
        open={!!once}
        onClose={() => setOnce("")}
      >
        <p>
          Copy this key into your trusted client. Closing this dialog
          permanently hides its value.
        </p>
        <textarea aria-label="One-time API key" readOnly value={once} />
        <CopyButton value={once} label="Copy API key" />
      </Modal>
      <Modal
        title="Revoke API key?"
        open={!!revoke}
        onClose={() => setRevoke(undefined)}
      >
        <p>
          Existing client connections will fail on their next request. This
          cannot be undone.
        </p>
        <Feedback error={action.error} />
        <button
          className="danger-button"
          disabled={action.isPending}
          onClick={() =>
            revoke &&
            action.mutate({
              path: `api-keys/${str(revoke.id)}`,
              method: "DELETE",
            })
          }
        >
          Confirm revocation
        </button>
      </Modal>
    </>
  );
}
function Team({ admin }: { admin: boolean }) {
  const q = useData<{ members: Row[] }>("members", admin);
  const invites = useData<{ invitations: Row[] }>("invitations", admin);
  const rules = useData<{ rules: Row[] }>("permissions", admin);
  const [dialog, setDialog] = useState("");
  const [once, setOnce] = useState("");
  const [confirm, setConfirm] = useState<{
    path: string;
    method: string;
    body?: unknown;
    label: string;
  }>();
  const action = useMutation({
    mutationFn: (d: { path: string; method: string; body?: unknown }) =>
      api<{ token?: string }>(d.path, d.method, d.body),
    onSuccess: (d) => {
      if (d.token) setOnce(d.token);
      setDialog("");
      setConfirm(undefined);
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <PageTitle
        kicker="WORKSPACE / ACCESS"
        title="Team & permissions"
        action={
          admin && (
            <button className="primary" onClick={() => setDialog("invite")}>
              <Plus size={15} /> Invite member
            </button>
          )
        }
      >
        Explicit roles, active memberships, and gateway-enforced tool
        visibility.
      </PageTitle>
      <Feedback error={q.error ?? invites.error ?? rules.error} />
      {admin && q.isPending && (
        <div className="skeleton" role="status" aria-label="Loading team" />
      )}
      {!admin ? (
        <Empty title="Member access">
          Your administrator manages invitations, membership and tool policies.
          Your own keys and permitted tools are available in the navigation.
        </Empty>
      ) : (
        <>
          <h2 className="section-label">Members</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Role</th>
                  <th>Membership</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.members.map((m) => (
                  <tr key={str(m.user_id)}>
                    <td>
                      {str(m.name)}
                      <small>{str(m.email)}</small>
                      <code>{str(m.user_id)}</code>
                    </td>
                    <td>{str(m.role)}</td>
                    <td>
                      <Badge value={m.active ? "Active" : "Inactive"} />
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setConfirm({
                            path: `members/${str(m.user_id)}`,
                            method: "PATCH",
                            body: { active: !m.active },
                            label: m.active
                              ? "Deactivate member"
                              : "Activate member",
                          })
                        }
                      >
                        {m.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() =>
                          setConfirm({
                            path: `members/${str(m.user_id)}`,
                            method: "PATCH",
                            body: {
                              role: m.role === "admin" ? "member" : "admin",
                            },
                            label: "Change member role",
                          })
                        }
                      >
                        Make {m.role === "admin" ? "member" : "admin"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-label">Invitations</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.data?.invitations.map((i) => (
                  <tr key={str(i.id)}>
                    <td>{str(i.email)}</td>
                    <td>{str(i.role)}</td>
                    <td>{when(i.expires_at)}</td>
                    <td>
                      <Badge
                        value={
                          i.accepted_at
                            ? "Accepted"
                            : i.revoked_at
                              ? "Revoked"
                              : new Date(str(i.expires_at)) < new Date()
                                ? "Expired"
                                : "Pending"
                        }
                      />
                    </td>
                    <td>
                      {!i.accepted_at && !i.revoked_at && (
                        <button
                          onClick={() =>
                            setConfirm({
                              path: `invitations/${str(i.id)}`,
                              method: "DELETE",
                              label: "Revoke invitation",
                            })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-heading">
            <div>
              <h2>Tool access policies</h2>
              <p>
                Default: allowed for active team members. Matching deny always
                wins.
              </p>
            </div>
            <button onClick={() => setDialog("policy")}>
              <Plus size={14} /> Add policy
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Server</th>
                  <th>Tool</th>
                  <th>Effect</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.data?.rules.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      No custom policies. Active members can use all enabled
                      tools.
                    </td>
                  </tr>
                )}
                {rules.data?.rules.map((r) => (
                  <tr key={str(r.id)}>
                    <td>
                      <code>{str(r.subject)}</code>
                    </td>
                    <td>
                      <code>
                        {r.upstream_id ? str(r.upstream_id) : "All servers"}
                      </code>
                    </td>
                    <td>{r.tool_name ? str(r.tool_name) : "All tools"}</td>
                    <td>
                      <Badge value={r.effect} />
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setConfirm({
                            path: `permissions/${str(r.id)}`,
                            method: "DELETE",
                            label: "Remove policy",
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal
        title={dialog === "invite" ? "Invite a team member" : "Add tool policy"}
        open={!!dialog}
        onClose={() => setDialog("")}
      >
        <Form
          onSubmit={(d) =>
            action.mutate(
              dialog === "invite"
                ? {
                    path: "invitations",
                    method: "POST",
                    body: { email: d.get("email"), role: d.get("role") },
                  }
                : {
                    path: "permissions",
                    method: "POST",
                    body: {
                      subject: d.get("subject"),
                      effect: d.get("effect"),
                      ...(d.get("upstreamId")
                        ? { upstreamId: d.get("upstreamId") }
                        : {}),
                      ...(d.get("toolName")
                        ? { toolName: d.get("toolName") }
                        : {}),
                    },
                  },
            )
          }
          pending={action.isPending}
          error={action.error}
          label={dialog === "invite" ? "Create invitation" : "Add policy"}
        >
          {dialog === "invite" ? (
            <>
              <Field label="Member email" name="email" type="email" required />
              <label className="field">
                Role
                <select name="role">
                  <option>member</option>
                  <option>admin</option>
                </select>
              </label>
              <p className="muted">
                Share the one-time token manually. It expires in 24 hours and is
                bound to this email.
              </p>
            </>
          ) : (
            <>
              <Field
                label="Subject (*, role:member, role:admin, user:ID)"
                name="subject"
                value="role:member"
                required
              />
              <Field label="Server ID (optional)" name="upstreamId" />
              <Field label="Original tool name (optional)" name="toolName" />
              <label className="field">
                Effect
                <select name="effect">
                  <option>deny</option>
                  <option>allow</option>
                </select>
              </label>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title="Share invitation securely"
        open={!!once}
        onClose={() => setOnce("")}
      >
        <p>
          Invitee creates or signs into the matching email, then accepts this
          token from Settings. It is revealed only now.
        </p>
        <textarea aria-label="Invitation token" value={once} readOnly />
        <CopyButton value={once} />
      </Modal>
      <Modal
        title={`${confirm?.label}?`}
        open={!!confirm}
        onClose={() => setConfirm(undefined)}
      >
        <p>
          Gateway access follows the updated membership or policy immediately.
          The final active administrator is protected.
        </p>
        <Feedback error={action.error} />
        <button
          className="danger-button"
          disabled={action.isPending}
          onClick={() => confirm && action.mutate(confirm)}
        >
          Confirm change
        </button>
      </Modal>
    </>
  );
}
function Audit() {
  const [before, setBefore] = useState("");
  const [filter, setFilter] = useState("");
  const q = useData<{ calls: Row[] }>(
    `audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
  );
  const o = useData<Overview>("overview");
  const rows =
    q.data?.calls.filter((r) =>
      `${r.tool_name} ${r.user_id} ${r.status} ${r.code}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageTitle kicker="EVIDENCE / DURABLE" title="Audit explorer">
        Every admitted execution, failure and known-user rejection. Members see
        their own calls.
      </PageTitle>
      <Feedback error={q.error} />
      <div className="toolbar">
        <Search size={16} />
        <input
          aria-label="Filter audit"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter loaded records by tool, caller, outcome…"
        />
        <span>{q.isPending ? "Loading…" : `${rows.length} records`}</span>
        <button
          onClick={() => {
            setBefore("");
            void q.refetch();
          }}
        >
          Latest
        </button>
      </div>
      {q.isPending ? (
        <div
          className="skeleton"
          role="status"
          aria-label="Loading audit records"
        />
      ) : (
        <ActivityTable rows={rows} upstreams={o.data?.upstreams} />
      )}
      {(q.data?.calls.length ?? 0) >= 50 && (
        <button
          onClick={() => setBefore(str(q.data?.calls.at(-1)?.started_at))}
        >
          Earlier records
        </button>
      )}
      <p className="caption">
        Arguments are hashed in gateway audit, not stored as raw customer data.
        Chat’s own inspector shows the bounded results from that run.
      </p>
    </>
  );
}
function Agent() {
  const list = useData<{ runs: Row[] }>("chat/runs");
  const o = useData<Overview>("overview");
  const tools = useData<{ tools: Tool[] }>("tools");
  const [runId, setRun] = useState("");
  const [prompt, setPrompt] = useState("");
  const [inspect, setInspect] = useState(true);
  const run = useData<{
    run: Row;
    events: { kind: string; data: Row; created_at: string }[];
  }>(`chat/runs/${runId}`, !!runId, 1000);
  const action = useMutation({
    mutationFn: (p: string) =>
      api<{ id: string }>("chat/runs", "POST", { prompt: p }),
    onSuccess: (d) => {
      setRun(d.id);
      setPrompt("");
      void qc.invalidateQueries();
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`chat/runs/${runId}/cancel`, "POST", {}),
    onSuccess: () => {
      void run.refetch();
    },
  });
  const busy = action.isPending || run.data?.run.status === "running";
  const finishes =
    run.data?.events.filter((e) => e.kind === "tool.finish") ?? [];
  return (
    <>
      <PageTitle
        kicker={
          tools.error
            ? "AGENT / GATEWAY UNAVAILABLE"
            : tools.data
              ? "AGENT / GATEWAY OBSERVED"
              : "AGENT / CONNECTING"
        }
        title="Agent workspace"
        action={
          <button onClick={() => setInspect(!inspect)}>
            <Terminal size={15} />
            {inspect ? "Hide" : "Show"} inspector
          </button>
        }
      >
        A conversation you can inspect. Every operation uses your identity.
      </PageTitle>
      <div className="agent-context">
        <span>
          <i className="status-dot" />
          {o.data?.modelEnabled ? o.data.model : "Model disabled"}
        </span>
        <span>{tools.data?.tools.length ?? 0} permitted tools</span>
        <span>Asia/Kolkata · 4 step limit</span>
        <span>
          ₹{Number(o.data?.budget.remaining_paise ?? 0) / 100} reserved
          allowance left
        </span>
      </div>
      <div className={`agent-grid ${inspect ? "" : "no-inspector"}`}>
        <section className="conversation">
          <div className="conversation-toolbar">
            <select
              aria-label="Conversation history"
              value={runId}
              onChange={(e) => setRun(e.target.value)}
            >
              <option value="">New run</option>
              {list.data?.runs.map((r) => (
                <option key={str(r.id)} value={str(r.id)}>
                  {str(r.prompt).slice(0, 65)}
                </option>
              ))}
            </select>
            <button disabled={busy} onClick={() => setRun("")}>
              <Plus size={14} /> New run
            </button>
          </div>
          <div
            className="messages"
            aria-live="polite"
            tabIndex={0}
            aria-label="Conversation messages"
          >
            {!runId ? (
              <div className="agent-empty">
                <Workflow size={36} />
                <div className="eyebrow">CONNECTED INTELLIGENCE</div>
                <h2>Ask. Execute. Understand.</h2>
                <p>
                  Inspect live operations across your team’s services, with the
                  gateway enforcing every boundary.
                </p>
                <div className="suggestions">
                  {[
                    "What orders came in today in Asia/Kolkata? Use Calendar and WooCommerce.",
                    "List the published products in our store.",
                    "Use Decimal Totals to add 0.10 and 0.20 INR.",
                  ].map((p) => (
                    <button key={p} onClick={() => setPrompt(p)}>
                      {p}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="message user">
                  <small>YOU / AUTHENTICATED SESSION</small>
                  <p>{str(run.data?.run.prompt)}</p>
                </div>
                {finishes.map((e) => (
                  <div className="inline-execution" key={str(e.data.id)}>
                    <Terminal size={15} />
                    <span>
                      {str(
                        run.data?.events.find(
                          (s) =>
                            s.kind === "tool.start" && s.data.id === e.data.id,
                        )?.data.description,
                      )
                        .split(": ")
                        .slice(0, 2)
                        .join(" · ")}
                    </span>
                    <Badge value={e.data.status} />
                    <code>{str(e.data.durationMs)} ms</code>
                  </div>
                ))}
                {Boolean(run.data?.run.answer) && (
                  <div className="message assistant">
                    <small>
                      {finishes.length
                        ? "RELAY / FROM GATEWAY RESULTS"
                        : "RELAY / MODEL RESPONSE"}
                    </small>
                    <div className="answer-markdown">
                      <Markdown
                        skipHtml
                        allowedElements={[
                          "p",
                          "strong",
                          "em",
                          "ul",
                          "ol",
                          "li",
                          "code",
                          "pre",
                          "blockquote",
                          "a",
                          "h2",
                          "h3",
                          "hr",
                        ]}
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {str(run.data?.run.answer)}
                      </Markdown>
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="thinking">
                    <i /> Working through the gateway…
                  </div>
                )}
                {Boolean(run.data?.run.error_code) && (
                  <div role="alert" className="feedback error">
                    {str(run.data?.run.error_code).replaceAll("_", " ")}.
                    Inspect executions and audit before retrying a write.
                  </div>
                )}
              </>
            )}
            <Feedback error={action.error ?? run.error ?? cancel.error} />
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (prompt.trim()) action.mutate(prompt);
            }}
          >
            <textarea
              aria-label="Message Relay"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about your store, or request an explicit operation…"
              maxLength={4000}
              disabled={busy}
            />
            <div>
              <small>Real tools · no silent mutation retries</small>
              {busy ? (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Stop run
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!prompt.trim() || !o.data?.modelEnabled}
                >
                  <Send size={14} /> Run
                </button>
              )}
            </div>
          </form>
        </section>
        {inspect && (
          <aside className="execution-inspector">
            <div className="section-heading">
              <div>
                <div className="eyebrow">LIVE ACTIVITY</div>
                <h2>Execution inspector</h2>
              </div>
              <Terminal size={17} />
            </div>
            {!run.data?.events.length ? (
              <Empty title="Nothing hidden">
                The real model steps, gateway calls and returned results appear
                here as the run progresses.
              </Empty>
            ) : (
              <div className="timeline">
                {run.data.events.map((e, n) => (
                  <div
                    className={`timeline-event ${e.kind}`}
                    key={`${e.created_at}-${n}`}
                  >
                    <div className="timeline-marker" />
                    <small>{when(e.created_at)}</small>
                    <strong>{e.kind.replace(".", " / ")}</strong>
                    {e.kind === "tool.start" && (
                      <>
                        <p>{str(e.data.description)}</p>
                        <code className="wrap">{str(e.data.alias)}</code>
                        <details>
                          <summary>Arguments</summary>
                          <Json value={e.data.args} />
                        </details>
                      </>
                    )}
                    {e.kind === "tool.finish" && (
                      <>
                        <Badge value={e.data.status} />
                        <code>{str(e.data.durationMs)} ms</code>
                        <details>
                          <summary>Gateway result & audit correlation</summary>
                          <Json value={e.data.result ?? e.data.error} />
                        </details>
                      </>
                    )}
                    {e.kind.startsWith("model.") && (
                      <details>
                        <summary>Model step details</summary>
                        <Json value={e.data} />
                      </details>
                    )}
                    {e.kind === "discovery" && (
                      <span>{str(e.data.count)} permission-filtered tools</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
function SettingsPage() {
  const q = useData<Overview>("overview");
  const accept = useMutation({
    mutationFn: (d: FormData) =>
      api("invitations/accept", "POST", { token: d.get("token") }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <PageTitle kicker="PLATFORM / CONNECTION" title="Workspace settings">
        Connection instructions, model limits, and team access.
      </PageTitle>
      <section className="settings-section">
        <h2>Connect an external MCP client</h2>
        <p>
          Use Streamable HTTP with this gateway URL and your personal key as an
          Authorization: Bearer header. Upstream credentials are never required.
        </p>
        <code className="endpoint">{q.data?.gatewayUrl}</code>
        <CopyButton value={q.data?.gatewayUrl ?? ""} />
        <p>
          After a server changes, refresh discovery or reconnect. The gateway
          still rejects disabled or revoked calls immediately.
        </p>
        <NavLink to="/keys">
          Manage personal API keys <ArrowUpRight size={14} />
        </NavLink>
      </section>
      <section className="settings-section">
        <h2>Model spending policy</h2>
        <p>
          Existing prepaid Gemini credit only. M4 reserves ₹5 before each
          provider request, with a ₹99 shared ceiling; ₹100 from M0 stays
          reserved. No automatic retries, top-ups, grounding, or paid auxiliary
          tools.
        </p>
        <p>
          Remaining M4 reservation:{" "}
          <strong>₹{Number(q.data?.budget.remaining_paise ?? 0) / 100}</strong>.
          Reservation is a conservative guard, not an invoice or account-wide
          billing meter.
        </p>
      </section>
      <section className="settings-section">
        <h2>Join another team</h2>
        <Form
          onSubmit={(d) => accept.mutate(d)}
          pending={accept.isPending}
          error={accept.error}
          label="Accept invitation"
        >
          <Field label="Invitation token" name="token" required />
        </Form>
        {accept.isSuccess && (
          <div role="status" className="feedback">
            Invitation accepted. Select the team in the workspace switcher.
          </div>
        )}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
