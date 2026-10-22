import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ShieldCheck, Copy } from "lucide-react";
type Client = {
  clientId: string;
  name: string;
  redirectUris: string[];
  disabled: boolean;
  createdAt: string;
};
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
export function OAuthClients({ api, team }: { api: Api; team: string }) {
  const qc = useQueryClient(),
    [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState<Client | null>(null),
    [copied, setCopied] = useState(""),
    [copyError, setCopyError] = useState(false),
    [search, setSearch] = useState(""),
    [includeDisabled, setIncludeDisabled] = useState(false),
    [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: [team, "oauth/clients"],
    queryFn: () => api<{ clients: Client[] }>("oauth/clients"),
  });
  const action = useMutation({
    mutationFn: (b: { name: string; redirectUris: string[] }) =>
      api("oauth/clients", "POST", b),
    onSuccess: () => {
      setOpen(false);
      setSearch("");
      setIncludeDisabled(false);
      setPage(0);
      void qc.invalidateQueries({ queryKey: [team, "oauth/clients"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (c: Client) =>
      api(`oauth/clients/${encodeURIComponent(c.clientId)}`, "PATCH", {
        disabled: !c.disabled,
      }),
    onSuccess: (_data, client) => {
      setConfirm(null);
      setIncludeDisabled(true);
      setSearch("");
      setPage(
        Math.floor(
          Math.max(
            0,
            q.data?.clients.findIndex((c) => c.clientId === client.clientId) ??
              0,
          ) / 10,
        ),
      );
      void qc.invalidateQueries({ queryKey: [team, "oauth/clients"] });
    },
  });
  const filtered = (q.data?.clients ?? []).filter(
    (c) =>
      (includeDisabled || !c.disabled) &&
      [c.name, c.clientId, ...c.redirectUris].some((v) =>
        v.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 10) - 1),
    currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    action.mutate({
      name: String(d.get("name")).trim(),
      redirectUris: String(d.get("redirects"))
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return (
    <section className="settings-section oauth-clients">
      <div className="section-heading">
        <div>
          <h2>OAuth client connections</h2>
          <p>
            Register a public client for this workspace. The client ID can be
            shared with members; it grants no access by itself.
          </p>
        </div>
        <button
          onClick={() => {
            action.reset();
            setOpen(true);
          }}
        >
          Register client
        </button>
      </div>
      {q.isPending && <p role="status">Loading registered clients…</p>}
      {q.error && (
        <div role="alert" className="feedback error">
          Client connections could not be loaded.
        </div>
      )}
      {q.data && !q.data.clients.length && (
        <p className="muted">
          No clients registered. Add your MCP host’s exact callback URL to begin
          browser authorization.
        </p>
      )}
      {q.data && (
        <div className="oauth-filters">
          <label className="field">
            Search clients
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Name, callback or client ID"
              type="search"
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(e) => {
                setIncludeDisabled(e.target.checked);
                setPage(0);
              }}
            />
            Include disabled clients
          </label>
        </div>
      )}
      {q.data && filtered.length === 0 && q.data.clients.length > 0 && (
        <p className="muted">
          No matching clients. Adjust your search or include disabled
          connections.
        </p>
      )}
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="OAuth client connections table"
      >
        <table>
          <caption className="sr-only">Registered MCP OAuth clients</caption>
          <thead>
            <tr>
              <th>Client</th>
              <th>Callback / identifier</th>
              <th>Access</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.clientId}>
                <td>
                  <strong>{c.name}</strong>
                  <small className="muted">Public · S256 PKCE</small>
                </td>
                <td>
                  <code className="wrap">{c.redirectUris.join(", ")}</code>
                  <div className="oauth-client-id">
                    <code className="wrap">{c.clientId}</code>
                    <button
                      className="icon-button"
                      aria-label={`Copy client ID for ${c.name}`}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(c.clientId)
                          .then(() => {
                            setCopied(c.clientId);
                            setCopyError(false);
                          })
                          .catch(() => setCopyError(true));
                      }}
                    >
                      <Copy size={13} />
                    </button>
                    {copied === c.clientId && <span role="status">Copied</span>}
                  </div>
                </td>
                <td>
                  <span
                    className={`badge ${c.disabled ? "disabled" : "connected"}`}
                  >
                    <i />
                    {c.disabled ? "Disabled" : "Enabled"}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => {
                      toggle.reset();
                      setConfirm(c);
                    }}
                  >
                    {c.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && (
        <nav className="oauth-pagination" aria-label="OAuth client pages">
          <span role="status">
            {filtered.length} matching · {q.data.clients.length} total
          </span>
          <div>
            <button
              disabled={currentPage === 0}
              aria-label="Previous OAuth client page"
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              {currentPage + 1} / {lastPage + 1}
            </span>
            <button
              disabled={currentPage === lastPage}
              aria-label="Next OAuth client page"
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
      {copyError && (
        <p role="alert">
          Copy unavailable. Select the visible client ID and copy it manually.
        </p>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="modal">
            <div className="modal-heading">
              <Dialog.Title>Register OAuth client</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close dialog">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description>
              Public native clients use browser consent and PKCE. Callback URLs
              require HTTPS or an explicit HTTP loopback address.
            </Dialog.Description>
            <form onSubmit={submit}>
              <label className="field">
                Client name
                <input name="name" maxLength={80} required />
              </label>
              <label className="field">
                Callback URLs
                <textarea
                  name="redirects"
                  rows={3}
                  required
                  placeholder="One exact callback URL per line"
                />
              </label>
              <p className="muted">
                Up to three callbacks. No client secret is generated and no
                upstream credential is shared.
              </p>
              {action.error && (
                <div className="feedback error" role="alert">
                  {action.error.message.replaceAll("_", " ")}
                </div>
              )}
              <button className="primary" disabled={action.isPending}>
                {action.isPending ? "Registering…" : "Register client"}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="modal">
            <div className="modal-heading">
              <Dialog.Title>
                {confirm?.disabled ? "Enable" : "Disable"} client connection
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close dialog">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {confirm?.disabled
                ? "Members can authorize this client again. Previous revoked tokens remain revoked."
                : "Existing tokens from this client will fail on their next gateway request. Members cannot authorize new access until it is enabled."}
            </Dialog.Description>
            <p>
              <ShieldCheck size={16} /> {confirm?.name}
            </p>
            {toggle.error && (
              <div className="feedback error" role="alert">
                {toggle.error.message.replaceAll("_", " ")}
              </div>
            )}
            <button
              className="primary"
              disabled={toggle.isPending}
              onClick={() => confirm && toggle.mutate(confirm)}
            >
              {toggle.isPending ? "Applying…" : "Confirm change"}
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
