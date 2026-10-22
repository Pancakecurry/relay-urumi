import { useState, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Workflow, ShieldCheck, ArrowUpRight, KeyRound } from "lucide-react";
type Context = {
  clientName: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  resource: string;
  authenticated: boolean;
  teamName?: string;
  user?: { name: string; email: string };
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.code ?? d.code ?? "OAUTH_REQUEST_FAILED");
  return d as T;
}
export function OAuthWorkspace() {
  const query = window.location.search.slice(1),
    [error, setError] = useState("");
  const context = useQuery({
    queryKey: ["oauth-request", query],
    queryFn: () =>
      request<Context>("oauth/request?" + new URLSearchParams({ query })),
    retry: false,
    staleTime: 0,
  });
  const action = useMutation({
    mutationFn: async (body: unknown) => {
      const d = await request<{ url?: string; redirect_uri?: string }>(
        context.data?.authenticated ? "oauth/consent" : "auth/sign-in/email",
        body,
      );
      const target = d.url ?? d.redirect_uri;
      if (!target) throw new Error("OAUTH_CONTINUATION_UNAVAILABLE");
      const u = new URL(target, location.origin);
      if (!["http:", "https:"].includes(u.protocol))
        throw new Error("OAUTH_REDIRECT_DENIED");
      location.assign(u.href);
    },
  });
  const message = context.error?.message ?? action.error?.message ?? error;
  function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    action.mutate({
      email: d.get("email"),
      password: d.get("password"),
      oauth_query: query,
    });
  }
  return (
    <main className="auth oauth-auth">
      <div className="auth-story">
        <a className="brand" href="/">
          <Workflow size={25} />
          relay<span>SECURE CONNECTION</span>
        </a>
        <div>
          <div className="eyebrow">YOUR IDENTITY. YOUR PERMISSIONS.</div>
          <h1>
            A deliberate
            <br />
            connection.
          </h1>
          <p>
            Give an external client a path to your team’s tools. Every operation
            remains subject to your current access and appears in the audit
            trail.
          </p>
          <div className="auth-path">
            <KeyRound />
            <span>Consent</span>
            <span>→</span>
            <span>Gateway</span>
            <span>→</span>
            <span>Your tools</span>
          </div>
        </div>
        <small>Authorization code · S256 PKCE · Revocable access</small>
      </div>
      <section className="auth-form oauth-consent">
        <ShieldCheck size={28} />
        <h2>
          {context.data?.authenticated
            ? "Review client access"
            : "Connect with Relay"}
        </h2>
        {context.isPending ? (
          <p role="status">Verifying this authorization request…</p>
        ) : (
          context.data && (
            <>
              <p>
                <strong>{context.data.clientName}</strong> is requesting access
                to the MCP gateway.
              </p>
              {context.data.authenticated ? (
                <>
                  <div className="oauth-identity">
                    <strong>{context.data.user?.name}</strong>
                    <span>{context.data.user?.email}</span>
                    <span>Workspace · {context.data.teamName}</span>
                  </div>
                  <ul className="oauth-capabilities">
                    <li>
                      Discover and execute the tools your current permissions
                      allow, including permitted store changes.
                    </li>
                    {context.data.scopes.includes("offline_access") && (
                      <li>
                        Renew access for up to one day. Session, client and
                        membership checks continue to apply.
                      </li>
                    )}
                    <li>
                      Tool denials, disabled servers and revoked access remain
                      enforced on every call.
                    </li>
                  </ul>
                  <dl className="oauth-details">
                    <dt>Gateway</dt>
                    <dd>
                      <code>{context.data.resource}</code>
                    </dd>
                    <dt>Return to</dt>
                    <dd>
                      <code>{context.data.redirectUri}</code>
                    </dd>
                  </dl>
                  <div className="oauth-actions">
                    <button
                      className="primary"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ oauth_query: query, accept: true })
                      }
                    >
                      {action.isPending ? "Connecting…" : "Authorize client"}
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ oauth_query: query, accept: false })
                      }
                    >
                      Deny access
                    </button>
                  </div>
                  <button
                    className="text-button"
                    disabled={action.isPending}
                    onClick={() => {
                      void request("auth/sign-out", {})
                        .then(() => context.refetch())
                        .catch(() => setError("SIGN_OUT_FAILED"));
                    }}
                  >
                    Use another account
                  </button>
                </>
              ) : (
                <form onSubmit={signIn}>
                  <label className="field">
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                    />
                  </label>
                  <label className="field">
                    Password
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="primary" disabled={action.isPending}>
                    {action.isPending
                      ? "Signing in…"
                      : "Sign in and review access"}
                  </button>
                  <p className="muted">
                    Sign in with an existing member identity. No tool access is
                    granted until you approve.
                  </p>
                </form>
              )}
            </>
          )
        )}
        {message && (
          <div className="feedback error" role="alert">
            {message.replaceAll("_", " ").toLowerCase()}. Restart the connection
            from your MCP client if the request expired.
          </div>
        )}
        <a className="oauth-return" href="/">
          Return to the control room
        </a>
      </section>
    </main>
  );
}
