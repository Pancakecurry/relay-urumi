import {
  mcpServiceApp,
  privatePeer,
  internalFetch,
  internalUrl,
} from "../../../packages/auth/src/transport.js";
import type { TLSSocket } from "node:tls";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { Store, pool, secret } from "../../../packages/db/src/store.js";
import {
  keyIdentity,
  delegatedIdentity,
  current,
  Rejection,
  type Identity,
} from "../../../packages/auth/src/identity.js";
import { Limits } from "../../../packages/auth/src/limits.js";
import { Audit } from "../../../packages/telemetry/src/audit.js";
import {
  Catalog,
  standard,
  validate,
  reviewedPatterns,
  type CatalogTool,
} from "./catalog.js";
import {
  amount,
  date,
  utc,
  productSchema,
  orderSchema,
} from "../../../packages/contracts/src/domain.js";
const reviewed = [amount, date, utc, productSchema, orderSchema];
function patterns(v: unknown): void {
  if (v && typeof v === "object")
    for (const [k, n] of Object.entries(v)) {
      if (k === "pattern" && typeof n === "string") reviewedPatterns.add(n);
      else patterns(n);
    }
}
for (const schema of reviewed) patterns(z.toJSONSchema(schema));
for (const pattern of [
  /^[A-Za-z0-9_-]{1,100}$/,
  /^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/,
  /^-?\d{1,21}(?:\.\d{1,3})?$/,
  /^-?\d+$/,
])
  reviewedPatterns.add(pattern.source);
