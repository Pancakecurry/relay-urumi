import { permissionSummary } from "./permissions.js";
import {
  internalFetch,
  internalUrl,
} from "../../../packages/auth/src/transport.js";
import { APICallError } from "ai";
import type { FastifyInstance, FastifyRequest } from "fastify";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store, secret } from "../../../packages/db/src/store.js";
import {
  Rejection,
  delegate,
  type Identity,
} from "../../../packages/auth/src/identity.js";
import { runAgent, MODEL } from "../../../packages/model-provider/src/agent.js";
type Headers = FastifyRequest["headers"];
export function installConsole(
  app: FastifyInstance,
  store: Store,
  identity: (h: Headers) => Promise<Identity>,
  login: (h: Headers) => Promise<unknown>,
) {
  app.get("/api/config", async () => ({
    storefrontUrl:
      process.env["STOREFRONT_URL"] ??
      "http://store.relay.localhost:18080/shop/",
  }));
  app.get("/api/me", async (req) => {
    const s = (await login(req.headers)) as {
      user: { id: string; name: string; email: string };
    };
    return { user: s.user };
  });
  app.get("/api/overview", async (req) => {
    const i = await identity(req.headers);
    return store.tenant(i.team, async (tx) => {
      const rows = (
        await tx.query(
          "SELECT u.id,u.name,u.enabled,u.revision,(u.credential_ref IS NOT NULL) AS has_credentials,CASE WHEN NOT u.enabled THEN 'Disabled' ELSE COALESCE(c.state,'Unreachable') END AS status,c.reason,c.checked_at,COALESCE(c.tools,'[]') AS catalog_tools FROM app.upstreams u LEFT JOIN app.tool_catalog_versions c ON c.upstream_id=u.id AND c.revision=u.revision WHERE u.deleted_at IS NULL ORDER BY u.created_at",
        )
      ).rows;
      const upstreams = [];
      for (const row of rows) {
        const summary = await permissionSummary(
          tx,
          i,
          row.id,
          row.catalog_tools,
        );
        if (summary.visible) {
          const { catalog_tools, ...safe } = row;
          void catalog_tools;
          upstreams.push({
            ...safe,
            tool_count: row.enabled ? summary.count : 0,
          });
        }
      }
      return {
        upstreams,
        activity: (
          await tx.query(
            "SELECT id,user_id,upstream_id,tool_name,started_at,duration_ms,status,code FROM app.audit_calls WHERE ($1='admin' OR user_id=$2) ORDER BY started_at DESC LIMIT 12",
            [i.role, i.user],
          )
        ).rows,
        role: i.role,
        userId: i.user,
        gatewayUrl: `${process.env["PUBLIC_ORIGIN"] ?? "http://relay.localhost:18080"}/mcp`,
        budget: (await tx.query("SELECT * FROM app.model_budget()")).rows[0],
        model: MODEL,
        modelEnabled: process.env["MODEL_ENABLED"] === "true",
      };
    });
  });
  app.get("/api/chat/runs", async (req) => {
    const i = await identity(req.headers);
    return store.tenant(i.team, async (tx) => ({
      runs: (
        await tx.query(
          "SELECT * FROM app.chat_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
          [i.user],
        )
      ).rows,
    }));
  });
  app.get("/api/chat/runs/:id", async (req) => {
    const i = await identity(req.headers);
    const id = z.uuid().parse((req.params as { id: string }).id);
    return store.tenant(i.team, async (tx) => {
      const run = (
        await tx.query(
          "SELECT * FROM app.chat_runs WHERE id=$1 AND user_id=$2",
          [id, i.user],
        )
      ).rows[0];
      if (!run) throw new Rejection("RUN_NOT_FOUND", 404);
      return {
        run,
        events: (
          await tx.query(
            "SELECT id,kind,data,created_at FROM app.chat_events WHERE run_id=$1 AND user_id=$2 ORDER BY created_at,id",
            [id, i.user],
          )
        ).rows,
      };
    });
  });
  const running = new Map<string, AbortController>();
  app.post("/api/chat/runs/:id/cancel", async (req) => {
    const i = await identity(req.headers);
    const id = z.uuid().parse((req.params as { id: string }).id);
    await store.tenant(i.team, async (tx) => {
      if (
        !(
          await tx.query(
            "SELECT 1 FROM app.chat_runs WHERE id=$1 AND user_id=$2",
            [id, i.user],
          )
        ).rowCount
      )
        throw new Rejection("RUN_NOT_FOUND", 404);
    });
    const c = running.get(id);
    if (!c) throw new Rejection("RUN_NOT_ACTIVE_ON_REPLICA", 409);
    c.abort();
    return { cancelRequested: true };
  });
  app.post("/api/chat/runs", async (req, reply) => {
    const i = await identity(req.headers);
    const b = z
      .strictObject({ prompt: z.string().trim().min(1).max(4000) })
      .parse(req.body);
    if (process.env["MODEL_ENABLED"] !== "true")
      throw new Rejection("MODEL_DISABLED", 503);
    const key = readFileSync("/run/model/api-key", "utf8").trim();
    if (!key) throw new Rejection("MODEL_DISABLED", 503);
    const id = randomUUID();
    await store.tenant(i.team, async (tx) => {
      await tx.query(
        "SELECT user_id FROM app.memberships WHERE user_id=$1 FOR UPDATE",
        [i.user],
      );
      const active = await tx.query(
        "SELECT id FROM app.chat_runs WHERE user_id=$1 AND status='running' AND created_at>now()-interval '4 minutes'",
        [i.user],
      );
      if (active.rowCount) throw new Rejection("CHAT_ALREADY_RUNNING", 409);
      await tx.query(
        "UPDATE app.chat_runs SET status='unknown',error_code='PROCESS_INTERRUPTED_CHECK_AUDIT',finished_at=now() WHERE user_id=$1 AND status='running'",
        [i.user],
      );
      await tx.query(
        "INSERT INTO app.chat_runs(id,team_id,user_id,prompt) VALUES($1,$2,$3,$4)",
        [id, i.team, i.user, b.prompt],
      );
    });
    const controller = new AbortController();
    running.set(id, controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(180000),
    ]);
    const task = async () => {
      try {
        const answer = await runAgent({
          prompt: b.prompt,
          key,
          gateway: internalUrl("gateway", "/mcp"),
          fetch: internalFetch,
          credential: async () =>
            delegate(await identity(req.headers), secret("delegation-signing")),
          signal,
          reserve: async () => {
            if (process.env["MODEL_ENABLED"] !== "true")
              throw new Error("MODEL_DISABLED");
            return store.tenant(i.team, async (tx) =>
              String(
                (await tx.query("SELECT app.reserve_model($1) AS id", [id]))
                  .rows[0].id,
              ),
            );
          },
          usage: async (r, u) => {
            await store.tenant(i.team, async (tx) => {
              await tx.query("SELECT app.model_usage($1,$2)", [
                r,
                JSON.stringify(u),
              ]);
            });
          },
          event: async (e) => {
            await identity(req.headers);
            await store.tenant(i.team, async (tx) => {
              await tx.query(
                "INSERT INTO app.chat_events(id,team_id,run_id,user_id,kind,data) VALUES($1,$2,$3,$4,$5,$6)",
                [
                  randomUUID(),
                  i.team,
                  id,
                  i.user,
                  e.kind,
                  JSON.stringify(e.data),
                ],
              );
            });
          },
        });
        await store.tenant(i.team, async (tx) => {
          await tx.query(
            "UPDATE app.chat_runs SET status='success',answer=$2,finished_at=now() WHERE id=$1",
            [id, answer],
          );
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        const providerCode = APICallError.isInstance(e)
          ? e.statusCode === 429
            ? "MODEL_RATE_LIMITED"
            : [401, 403].includes(e.statusCode ?? 0)
              ? "MODEL_AUTHORIZATION_FAILED"
              : e.statusCode === 400
                ? "MODEL_SCHEMA_REJECTED"
                : "MODEL_PROVIDER_UNAVAILABLE"
          : undefined;
        const code =
          [
            "MODEL_BUDGET_EXHAUSTED",
            "MODEL_REQUEST_BOUNDARY",
            "CATALOG_CONTEXT_LIMIT",
            "AGENT_STEP_LIMIT_CHECK_EXECUTIONS",
            "TOOL_INTERRUPTED_CHECK_AUDIT_BEFORE_RETRY",
            "TOOL_RESULT_LIMIT",
            "TOOL_CALL_LIMIT",
          ].find((v) => message.includes(v)) ??
          (signal.aborted
            ? "CANCELLED_OR_TIMED_OUT_CHECK_AUDIT"
            : (providerCode ?? "MODEL_UNAVAILABLE_CHECK_EXECUTIONS"));
        await store.tenant(i.team, async (tx) => {
          await tx.query(
            "UPDATE app.chat_runs SET status='failed',error_code=$2,finished_at=now() WHERE id=$1",
            [id, code],
          );
        });
      } finally {
        running.delete(id);
      }
    };
    void task().catch(() => {
      console.error("Chat persistence unavailable; inspect audit before retry");
    });
    return reply.code(202).send({ id });
  });
}
