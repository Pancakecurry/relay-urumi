import { serviceTls } from "../../../packages/auth/src/transport.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DomainError,
  currency,
  type Currency,
} from "../../../packages/contracts/src/domain.js";

export interface StoreConfig {
  canonicalUrl: string;
  connectionUrl: string;
  consumerKey: string;
  consumerSecret: string;
  currency: Currency;
  timezone: string;
  timeoutMs: number;
}
const enc = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export function oauthHeader(
  method: string,
  url: URL,
  key: string,
  secret: string,
) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: "HMAC-SHA256",
  };
  const pairs = [...url.searchParams, ...Object.entries(oauth)]
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([ak, av], [bk, bv]) =>
      ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1,
    );
  const base = [
    method,
    enc(url.origin + url.pathname),
    enc(pairs.map(([k, v]) => `${k}=${v}`).join("&")),
  ].join("&");
  oauth["oauth_signature"] = createHmac("sha256", `${enc(secret)}&`)
    .update(base)
    .digest("base64");
  return (
    "OAuth " +
    Object.entries(oauth)
      .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
      .join(", ")
  );
}
export function validateConfig(c: StoreConfig) {
  for (const value of [c.canonicalUrl, c.connectionUrl]) {
    const u = new URL(value);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      throw new Error(
        "Store URLs must be fixed HTTP(S) origins without credentials",
      );
  }
  if (
    !/^ck_[a-f0-9]{40}$/.test(c.consumerKey) ||
    !/^cs_[a-f0-9]{40}$/.test(c.consumerSecret)
  )
    throw new Error("Invalid store credential configuration");
  if (c.timeoutMs < 100 || c.timeoutMs > 10000)
    throw new Error("REST timeout must be 100–10000ms");
  if (new URL(c.canonicalUrl).protocol !== new URL(c.connectionUrl).protocol)
    throw new Error("Transport protocol mismatch");
}
export class WooRest {
  constructor(readonly config: StoreConfig) {
    validateConfig(config);
  }
  async call(
    method: "GET" | "POST" | "PUT",
    path: string,
    query: Record<string, string> = {},
    body?: unknown,
    signal?: AbortSignal,
  ) {
    if (!/^(products|orders)(\/\d+)?$/.test(path))
      throw new DomainError("INVALID_PATH", false, "not_executed");
    if (signal?.aborted)
      throw new DomainError("CANCELLED", false, "not_executed");
    const canonical = new URL(
      `/wp-json/wc/v3/${path}`,
      this.config.canonicalUrl,
    );
    for (const [k, v] of Object.entries(query))
      canonical.searchParams.set(k, v);
    const connection = new URL(
      canonical.pathname + canonical.search,
      this.config.connectionUrl,
    );
    const isWrite = method !== "GET";
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const auth =
      canonical.protocol === "https:"
        ? `Basic ${Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64")}`
        : oauthHeader(
            method,
            canonical,
            this.config.consumerKey,
            this.config.consumerSecret,
          );
    return await new Promise<{
      body: unknown;
      total?: string;
      totalPages?: string;
    }>((resolve, reject) => {
      const failure = (error: Error) =>
        reject(
          error instanceof DomainError
            ? error
            : new DomainError(
                timeout.aborted
                  ? "TIMEOUT"
                  : signal?.aborted
                    ? "CANCELLED"
                    : "UPSTREAM_UNAVAILABLE",
                !isWrite,
                isWrite ? "unknown" : "not_executed",
              ),
        );
      const req = (
        connection.protocol === "https:" ? httpsRequest : httpRequest
      )(
        connection,
        {
          ...(connection.protocol === "https:"
            ? (() => {
                const tls = serviceTls();
                if (!tls) throw new Error("Store TLS identity unavailable");
                return {
                  ca: tls.ca,
                  cert: tls.cert,
                  key: tls.key,
                  rejectUnauthorized: true,
                  minVersion: "TLSv1.3" as const,
                  servername: connection.hostname,
                  agent: false as const,
                };
              })()
            : {}),
          method,
          signal: combined,
          headers: {
            Host: canonical.host,
            Authorization: auth,
            Accept: "application/json",
            ...(payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
          },
        },
        (response) => {
          const status = response.statusCode ?? 502;
          // Never follow redirects or forward auth to a different origin. Never echo a provider error body.
          if (status < 200 || status >= 300) {
            response.resume();
            reject(
              new DomainError(
                status === 401 || status === 403
                  ? "UPSTREAM_AUTH"
                  : status === 404
                    ? "NOT_FOUND"
                    : status === 429
                      ? "UPSTREAM_RATE_LIMIT"
                      : status >= 500
                        ? "UPSTREAM_UNAVAILABLE"
                        : "UPSTREAM_REJECTED",
                !isWrite && (status === 429 || status >= 500),
                isWrite && status >= 500 ? "unknown" : "rejected",
                status,
              ),
            );
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1_048_576)
              response.destroy(
                new DomainError(
                  "RESPONSE_TOO_LARGE",
                  false,
                  isWrite ? "unknown" : "not_executed",
                ),
              );
            else chunks.push(chunk);
          });
          response.on("error", failure);
          response.on("end", () => {
            try {
              const parsed: unknown = JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              );
              const total = response.headers["x-wp-total"];
              const pages = response.headers["x-wp-totalpages"];
              resolve({
                body: parsed,
                ...(typeof total === "string" ? { total } : {}),
                ...(typeof pages === "string" ? { totalPages: pages } : {}),
              });
            } catch {
              reject(
                new DomainError(
                  "UPSTREAM_INVALID_RESPONSE",
                  false,
                  isWrite ? "unknown" : "not_executed",
                ),
              );
            }
          });
        },
      );
      req.on("error", failure);
      req.end(payload);
    });
  }
}
export function storeConfig(): StoreConfig {
  const required = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required`);
    return v;
  };
  return {
    canonicalUrl: required("STORE_CANONICAL_URL"),
    connectionUrl: required("STORE_CONNECTION_URL"),
    consumerKey: readFileSync(required("WC_KEY_FILE"), "utf8").trim(),
    consumerSecret: readFileSync(required("WC_SECRET_FILE"), "utf8").trim(),
    currency: currency.parse(required("STORE_CURRENCY")),
    timezone: required("STORE_TIMEZONE"),
    timeoutMs: Number(process.env["REST_TIMEOUT_MS"] ?? 8000),
  };
}