const store = new Store(pool("app"));
const catalog = new Catalog(store);
const audit = new Audit(store);
const limits = new Limits();
const origin = process.env["PUBLIC_ORIGIN"] ?? "http://relay.localhost:18080";
const app = mcpServiceApp({
  allowedHosts: [
    "localhost",
    "127.0.0.1",
    "relay-gateway",
    new URL(origin).hostname,
  ],
  allowedOrigins: [new URL(origin).hostname],
});
app.addHook("onRequest", async (req, reply) => {
  if (req.url.startsWith("/internal/"))
    privatePeer(req.raw.socket as TLSSocket, ["relay-api"]);
  if (req.headers.origin && req.headers.origin !== origin)
    return reply.code(403).send({ error: { code: "ORIGIN_DENIED" } });
});
const auditedRequests = new WeakSet<object>();
app.setErrorHandler(async (error, req, reply) => {
  const status = (error as { statusCode?: number }).statusCode;
  const rejected = status && status >= 400 && status < 500;
  if (req.url === "/mcp" && !auditedRequests.has(req)) {
    auditedRequests.add(req);
    let actor: Identity | undefined;
    try {
      actor = await authenticate(req.headers.authorization);
    } catch (e) {
      if (e instanceof Rejection) actor = e.identity;
    }
    try {
      await audit.reject(
        actor,
        "unknown",
        rejected ? `HTTP_${status}` : "GATEWAY_CONTROL_UNAVAILABLE",
      );
    } catch {
      return reply.code(503).send({ error: { code: "AUDIT_UNAVAILABLE" } });
    }
  }
  return reply.code(rejected ? status : 503).send({
    error: {
      code: rejected ? `HTTP_${status}` : "GATEWAY_CONTROL_UNAVAILABLE",
    },
  });
});
app.addHook("onResponse", async (req, reply) => {
  if (req.url !== "/mcp" || reply.statusCode < 400 || auditedRequests.has(req))
    return;
  auditedRequests.add(req);
  let actor: Identity | undefined;
  try {
    actor = await authenticate(req.headers.authorization);
  } catch (e) {
    if (e instanceof Rejection) actor = e.identity;
  }
  try {
    await audit.reject(actor, "unknown", `HTTP_${reply.statusCode}`);
  } catch {
    console.error(
      "Boundary rejection audit unavailable; no tool was dispatched",
    );
  }
});
const callSchema = z.object({
  name: z.string().min(1).max(256),
  arguments: z.record(z.string(), z.unknown()).default({}),
});
async function authenticate(header: string | undefined) {
  if (!header?.startsWith("Bearer "))
    throw new Rejection("CREDENTIAL_REQUIRED", 401);
  const token = header.slice(7);
  if (token.startsWith("rk.")) return keyIdentity(store, token);
  if (token.startsWith("rd."))
    return delegatedIdentity(store, token, secret("delegation-signing"));
  if (
    process.env["OAUTH_ENABLED"] === "true" &&
    /^roa_[A-Za-z0-9_-]{20,4092}$/.test(token)
  ) {
    const r = await internalFetch(
      internalUrl("api", "/internal/oauth/identity"),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret("internal-token")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(3000),
      },
    );
    const d = (await r.json()) as {
      identity?: Identity;
      error?: { code: string };
    };
    if (!r.ok || !d.identity)
      throw new Rejection(
        d.error?.code ?? "OAUTH_UNAVAILABLE",
        r.status === 401 ? 401 : 503,
        d.identity,
      );
    return d.identity;
  }
  throw new Rejection("INVALID_CREDENTIAL", 401);
}
function failure(code: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code } }) }],
    structuredContent: { error: { code } },
  };
}
app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async () => {
  await store.ready();
  await limits.ready();
  return { status: "ok" };
});
app.get("/internal/tools", async (req) => {
  const i = await current(store, await authenticate(req.headers.authorization));
  const q = z
    .strictObject({
      query: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(25),
    })
    .parse(req.query);
  const visible = (await catalog.list(i)).map((t) => ({
    alias: t.alias,
    upstreamId: t.upstream.id,
    upstreamName: t.upstream.name,
    name: t.tool.name,
    description: t.tool.description,
    inputSchema: t.tool.inputSchema,
    outputSchema: t.tool.outputSchema,
  }));
  if (q.query === undefined) return { tools: visible };
  const terms = q.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = visible.filter((t) =>
    terms.every((term) =>
      `${t.alias} ${t.name} ${t.upstreamName} ${t.description ?? ""}`
        .toLowerCase()
        .includes(term),
    ),
  );
  return {
    tools: matches.slice(0, q.limit),
    total: matches.length,
    query: q.query,
  };
});
app.all("/mcp", { bodyLimit: 262144 }, async (req, reply) => {
  const raw = z
    .object({ method: z.string(), params: z.unknown().optional() })
    .safeParse(req.body);
  const attempted = raw.success && raw.data.method === "tools/call";
  const call = attempted
    ? callSchema.safeParse(raw.success ? raw.data.params : undefined)
    : undefined;
  const alias = call?.success ? call.data.name : "unknown";
  let i: Identity;
  let authenticated: Identity | undefined;
  try {
    i = await authenticate(req.headers.authorization);
    authenticated = i;
    await limits.rate(i);
  } catch (e) {
    const r =
      e instanceof Rejection ? e : new Rejection("AUTH_STORE_UNAVAILABLE", 503);
    auditedRequests.add(req);
    await audit.reject(r.identity ?? authenticated, alias, r.code);
    reply.header(
      "www-authenticate",
      process.env["OAUTH_ENABLED"] === "true"
        ? `Bearer realm="Relay", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"`
        : 'Bearer realm="Relay"',
    );
    return reply.code(r.status).send({ error: { code: r.code } });
  }
  let record: Awaited<ReturnType<Audit["start"]>> | undefined;
  let finished = false;
  let finalizing: Promise<void> | undefined;
  const disconnected = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) disconnected.abort();
  });
  if (attempted) {
    auditedRequests.add(req);
    record = await audit.start(
      i,
      alias,
      undefined,
      undefined,
      call?.success ? call.data.arguments : undefined,
    );
  }
  const finish = async (
    status: "success" | "failed" | "rejected" | "unknown",
    code: string | null,
  ) => {
    if (!record || finished) return;
    if (finalizing) return finalizing;
    finalizing = audit.finish(record, status, code).then(() => {
      finished = true;
    });
    return finalizing;
  };
  try {
    await audit.reconcile(i.team);
    const tools = await catalog.list(i);
    const selected = tools.find((t) => t.alias === alias);
    const preError =
      attempted &&
      (!call?.success ||
        !selected ||
        !validate(selected.tool.inputSchema, call.data.arguments))
        ? selected
          ? "INVALID_TOOL_ARGUMENTS"
          : "TOOL_NOT_AVAILABLE"
        : undefined;
    if (preError) await finish("rejected", preError);
    if (record && selected)
      await store.tenant(i.team, async (tx) => {
        await tx.query(
          "UPDATE app.audit_calls SET upstream_id=$2,tool_name=$3 WHERE id=$1",
          [record!.id, selected.upstream.id, selected.tool.name],
        );
      });
    const handler = toNodeHandler(
      createMcpHandler(() => {
        const server = new McpServer(
          { name: "relay-team-gateway", version: "0.3.0" },
          { capabilities: { tools: { listChanged: false } } },
        );
        for (const t of tools) {
          if (preError && t.alias === alias) continue;
          server.registerTool(
            t.alias,
            {
              title: `${t.upstream.name}: ${t.tool.name}`,
              description: `${t.upstream.name}: ${t.tool.description ?? t.tool.name}`,
              inputSchema: standard(t.tool.inputSchema),
              ...(t.tool.outputSchema
                ? { outputSchema: standard(t.tool.outputSchema) }
                : {}),
              ...(t.tool.annotations
                ? { annotations: t.tool.annotations }
                : {}),
              _meta: {
                relay: {
                  upstreamId: t.upstream.id,
                  upstreamName: t.upstream.name,
                  toolName: t.tool.name,
                },
              },
            },
            async (args, ctx) =>
              execute(
                t,
                z.record(z.string(), z.unknown()).parse(args),
                AbortSignal.any([ctx.mcpReq.signal, disconnected.signal]),
              ),
          );
        }
        if (preError && call?.success)
          server.registerTool(
            alias,
            { inputSchema: z.record(z.string(), z.unknown()) },
            async () => ({
              ...failure(preError),
              _meta: { relay: { auditId: record?.id ?? null } },
            }),
          );
        return server;
      }),
    );
    async function execute(
      t: CatalogTool,
      args: Record<string, unknown>,
      signal: AbortSignal,
    ) {
      let release: (() => Promise<void>) | undefined;
      try {
        i = await current(
          store,
          i.kind === "oauth"
            ? await authenticate(req.headers.authorization)
            : i,
        );
        await catalog.authorize(i, t);
        release = await limits.lease(i, t.upstream.id);
        const result = await catalog.call(i, t, args, signal);
        const detail = z
          .object({
            error: z.object({ code: z.string().regex(/^[A-Z_]{1,64}$/) }),
          })
          .safeParse(result.structuredContent);
        await finish(
          result.isError ? "failed" : "success",
          result.isError
            ? detail.success
              ? detail.data.error.code
              : "UPSTREAM_TOOL_ERROR"
            : null,
        );
        return {
          ...result,
          _meta: {
            relay: {
              auditId: record?.id ?? null,
              upstreamId: t.upstream.id,
              upstreamName: t.upstream.name,
              toolName: t.tool.name,
            },
          },
        };
      } catch (e) {
        const code =
          e instanceof Rejection
            ? e.code
            : signal.aborted
              ? "CALL_CANCELLED"
              : String(e).includes("Timeout") || String(e).includes("timeout")
                ? "UPSTREAM_TIMEOUT"
                : "UPSTREAM_UNAVAILABLE";
        await finish(e instanceof Rejection ? "rejected" : "failed", code);
        return {
          ...failure(code),
          _meta: {
            relay: {
              auditId: record?.id ?? null,
              upstreamId: t.upstream.id,
              upstreamName: t.upstream.name,
              toolName: t.tool.name,
            },
          },
        };
      } finally {
        await release?.().catch(() => {});
      }
    }
    reply.hijack();
    await handler(
      Object.assign(req.raw, { method: req.method, url: req.url }),
      reply.raw,
      req.body,
    );
    // Malformed protocol envelopes can be rejected by the SDK before tool dispatch.
    if (record && !finished)
      await finish(
        disconnected.signal.aborted ? "failed" : "rejected",
        disconnected.signal.aborted ? "CALL_CANCELLED" : "PROTOCOL_REJECTED",
      );
  } catch (e) {
    await finish(
      "unknown",
      e instanceof Rejection ? e.code : "GATEWAY_CONTROL_UNAVAILABLE",
    );
    if (!reply.raw.headersSent)
      return reply
        .code(503)
        .send({ error: { code: "GATEWAY_CONTROL_UNAVAILABLE" } });
    reply.raw.destroy();
  }
});
await app.listen({ host: "0.0.0.0", port: 3000 });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    catalog.close();
    limits.close();
    void app.close().then(() => store.pool.end());
  });
