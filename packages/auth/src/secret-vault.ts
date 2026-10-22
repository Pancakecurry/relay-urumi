import https from "node:https";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { Rejection, equal } from "./identity.js";
import { secret } from "../../db/src/store.js";
import { keyring, seal, unseal, type Envelope } from "./sealed.js";
export const headerSchema = z
  .record(
    z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    z
      .string()
      .min(1)
      .max(4096)
      .refine((v) => !/[\r\n]/.test(v)),
  )
  .refine(
    (h) =>
      Object.keys(h).length <= 8 &&
      Object.keys(h).every(
        (k) =>
          ![
            "host",
            "origin",
            "cookie",
            "connection",
            "content-length",
            "content-type",
            "accept",
            "proxy-authorization",
            "mcp-protocol-version",
          ].includes(k.toLowerCase()),
      ) &&
      new Set(Object.keys(h).map((k) => k.toLowerCase())).size ===
        Object.keys(h).length,
  );
export type HeadersMap = z.infer<typeof headerSchema>;
interface VaultEntry {
  team: string;
  createdAt: string;
  retiredAt?: string;
  encrypted: Envelope;
}
interface Vault {
  format: 1;
  entries: Record<string, VaultEntry>;
}
interface SecretResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    resourceVersion: string;
  };
  data: Record<string, string>;
}
// Fixed resource, no caller-controlled namespace/name, no Secret enumeration or creation permission.
export class SecretVault {
  private async request(
    method: "GET" | "PUT",
    body?: SecretResource,
  ): Promise<SecretResource> {
    const base = "/var/run/secrets/kubernetes.io/serviceaccount";
    const ca = readFileSync(`${base}/ca.crt`);
    const token = readFileSync(`${base}/token`, "utf8");
    return new Promise((resolve, reject) => {
      const r = https.request(
        {
          hostname: process.env["KUBERNETES_SERVICE_HOST"],
          port: Number(process.env["KUBERNETES_SERVICE_PORT_HTTPS"] ?? 443),
          path: "/api/v1/namespaces/relay-platform/secrets/gateway-upstream-credentials",
          method,
          ca,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          timeout: 2000,
        },
        (res) => {
          let data = "";
          res.on("data", (c) => {
            data += String(c);
            if (data.length > 1048576)
              r.destroy(new Error("Secret resource too large"));
          });
          res.on("end", () => {
            if (res.statusCode === 409)
              return reject(new Rejection("SECRET_CONFLICT", 409));
            if (res.statusCode !== 200)
              return reject(new Rejection("SECRET_STORE_UNAVAILABLE", 503));
            try {
              resolve(JSON.parse(data) as SecretResource);
            } catch {
              reject(new Rejection("SECRET_STORE_UNAVAILABLE", 503));
            }
          });
        },
      );
      r.on("timeout", () => r.destroy(new Error("Secret timeout")));
      r.on("error", () =>
        reject(new Rejection("SECRET_STORE_UNAVAILABLE", 503)),
      );
      r.end(body ? JSON.stringify(body) : undefined);
    });
  }
  private decode(s: SecretResource): Vault {
    const v = JSON.parse(
      Buffer.from(s.data["credentials.json"] ?? "", "base64").toString("utf8"),
    ) as Vault;
    if (v.format !== 1 || !v.entries || typeof v.entries !== "object")
      throw new Rejection("CREDENTIAL_MIGRATION_REQUIRED", 503);
    return v;
  }
  private ring() {
    try {
      return keyring(JSON.parse(secret("credential-keyring")));
    } catch {
      throw new Rejection("CREDENTIAL_KEY_UNAVAILABLE", 503);
    }
  }
  async get(team: string, ref: string) {
    const e = this.decode(await this.request("GET")).entries[ref];
    if (!e || e.team !== team || e.retiredAt)
      throw new Rejection("CREDENTIAL_UNAVAILABLE", 503);
    try {
      return headerSchema.parse(unseal(e.encrypted, team, ref, this.ring()));
    } catch {
      throw new Rejection("CREDENTIAL_UNAVAILABLE", 503);
    }
  }
  async collect(live: ReadonlySet<string>, graceMs = 3600000) {
    for (let n = 0; n < 5; n++) {
      const s = await this.request("GET"),
        v = this.decode(s);
      let removed = 0;
      for (const [ref, e] of Object.entries(v.entries)) {
        const created = Date.parse(e.createdAt);
        if (
          !live.has(ref) &&
          Number.isFinite(created) &&
          Date.now() - created > graceMs
        ) {
          delete v.entries[ref];
          removed++;
        }
      }
      if (!removed) return 0;
      s.data["credentials.json"] = Buffer.from(JSON.stringify(v)).toString(
        "base64",
      );
      try {
        await this.request("PUT", s);
        return removed;
      } catch (e) {
        if (
          !(e instanceof Rejection && e.code === "SECRET_CONFLICT") ||
          n === 4
        )
          throw e;
      }
    }
    return 0;
  }
  async set(team: string, ref: string, headers: HeadersMap | null) {
    for (let n = 0; n < 5; n++) {
      const s = await this.request("GET"),
        v = this.decode(s),
        e = v.entries[ref];
      if (e && e.team !== team) throw new Rejection("CREDENTIAL_SCOPE", 403);
      if (headers) {
        const clean = headerSchema.parse(headers);
        if (e) {
          // References are immutable: a delayed request can never obtain newly rotated headers.
          const old = headerSchema.parse(
            unseal(e.encrypted, team, ref, this.ring()),
          );
          if (e.retiredAt || !equal(JSON.stringify(old), JSON.stringify(clean)))
            throw new Rejection("CREDENTIAL_REFERENCE_IMMUTABLE", 409);
          return;
        }
        v.entries[ref] = {
          team,
          createdAt: new Date().toISOString(),
          encrypted: seal(clean, team, ref, this.ring()),
        };
      } else if (e) {
        delete v.entries[ref];
      } else return;
      const body = JSON.stringify(v);
      if (Buffer.byteLength(body) > 700000)
        throw new Rejection("CREDENTIAL_CAPACITY", 503);
      s.data["credentials.json"] = Buffer.from(body).toString("base64");
      try {
        await this.request("PUT", s);
        return;
      } catch (e) {
        if (
          !(e instanceof Rejection && e.code === "SECRET_CONFLICT") ||
          n === 4
        )
          throw e;
      }
    }
  }
}
