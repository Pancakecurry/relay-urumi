import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
// Local external-client adapter: dial loopback, preserve canonical Host/SNI,
// and explicitly trust only the project CA for HTTPS. HTTP remains for M0 proof.
export const ingressFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const u = new URL(request ? request.url : String(input));
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Local Ingress URL denied");
  const headers = new Headers(init?.headers ?? request?.headers);
  headers.set("host", u.host);
  const body = init?.body;
  if (body && typeof body !== "string" && !(body instanceof URLSearchParams))
    throw new Error("Unsupported test request body");
  const tls = u.protocol === "https:";
  return new Promise((resolve, reject) => {
    const r = (tls ? https : http).request(
      {
        hostname: "127.0.0.1",
        port: Number(u.port || (tls ? 443 : 80)),
        path: u.pathname + u.search,
        method: init?.method ?? request?.method ?? "GET",
        headers: Object.fromEntries(headers),
        ...(tls
          ? {
              servername: u.hostname,
              ca: readFileSync(
                process.env["RELAY_TEST_CA_FILE"] ?? ".local/relay-ca.crt",
              ),
              rejectUnauthorized: true,
              minVersion: "TLSv1.3",
            }
          : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      },
      (res) => {
        const h = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2)
          h.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        resolve(
          new Response(
            [204, 205, 304].includes(res.statusCode ?? 200)
              ? null
              : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
            { status: res.statusCode ?? 500, headers: h },
          ),
        );
      },
    );
    r.on("error", reject);
    r.setTimeout(15000, () =>
      r.destroy(new Error("Ingress response deadline exceeded")),
    );
    r.end(body?.toString());
  });
};
