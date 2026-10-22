import {
  internalFetch,
  internalUrl,
} from "../../../packages/auth/src/transport.js";
import type { StoreObservation } from "../../../packages/contracts/src/stores.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import * as z from "zod/v4";
import { secret } from "../../../packages/db/src/store.js";
import { Store } from "../../../packages/db/src/store.js";
import {
  Rejection,
  lockedMember,
  permitted,
  uuid,
  type Identity,
} from "../../../packages/auth/src/identity.js";
const fields =
  "id,name,namespace,host,url,status,desired,phase,generation,attempt,error_code,created_at,updated_at,deadline,upstream_id,user_id";
export function installStores(
  app: FastifyInstance,
  store: Store,
  identity: (headers: FastifyRequest["headers"]) => Promise<Identity>,
) {
  app.get("/api/stores", async (req) => {
    const i = await identity(req.headers);
    return store.tenant(i.team, async (tx) => ({
      stores: (
        await tx.query(
          `SELECT ${fields} FROM app.stores ORDER BY created_at DESC`,
        )
      ).rows,
      limit: Number(process.env["STORE_USER_LIMIT"] ?? 2),
    }));
  });
  app.get("/api/stores/:id/events", async (req) => {
    const i = await identity(req.headers);
    const id = uuid.parse((req.params as { id: string }).id);
    return store.tenant(i.team, async (tx) => ({
      operations: (
        await tx.query(
          "SELECT generation,kind,created_at FROM app.operations WHERE store_id=$1 ORDER BY created_at",
          [id],
        )
      ).rows,
      events: (
        await tx.query(
          "SELECT generation,phase,code,created_at FROM app.store_events WHERE store_id=$1 ORDER BY created_at",
          [id],
        )
      ).rows,
    }));
  });
  app.get("/api/stores/:id/observed", async (req) => {
    const i = await identity(req.headers),
      id = uuid.parse((req.params as { id: string }).id);
    if (
      !(await store.tenant(
        i.team,
        async (tx) =>
          (await tx.query("SELECT 1 FROM app.stores WHERE id=$1", [id]))
            .rowCount,
      ))
    )
      throw new Rejection("STORE_NOT_FOUND", 404);
    try {
      const r = await internalFetch(
        internalUrl(
          "provisioner",
          `/internal/stores/${id}/observed?team=${i.team}`,
        ),
        {
          headers: { authorization: `Bearer ${secret("internal-token")}` },
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        },
      );
      if (!r.ok) throw new Error();
      const result = (await r.json()) as StoreObservation;
      const visible = [];
      for (const tool of result.tools)
        if (await store.tenant(i.team, (tx) => permitted(tx, i, id, tool.name)))
          visible.push(tool);
      result.tools = visible;
      const gateway = result.components.find((c) => c.id === "gateway");
      if (gateway) gateway.configuration["tools"] = visible.length;
      return result;
    } catch {
      throw new Rejection("OBSERVATION_UNAVAILABLE", 503);
    }
  });
  async function request(
    req: FastifyRequest,
    action: "create" | "delete" | "retry" | "reconcile",
  ) {
    const i = await identity(req.headers);
    const b = z
      .strictObject({
        idempotencyId: uuid,
        ...(action === "create"
          ? {
              name: z
                .string()
                .trim()
                .min(1)
                .max(60)
                .regex(/^[\p{L}\p{N} _-]+$/u),
            }
          : {}),
      })
      .parse(req.body);
    const target =
      action === "create"
        ? null
        : uuid.parse((req.params as { id: string }).id);
    try {
      return await store.tenant(i.team, async (tx) => {
        await lockedMember(tx, i);
        const id = (
          await tx.query<{ id: string }>(
            "SELECT app.store_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
            [
              i.team,
              i.user,
              "name" in b ? b.name : null,
              b.idempotencyId,
              process.env["STORE_DOMAIN"] ?? "relay.localhost",
              process.env["STORE_URL_SUFFIX"] ?? ":18080",
              Number(process.env["STORE_USER_LIMIT"] ?? 2),
              Number(process.env["STORE_TIMEOUT_SECONDS"] ?? 600),
              action,
              target,
              new URL(
                process.env["PUBLIC_ORIGIN"] ?? "http://relay.localhost",
              ).protocol.slice(0, -1),
            ],
          )
        ).rows[0]!.id;
        return {
          store: (
            await tx.query(`SELECT ${fields} FROM app.stores WHERE id=$1`, [id])
          ).rows[0],
        };
      });
    } catch (e) {
      const message = (e as Error).message;
      const code = /^STORE_[A-Z_]+$/.test(message) ? message : null;
      if (code)
        throw new Rejection(code, code === "STORE_NOT_FOUND" ? 404 : 409);
      throw e;
    }
  }
  app.post("/api/stores", async (req, reply) =>
    reply.code(202).send(await request(req, "create")),
  );
  app.post("/api/stores/:id/delete", async (req, reply) =>
    reply.code(202).send(await request(req, "delete")),
  );
  app.post("/api/stores/:id/reconcile", async (req, reply) =>
    reply.code(202).send(await request(req, "reconcile")),
  );
  app.post("/api/stores/:id/retry", async (req, reply) =>
    reply.code(202).send(await request(req, "retry")),
  );
}
