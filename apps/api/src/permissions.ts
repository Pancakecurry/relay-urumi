import type { FastifyInstance, FastifyRequest } from "fastify";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { Store, type Tx } from "../../../packages/db/src/store.js";
import {
  permitted,
  lockedMember,
  Rejection,
  uuid,
  type Identity,
} from "../../../packages/auth/src/identity.js";

// Operational counts must obey the same execution policy as discovery/search.
export async function permissionSummary(
  tx: Tx,
  i: Identity,
  id: string,
  tools: { name: string }[],
) {
  let count = 0;
  for (const tool of tools) if (await permitted(tx, i, id, tool.name)) count++;
  return {
    visible:
      i.role === "admin" || count > 0 || (await permitted(tx, i, id, "*")),
    count,
  };
}
export function installPermissions(
  app: FastifyInstance,
  store: Store,
  identity: (headers: FastifyRequest["headers"]) => Promise<Identity>,
  event: (
    tx: Tx,
    i: Identity,
    action: string,
    target?: string,
  ) => Promise<void>,
) {
  async function managed<T>(
    req: FastifyRequest,
    fn: (tx: Tx, i: Identity) => Promise<T>,
  ) {
    const i = await identity(req.headers);
    return store.tenant(i.team, async (tx) => {
      // Recheck the management role within the same transaction as its mutation.
      const live = await lockedMember(tx, i, true);
      return fn(tx, live);
    });
  }
  app.get("/api/permissions", (req) =>
    managed(req, async (tx, i) => {
      const config = (
        await tx.query<{
          default_tool_effect: "allow" | "deny";
          permission_revision: number;
        }>(
          "SELECT default_tool_effect,permission_revision FROM app.teams WHERE id=$1",
          [i.team],
        )
      ).rows[0]!;
      return {
        defaultEffect: config.default_tool_effect,
        revision: config.permission_revision,
        rules: (
          await tx.query(
            "SELECT id,subject,upstream_id,tool_name,effect FROM app.permission_rules ORDER BY created_at,id",
          )
        ).rows,
      };
    }),
  );
  app.patch("/api/permissions/default", (req) =>
    managed(req, async (tx, i) => {
      const b = z
        .strictObject({
          defaultEffect: z.enum(["allow", "deny"]),
          revision: z.number().int().positive(),
        })
        .parse(req.body);
      const r = await tx.query(
        "UPDATE app.teams SET default_tool_effect=$2,permission_revision=permission_revision+1 WHERE id=$1 AND permission_revision=$3 RETURNING permission_revision",
        [i.team, b.defaultEffect, b.revision],
      );
      if (!r.rowCount) throw new Rejection("REVISION_CONFLICT", 409);
      await event(tx, i, "permission.default", b.defaultEffect);
      return { updated: true, revision: r.rows[0]!.permission_revision };
    }),
  );
  // Configuration visibility is an admin capability, separate from tool execution.
  app.get("/api/permissions/catalog", (req) =>
    managed(req, async (tx) => ({
      servers: (
        await tx.query<{ id: string; name: string; tools: { name: string }[] }>(
          "SELECT u.id,u.name,COALESCE(c.tools,'[]'::jsonb) AS tools FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.deleted_at IS NULL ORDER BY u.name,u.id",
        )
      ).rows.map((u) => ({
        id: u.id,
        name: u.name,
        tools: u.tools.map((t) => ({ name: t.name })),
      })),
    })),
  );
  app.post("/api/permissions", (req) =>
    managed(req, async (tx, i) => {
      const b = z
        .strictObject({
          subject: z
            .string()
            .regex(/^(\*|role:(admin|member)|user:[a-zA-Z0-9-]{1,128})$/),
          upstreamId: uuid.optional(),
          toolName: z.string().min(1).max(256).optional(),
          effect: z.enum(["allow", "deny"]),
        })
        .parse(req.body);
      if (
        b.subject.startsWith("user:") &&
        !(
          await tx.query("SELECT 1 FROM app.memberships WHERE user_id=$1", [
            b.subject.slice(5),
          ])
        ).rowCount
      )
        throw new Rejection("MEMBER_NOT_FOUND", 404);
      if (
        b.upstreamId &&
        !(
          await tx.query(
            "SELECT 1 FROM app.upstreams WHERE id=$1 AND deleted_at IS NULL",
            [b.upstreamId],
          )
        ).rowCount
      )
        throw new Rejection("UPSTREAM_NOT_FOUND", 404);
      if (
        b.toolName &&
        !(
          await tx.query(
            "SELECT 1 FROM app.upstreams u JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision CROSS JOIN LATERAL jsonb_array_elements(c.tools) t WHERE u.deleted_at IS NULL AND ($1::uuid IS NULL OR u.id=$1) AND t->>'name'=$2 LIMIT 1",
            [b.upstreamId ?? null, b.toolName],
          )
        ).rowCount
      )
        throw new Rejection("POLICY_TOOL_NOT_FOUND", 404);
      const existing = (
        await tx.query<{ id: string }>(
          "SELECT id FROM app.permission_rules WHERE subject=$1 AND upstream_id IS NOT DISTINCT FROM $2::uuid AND tool_name IS NOT DISTINCT FROM $3::text AND effect=$4 LIMIT 1",
          [b.subject, b.upstreamId ?? null, b.toolName ?? null, b.effect],
        )
      ).rows[0];
      if (existing) return { id: existing.id, created: false };
      const id = randomUUID();
      await tx.query(
        "INSERT INTO app.permission_rules(id,team_id,subject,upstream_id,tool_name,effect) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          i.team,
          b.subject,
          b.upstreamId ?? null,
          b.toolName ?? null,
          b.effect,
        ],
      );
      await tx.query(
        "UPDATE app.teams SET permission_revision=permission_revision+1 WHERE id=$1",
        [i.team],
      );
      await event(tx, i, "permission.add", id);
      return { id, created: true };
    }),
  );
  app.delete("/api/permissions/:id", (req) =>
    managed(req, async (tx, i) => {
      const id = uuid.parse((req.params as { id: string }).id);
      if (
        !(
          await tx.query(
            "DELETE FROM app.permission_rules WHERE id=$1 RETURNING id",
            [id],
          )
        ).rowCount
      )
        throw new Rejection("POLICY_NOT_FOUND", 404);
      await tx.query(
        "UPDATE app.teams SET permission_revision=permission_revision+1 WHERE id=$1",
        [i.team],
      );
      await event(tx, i, "permission.remove", id);
      return { removed: true };
    }),
  );
}
