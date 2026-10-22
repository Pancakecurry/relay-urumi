import https from "node:https";
import { readFileSync } from "node:fs";
export type Resource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    deletionTimestamp?: string;
  };
  [key: string]: unknown;
};
export class Fault extends Error {
  constructor(
    readonly code: string,
    readonly retryable = true,
  ) {
    super(code);
  }
}
const root = "/var/run/secrets/kubernetes.io/serviceaccount";
export async function kube(
  method: string,
  path: string,
  body?: unknown,
): Promise<Resource> {
  const ca = readFileSync(`${root}/ca.crt`);
  const token = readFileSync(`${root}/token`, "utf8").trim();
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: process.env["KUBERNETES_SERVICE_HOST"],
        port: Number(process.env["KUBERNETES_SERVICE_PORT_HTTPS"] ?? 443),
        path,
        method,
        ca,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        timeout: 5000,
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += String(chunk);
          if (text.length > 4 * 1048576) r.destroy();
        });
        res.on("end", () => {
          if (res.statusCode === 404) return reject(new Fault("NOT_FOUND"));
          if ((res.statusCode ?? 500) >= 300)
            return reject(
              new Fault(
                res.statusCode === 409
                  ? "RESOURCE_CONFLICT"
                  : res.statusCode === 403
                    ? "KUBERNETES_FORBIDDEN"
                    : "KUBERNETES_UNAVAILABLE",
              ),
            );
          try {
            resolve(JSON.parse(text) as Resource);
          } catch {
            reject(new Fault("KUBERNETES_INVALID_RESPONSE"));
          }
        });
      },
    );
    r.on("timeout", () => r.destroy());
    r.on("error", () => reject(new Fault("KUBERNETES_UNAVAILABLE")));
    r.end(body ? JSON.stringify(body) : undefined);
  });
}
export function owned(resource: Resource, id: string) {
  if (resource.metadata.labels?.["relay.store/id"] !== id)
    throw new Fault("OWNERSHIP_CONFLICT", false);
}
export async function ensure(
  path: string,
  body: Resource,
  id: string,
  reconcile = false,
) {
  try {
    const r = await kube("GET", `${path}/${body.metadata.name}`);
    owned(r, id);
    if (
      reconcile &&
      JSON.stringify(r["spec"]) !== JSON.stringify(body["spec"])
    ) {
      // CAS replacement only for explicitly reconciled owned policy resources.
      if (!/(resourcequotas|limitranges|networkpolicies)$/.test(path))
        throw new Fault("RECONCILE_KIND_DENIED", false);
      return kube("PUT", `${path}/${body.metadata.name}`, {
        ...body,
        metadata: {
          ...r.metadata,
          ...body.metadata,
          resourceVersion: r.metadata.resourceVersion!,
        },
      });
    }
    return r;
  } catch (e) {
    if (!(e instanceof Fault && e.code === "NOT_FOUND")) throw e;
    try {
      return await kube("POST", path, body);
    } catch (e) {
      if (!(e instanceof Fault && e.code === "RESOURCE_CONFLICT")) throw e;
      const r = await kube("GET", `${path}/${body.metadata.name}`);
      owned(r, id);
      return r;
    }
  }
}
export async function absent(path: string) {
  try {
    await kube("GET", path);
    return false;
  } catch (e) {
    if (e instanceof Fault && e.code === "NOT_FOUND") return true;
    throw e;
  }
}
