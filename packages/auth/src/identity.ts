import { toolDecision, type Effect } from "./policy.js";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import * as z from "zod/v4";
import type { Store, Tx } from "../../db/src/store.js";
export interface Identity {
  team: string;
  user: string;
  role: "admin" | "member";
  kind: "session" | "key" | "delegation" | "oauth";
  key?: string;
  oauthClient?: string;
  oauthToken?: string;
  session?: string;
}
export class Rejection extends Error {
  constructor(
    readonly code: string,
    readonly status = 403,
    readonly identity?: Identity,
  ) {
    super(code);
  }
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const uuid = z.string().uuid();
export const tokenParts = (s: string, prefix: string) => {
  const parts = s.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== prefix ||
    !uuid.safeParse(parts[1]).success ||
    !uuid.safeParse(parts[2]).success ||
    !/^[a-f0-9]{64}$/.test(parts[3] ?? "")
  )
    throw new Rejection("INVALID_CREDENTIAL", 401);
  return { team: parts[1]!, id: parts[2]!, hash: digest(s) };
};
export function issueToken(prefix: string, team: string) {
  const id = randomUUID();
  const token = `${prefix}.${team}.${id}.${randomBytes(32).toString("hex")}`;
  return { id, token, hash: digest(token) };
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function member(
  tx: Tx,
  user: string,
  team: string,
  kind: Identity["kind"],
  extra: Pick<Identity, "key" | "session"> = {},
): Promise<Identity> {
  const r = await tx.query<{
    role: "admin" | "member";
    active: boolean;
  }>(
    "SELECT role,active FROM app.memberships WHERE user_id=$1 AND team_id=$2",
    [user, team],
  );
  const row = r.rows[0];
  const i: Identity = {
    team,
    user,
    role: row?.role ?? "member",
    kind,
    ...extra,
  };
  if (
    !row?.active ||
    !(
      await tx.query<{
        ok: boolean;
      }>("SELECT app.identity_exists($1) AS ok", [user])
    ).rows[0]?.ok
  )
    throw new Rejection("MEMBERSHIP_INACTIVE", 403, i);
  return i;
}
// Serialize management decisions with membership and policy changes. Never trust
// the role captured before waiting for the tenant lock.
export async function lockedMember(tx: Tx, i: Identity, requireAdmin = false) {
  await tx.query("SELECT id FROM app.teams WHERE id=$1 FOR UPDATE", [i.team]);
  const live = await member(tx, i.user, i.team, i.kind, {
    ...(i.session ? { session: i.session } : {}),
    ...(i.key ? { key: i.key } : {}),
  });
  if (
    !i.session ||
    !(
      await tx.query<{ ok: boolean }>("SELECT app.session_valid($1,$2) AS ok", [
        i.user,
        i.session,
      ])
    ).rows[0]?.ok
  )
    throw new Rejection("SESSION_REVOKED", 401, live);
  if (requireAdmin) admin(live);
  return live;
}
export async function keyIdentity(store: Store, token: string) {
  const t = tokenParts(token, "rk");
  return store.tenant(t.team, async (tx) => {
    const r = await tx.query<{
      user_id: string;
      key_hash: string;
      revoked_at: Date | null;
    }>("SELECT user_id,key_hash,revoked_at FROM app.api_keys WHERE id=$1", [
      t.id,
    ]);
    const row = r.rows[0];
    if (!row || !equal(t.hash, row.key_hash))
      throw new Rejection("INVALID_CREDENTIAL", 401);
    const i = await member(tx, row.user_id, t.team, "key", { key: t.id });
    if (row.revoked_at) throw new Rejection("KEY_REVOKED", 401, i);
    await tx.query("UPDATE app.api_keys SET last_used_at=now() WHERE id=$1", [
      t.id,
    ]);
    return i;
  });
}
const claimsSchema = z.strictObject({
  iss: z.literal("relay-control-api"),
  aud: z.literal("relay-mcp-gateway"),
  team: uuid,
  user: z.string().min(1).max(128),
  sid: z.string().min(1).max(128),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: uuid,
});
export function delegate(i: Identity, signing: string) {
  if (!i.session) throw new Rejection("SESSION_REQUIRED");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: "relay-control-api",
      aud: "relay-mcp-gateway",
      team: i.team,
      user: i.user,
      sid: i.session,
      iat: now,
      exp: now + 60,
      jti: randomUUID(),
    }),
  ).toString("base64url");
  return `rd.${payload}.${createHmac("sha256", signing).update(payload).digest("base64url")}`;
}
export async function delegatedIdentity(
  store: Store,
  token: string,
  signing: string,
) {
  const [prefix, payload, mac, ...tail] = token.split(".");
  if (
    prefix !== "rd" ||
    !payload ||
    !mac ||
    tail.length ||
    token.length > 2048 ||
    !equal(
      mac,
      createHmac("sha256", signing).update(payload).digest("base64url"),
    )
  )
    throw new Rejection("INVALID_DELEGATION", 401);
  let c;
  try {
    c = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    throw new Rejection("INVALID_DELEGATION", 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (c.exp <= now || c.iat > now + 5 || c.exp - c.iat > 60)
    throw new Rejection("DELEGATION_EXPIRED", 401);
  return store.tenant(c.team, async (tx) => {
    const i = await member(tx, c.user, c.team, "delegation", {
      session: c.sid,
    });
    if (
      !(
        await tx.query<{
          ok: boolean;
        }>("SELECT app.session_valid($1,$2) AS ok", [c.user, c.sid])
      ).rows[0]?.ok
    )
      throw new Rejection("SESSION_REVOKED", 401, i);
    return i;
  });
}
export async function current(store: Store, i: Identity) {
  return store.tenant(i.team, async (tx) => {
    const active = await member(tx, i.user, i.team, i.kind, {
      ...(i.key ? { key: i.key } : {}),
      ...(i.session ? { session: i.session } : {}),
    });
    if (i.oauthClient) active.oauthClient = i.oauthClient;
    if (i.oauthToken) active.oauthToken = i.oauthToken;
    if (
      i.key &&
      !(
        await tx.query(
          "SELECT 1 FROM app.api_keys WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
          [i.key, i.user],
        )
      ).rowCount
    )
      throw new Rejection("KEY_REVOKED", 401, i);
    if (
      i.session &&
      !(
        await tx.query<{
          ok: boolean;
        }>("SELECT app.session_valid($1,$2) AS ok", [i.user, i.session])
      ).rows[0]?.ok
    )
      throw new Rejection("SESSION_REVOKED", 401, i);
    return active;
  });
}
export function admin(i: Identity) {
  if (i.role !== "admin") throw new Rejection("ADMIN_REQUIRED");
}
export async function permitted(
  tx: Tx,
  i: Identity,
  upstream: string,
  tool: string,
) {
  const live = (
    await tx.query<{
      role: "admin" | "member";
      active: boolean;
      default_tool_effect: Effect;
    }>(
      "SELECT m.role,m.active,t.default_tool_effect FROM app.teams t JOIN app.memberships m ON m.team_id=t.id WHERE t.id=$1 AND m.user_id=$2",
      [i.team, i.user],
    )
  ).rows[0];
  if (!live?.active) return false;
  const rows = (
    await tx.query<{ effect: Effect }>(
      "SELECT effect FROM app.permission_rules WHERE subject IN ($1,$2,'*') AND (upstream_id IS NULL OR upstream_id=$3) AND (tool_name IS NULL OR tool_name=$4)",
      [`user:${i.user}`, `role:${live.role}`, upstream, tool],
    )
  ).rows;
  return toolDecision(
    live.default_tool_effect,
    rows.map((r) => r.effect),
  );
}
