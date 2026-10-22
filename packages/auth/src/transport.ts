import Fastify from "fastify";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import {
  hostHeaderValidation,
  originValidation,
} from "@modelcontextprotocol/fastify";
import { readFileSync, realpathSync } from "node:fs";
import { createPrivateKey, X509Certificate } from "node:crypto";
import type { ServerOptions } from "node:https";
import type { TLSSocket } from "node:tls";
import { Rejection } from "./identity.js";
export function serviceTls(): ServerOptions | undefined {
  const dir = process.env["RELAY_TLS_DIR"];
  if (!dir) return;
  // Read one immutable Secret projection generation, never a mixed key/cert pair.
  const generation = realpathSync(dir + "/..data");
  const cert = readFileSync(generation + "/tls.crt"),
    key = readFileSync(generation + "/tls.key");
  if (!new X509Certificate(cert).checkPrivateKey(createPrivateKey(key)))
    throw new Error("TLS_KEY_PAIR_MISMATCH");
  return {
    cert,
    key,
    ca: readFileSync(process.env["RELAY_CA_FILE"] ?? generation + "/ca.crt"),
    minVersion: "TLSv1.3",
    requestCert: true,
    rejectUnauthorized: false,
  };
}
// The official SDK Fastify factory has no HTTPS option. Keep its exported guards
// and official Node MCP handler while letting Fastify create the TLS listener.
export function serviceApp(bodyLimit = 262144) {
  const tls = serviceTls();
  const app = Fastify({
    logger: false,
    bodyLimit,
    serverFactory: (handler) =>
      tls ? httpsServer(tls, handler) : httpServer(handler),
  });
  if (tls) {
    const server = app.server as import("node:https").Server;
    let last = "";
    const refresh = () => {
      try {
        const next = serviceTls();
        const stamp = String(next?.cert);
        if (next && stamp !== last) {
          server.setSecureContext(next);
          last = stamp;
        }
      } catch {
        console.error("TLS projection refresh unavailable");
      }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    timer.unref();
    app.addHook("onClose", async () => {
      clearInterval(timer);
    });
  }
  return app;
}
export function mcpServiceApp(options: {
  allowedHosts: string[];
  allowedOrigins: string[];
}) {
  const app = serviceApp();
  app.addHook("onRequest", hostHeaderValidation(options.allowedHosts));
  app.addHook("onRequest", originValidation(options.allowedOrigins));
  return app;
}
export function privatePeer(socket: TLSSocket, roles: readonly string[]) {
  if (!process.env["RELAY_TLS_DIR"]) return; // Transitional HTTP mode remains explicitly recorded until fleet migration.
  const peer = socket.getPeerCertificate();
  if (
    !socket.encrypted ||
    !socket.authorized ||
    !roles.includes(typeof peer.subject?.CN === "string" ? peer.subject.CN : "")
  )
    throw new Rejection("SERVICE_IDENTITY_DENIED", 403);
}

export function internalUrl(
  role: "api" | "gateway" | "provisioner",
  path: string,
) {
  const port = { api: 3001, gateway: 3000, provisioner: 3003 }[role];
  return `${process.env["RELAY_TLS_DIR"] ? "https" : "http"}://relay-${role}:${port}${path}`;
}
export const internalFetch: typeof fetch = async (input, init) => {
  const u = new URL(input instanceof Request ? input.url : String(input));
  if (
    ![
      "relay-api:3001",
      "relay-gateway:3000",
      "relay-provisioner:3003",
    ].includes(u.host) ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new Rejection("SERVICE_DESTINATION_DENIED", 403);
  const tls = serviceTls();
  if (!tls) {
    if (u.protocol !== "http:")
      throw new Rejection("SERVICE_TRANSPORT_DENIED", 503);
    return fetch(input, init);
  }
  if (u.protocol !== "https:") throw new Rejection("SERVICE_TLS_REQUIRED", 503);
  const { request } = await import("node:https");
  const { Readable, Transform } = await import("node:stream");
  const headers = new Headers(init?.headers);
  headers.set("host", u.host);
  const body = init?.body;
  if (body && typeof body !== "string" && !(body instanceof URLSearchParams))
    throw new Rejection("SERVICE_BODY_UNSUPPORTED", 400);
  return new Promise((resolve, reject) => {
    const r = request(
      {
        hostname: u.hostname,
        servername: u.hostname,
        port: Number(u.port),
        path: u.pathname + u.search,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(headers),
        ca: tls.ca,
        cert: tls.cert,
        key: tls.key,
        rejectUnauthorized: true,
        minVersion: "TLSv1.3",
        agent: false,
        signal: AbortSignal.any([
          AbortSignal.timeout(10000),
          ...(init?.signal ? [init.signal] : []),
        ]),
      },
      (res) => {
        const status = res.statusCode ?? 503;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new Rejection("SERVICE_REDIRECT_DENIED", 502));
          return;
        }
        const h = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2)
          h.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        let bytes = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            bytes += chunk.length;
            done(
              bytes > 1048576 ? new Error("SERVICE_RESPONSE_LIMIT") : null,
              chunk,
            );
          },
        });
        limiter.on("error", () => r.destroy());
        res.on("error", (e) => limiter.destroy(e));
        res.pipe(limiter);
        resolve(
          new Response(
            [204, 205, 304].includes(status)
              ? null
              : (Readable.toWeb(limiter) as ReadableStream<Uint8Array>),
            { status, headers: h },
          ),
        );
      },
    );
    r.on("error", reject);
    r.end(body?.toString());
  });
};
