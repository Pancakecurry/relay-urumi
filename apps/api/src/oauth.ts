import { withOAuthAdmin } from "../../../packages/auth/src/oauth.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { fromNodeHeaders } from "better-auth/node";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import * as z from "zod/v4";
import { Store, secret } from "../../../packages/db/src/store.js";
import {
  Rejection,
  admin,
  member,
  lockedMember,
  uuid,
  digest,
  type Identity,
  equal,
} from "../../../packages/auth/src/identity.js";
import type { sessionAuth } from "../../../packages/auth/src/session.js";
type Auth = ReturnType<typeof sessionAuth>["auth"];
type Headers = FastifyRequest["headers"];
const signed = z.string().min(20).max(16384);
const clientId = z.string().min(1).max(256);
const redirect = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const u = new URL(value);
    return (
      !u.username &&
      !u.password &&
      !u.hash &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
    );
  }, "Use HTTPS or an explicit native loopback callback");
export function installOAuth(
  app: FastifyInstance,
  store: Store,
  auth: Auth,
  authPool: Pool,
  identity: (h: Headers) => Promise<Identity>,
  event: (
    tx: import("../../../packages/db/src/store.js").Tx,
    i: Identity,
    action: string,
    target?: string,
  ) => Promise<void>,
) {
  if (process.env["OAUTH_ENABLED"] !== "true") return;
  const origin = process.env["PUBLIC_ORIGIN"]!,
    resource = origin + "/mcp",
    issuer = origin + "/api/auth";
  const metadata = async () => auth.api.getOAuthServerConfig();
  for (const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/api/auth",
  ])
    app.get(path, metadata);
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ])
    app.get(path, async () => ({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ["mcp:tools", "offline_access"],
      bearer_methods_supported: ["header"],
      resource_name: "Relay team MCP gateway",
    }));
  async function requireAdmin(headers: Headers) {
    const i = await identity(headers);
    admin(i);
    return i;
  }
  const publicClient = (row: Record<string, unknown>) => ({
    clientId: row["clientId"],
    name: row["name"],
    redirectUris: row["redirectUris"],
    disabled: row["disabled"] ?? false,
    createdAt: row["createdAt"],
    scope: "mcp:tools offline_access",
    pkceRequired: true,
    tokenEndpointAuthMethod: "none",
  });
  app.get("/api/oauth/clients", async (req) => {
    const i = await requireAdmin(req.headers);
    return {
      clients: (
        await authPool.query(
          'SELECT "clientId",name,"redirectUris",disabled,"createdAt" FROM auth."oauthClient" WHERE (CASE jsonb_typeof(metadata) WHEN \'string\' THEN (metadata#>>\'{}\')::jsonb ELSE metadata END)->>\'relay_team\'=$1 ORDER BY "createdAt"',
          [i.team],
        )
      ).rows.map(publicClient),
    };
  });
  app.post("/api/oauth/clients", async (req) => {
    const i = await requireAdmin(req.headers),
      b = z
        .strictObject({
          name: z.string().trim().min(1).max(80),
          redirectUris: z.array(redirect).min(1).max(3),
        })
        .parse(req.body);
    return store.tenant(i.team, async (tx) => {
      await lockedMember(tx, i, true);
      const created = await withOAuthAdmin(i, () =>
        auth.api.adminCreateOAuthClient({
          headers: fromNodeHeaders(req.headers),
          body: {
            client_name: b.name,
            redirect_uris: b.redirectUris,
            application_type: "native",
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: "mcp:tools offline_access",
            require_pkce: true,
            skip_consent: false,
            metadata: { relay_team: i.team },
          },
        }),
      );
      const id = clientId.parse(created.client_id);
      await event(tx, i, "oauth.client.create", id);
      return publicClient(
        (
          await authPool.query(
            'SELECT "clientId",name,"redirectUris",disabled,"createdAt" FROM auth."oauthClient" WHERE "clientId"=$1',
            [id],
          )
        ).rows[0],
      );
    });
  });
  app.patch("/api/oauth/clients/:id", async (req) => {
    const i = await requireAdmin(req.headers),
      id = clientId.parse((req.params as { id: string }).id),
      b = z.strictObject({ disabled: z.boolean() }).parse(req.body);
    return store.tenant(i.team, async (tx) => {
      await lockedMember(tx, i, true);
      if (
        !(
          await authPool.query(
            "SELECT 1 FROM auth.\"oauthClient\" WHERE \"clientId\"=$1 AND (CASE jsonb_typeof(metadata) WHEN 'string' THEN (metadata#>>'{}')::jsonb ELSE metadata END)->>'relay_team'=$2",
            [id, i.team],
          )
        ).rowCount
      )
        throw new Rejection("OAUTH_CLIENT_NOT_FOUND", 404);
      // Native1.7.7 strips disabled from its admin-update schema. The narrow
      // database capability updates only this native field and validates the
      // same current tenant/admin; the management event commits atomically.
      if (
        !(
          await tx.query<{ changed: boolean }>(
            "SELECT app.set_oauth_client_disabled($1,$2,$3,$4) AS changed",
            [i.team, i.user, id, b.disabled],
          )
        ).rows[0]?.changed
      )
        throw new Rejection("OAUTH_CLIENT_NOT_FOUND", 404);
      await event(
        tx,
        i,
        b.disabled ? "oauth.client.disable" : "oauth.client.enable",
        id,
      );
      return { clientId: id, disabled: b.disabled };
    });
  });
  async function requestContext(query: string, headers: Headers) {
    if (!(await verifyOAuthQueryParams(query, secret("auth-signing"))))
      throw new Rejection("OAUTH_REQUEST_INVALID_OR_EXPIRED", 400);
    const q = new URLSearchParams(query),
      id = clientId.parse(q.get("client_id"));
    if (
      q.getAll("client_id").length !== 1 ||
      q.getAll("resource").length !== 1 ||
      q.get("resource") !== resource
    )
      throw new Rejection("OAUTH_RESOURCE_DENIED", 400);
    const row = (
      await authPool.query(
        'SELECT name,disabled,metadata,"redirectUris" FROM auth."oauthClient" WHERE "clientId"=$1',
        [id],
      )
    ).rows[0];
    if (!row || row.disabled)
      throw new Rejection("OAUTH_CLIENT_UNAVAILABLE", 400);
    const metadata =
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata;
    const team = uuid.parse(metadata?.relay_team),
      scopes = (q.get("scope") ?? "").split(" ").filter(Boolean);
    if (
      !scopes.includes("mcp:tools") ||
      scopes.some((s) => !["mcp:tools", "offline_access"].includes(s))
    )
      throw new Rejection("OAUTH_SCOPE_DENIED", 400);
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    const base = {
      clientName: row.name,
      clientId: id,
      scopes,
      redirectUri: q.get("redirect_uri"),
      resource,
      signedQueryValid: true,
    };
    if (!session) return { ...base, authenticated: false };
    return store.tenant(team, async (tx) => {
      await member(tx, session.user.id, team, "session", {
        session: session.session.id,
      });
      const t = (
        await tx.query("SELECT name FROM app.teams WHERE id=$1", [team])
      ).rows[0];
      return {
        ...base,
        authenticated: true,
        teamName: t.name,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
      };
    });
  }
  app.get("/api/oauth/request", async (req) => {
    const q = z.strictObject({ query: signed }).parse(req.query);
    return requestContext(q.query, req.headers);
  });
  app.post("/api/oauth/consent", async (req, reply) => {
    const b = z
      .strictObject({ oauth_query: signed, accept: z.boolean() })
      .parse(req.body);
    const c = await requestContext(b.oauth_query, req.headers);
    if (!c.authenticated) throw new Rejection("SESSION_REQUIRED", 401);
    // The provider's consent continuation calls authorize(), which requires a
    // real Request context. Use its native handler after our signed/team check.
    const headers = fromNodeHeaders(req.headers);
    headers.delete("content-length");
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    const response = await auth.handler(
      new Request(origin + "/api/auth/oauth2/consent", {
        method: "POST",
        headers,
        body: JSON.stringify(b),
      }),
    );
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header("set-cookie", cookies);
    const data = (await response.json()) as {
      error?: string;
      url?: string;
      redirect?: boolean;
    };
    if (!response.ok) {
      const code =
        typeof data.error === "string" && /^[a-z_]{1,64}$/.test(data.error)
          ? data.error.toUpperCase()
          : "REJECTED";
      throw new Rejection("OAUTH_CONSENT_" + code, response.status);
    }
    if (!data.redirect || !data.url)
      throw new Rejection("OAUTH_CONTINUATION_UNAVAILABLE", 503);
    return data;
  });
  app.post("/internal/oauth/identity", async (req, reply) => {
    if (
      !equal(
        req.headers.authorization ?? "",
        `Bearer ${secret("internal-token")}`,
      )
    )
      throw new Rejection("INTERNAL_ONLY", 403);
    const b = z
        .strictObject({
          token: z.string().regex(/^roa_[A-Za-z0-9_-]{20,4092}$/),
        })
        .parse(req.body),
      hash = digest(b.token);
    try {
      const value = await auth.api.relayValidateOAuthToken({
        body: { token: b.token },
      });
      const p = z
        .object({
          active: z.literal(true),
          iss: z.literal(issuer),
          aud: z.union([z.string(), z.array(z.string())]),
          sub: z.string().min(1),
          sid: z.string().min(1),
          client_id: clientId,
          scope: z.string(),
          token_type: z.literal("Bearer"),
          cnf: z.never().optional(),
          relay_team: uuid,
          exp: z.number(),
        })
        .parse(value);
      const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
      if (
        aud.length !== 1 ||
        aud[0] !== resource ||
        !p.scope.split(" ").includes("mcp:tools") ||
        p.exp <= Date.now() / 1000
      )
        throw new Rejection("OAUTH_RESOURCE_OR_SCOPE_DENIED", 401);
      return store.tenant(p.relay_team, async (tx) => {
        const i = await member(tx, p.sub, p.relay_team, "oauth", {
          session: p.sid,
        });
        i.oauthClient = p.client_id;
        i.oauthToken = hash;
        await tx.query(
          "INSERT INTO app.oauth_token_subjects(token_hash,team_id,user_id,client_id,session_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(token_hash) DO NOTHING",
          [hash, i.team, i.user, p.client_id, p.sid],
        );
        return { identity: i };
      });
    } catch (e) {
      const actor = (
        await store.pool.query<{
          team_id: string;
          user_id: string;
          client_id: string;
          session_id: string;
        }>("SELECT * FROM app.oauth_actor($1)", [hash])
      ).rows[0];
      const i: Identity | undefined =
        e instanceof Rejection && e.identity
          ? e.identity
          : actor
            ? {
                team: actor.team_id,
                user: actor.user_id,
                role: "member",
                kind: "oauth",
                session: actor.session_id,
                oauthClient: actor.client_id,
                oauthToken: hash,
              }
            : undefined;
      return reply.code(401).send({
        error: { code: "OAUTH_TOKEN_INACTIVE" },
        ...(i ? { identity: i } : {}),
      });
    }
  });
}
