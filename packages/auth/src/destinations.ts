import { Resolver } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { Readable, Transform } from "node:stream";
import { Rejection } from "./identity.js";
import { serviceTls } from "./transport.js";
const serviceName =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(relay-upstreams|relay-store-m1|relay-store-[a-f0-9]{32})\.svc\.cluster\.local$/;
export function internalDestination(u: URL) {
  return serviceName.test(u.hostname) && u.port === "3000";
}
export function destination(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Rejection("DESTINATION_DENIED", 400);
  }
  const internal = internalDestination(u);
  const approved = (process.env["ALLOWED_UPSTREAM_URLS"] ?? "")
    .split(",")
    .filter(Boolean);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/mcp" ||
    !["http:", "https:"].includes(u.protocol) ||
    (!internal && (u.protocol !== "https:" || !approved.includes(u.href))) ||
    (internal &&
      process.env["REQUIRE_UPSTREAM_TLS"] === "true" &&
      u.protocol !== "https:")
  )
    throw new Rejection("DESTINATION_DENIED", 400);
  return u;
}
const special4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  special4.addSubnet(address, prefix, "ipv4");
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
const special6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  special6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(ip: string) {
  const family = isIP(ip);
  if (family === 4) return !special4.check(ip, "ipv4");
  return (
    family === 6 && global6.check(ip, "ipv6") && !special6.check(ip, "ipv6")
  );
}
let resolving = 0;
// Resolver owns cancellable c-ares queries, avoiding unbounded OS lookup work.
// The optional resolver is a focused-test seam; production always uses its own.
export async function resolveAddresses(
  host: string,
  signal?: AbortSignal,
  resolver = new Resolver({ timeout: 500, tries: 1 }),
) {
  if (resolving >= 16) throw new Rejection("DESTINATION_DNS_BUSY", 503);
  signal?.throwIfAborted();
  resolving++;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => resolver.cancel();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const queries = Promise.allSettled([
      resolver.resolve4(host),
      resolver.resolve6(host),
    ]);
    const values = await Promise.race([
      queries,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          resolver.cancel();
          reject(new Rejection("DESTINATION_DNS_TIMEOUT", 502));
        }, 1200);
      }),
    ]);
    signal?.throwIfAborted();
    const answers: { address: string; family: 4 | 6 }[] = [];
    for (const [index, result] of values.entries()) {
      if (result.status === "fulfilled")
        for (const address of result.value)
          answers.push({ address, family: index === 0 ? 4 : 6 });
      else if (
        !["ENODATA", "ENOTFOUND"].includes(
          (result.reason as NodeJS.ErrnoException)?.code ?? "",
        )
      )
        throw new Rejection("DESTINATION_DNS_UNAVAILABLE", 502);
    }
    if (!answers.length || answers.length > 32)
      throw new Rejection("DESTINATION_DNS_ANSWERS_DENIED", 502);
    return answers;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    resolver.cancel();
    resolving--;
  }
}
export function validateAddresses(
  answers: { address: string; family: 4 | 6 }[],
  internal: boolean,
) {
  const serviceRange = new BlockList();
  const cidr = process.env["UPSTREAM_SERVICE_CIDR"] ?? "10.43.0.0/16";
  const match = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(cidr);
  if (!match || isIP(match[1]!) !== 4 || Number(match[2]) > 32)
    throw new Error("INVALID_SERVICE_CIDR");
  serviceRange.addSubnet(match[1]!, Number(match[2]), "ipv4");
  if (
    !answers.length ||
    answers.length > 32 ||
    answers.some(
      (a) =>
        isIP(a.address) !== a.family ||
        (internal
          ? a.family !== 4 || !serviceRange.check(a.address, "ipv4")
          : !isPublicAddress(a.address)),
    )
  )
    throw new Rejection("DESTINATION_ADDRESS_DENIED", 400);
}
// Resolve once, validate EVERY answer, then dial a literal validated address.
// TLS retains the original hostname/SNI. Redirects never receive credentials.
export async function boundedFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const u = destination(input instanceof Request ? input.url : String(input));
  const signal = AbortSignal.any([
    AbortSignal.timeout(10000),
    ...(init?.signal ? [init.signal] : []),
  ]);
  const answers = await resolveAddresses(u.hostname, signal),
    internal = internalDestination(u);
  validateAddresses(answers, internal);
  const headers = new Headers(init?.headers);
  headers.set("host", u.host);
  const body = init?.body;
  if (body && typeof body !== "string")
    throw new Rejection("UNSUPPORTED_REQUEST_BODY", 400);
  const tls = u.protocol === "https:" && internal ? serviceTls() : undefined;
  if (u.protocol === "https:" && internal && !tls)
    throw new Rejection("UPSTREAM_TLS_IDENTITY_UNAVAILABLE", 503);
  return new Promise((resolve, reject) => {
    const r = (u.protocol === "https:" ? https : http).request(
      {
        hostname: answers[0]!.address,
        servername: u.hostname,
        port: Number(u.port || (u.protocol === "https:" ? 443 : 80)),
        path: u.pathname,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(headers),
        signal,
        agent: false,
        ...(u.protocol === "https:"
          ? {
              rejectUnauthorized: true,
              minVersion: "TLSv1.3",
              ...(tls ? { ca: tls.ca, cert: tls.cert, key: tls.key } : {}),
            }
          : {}),
      },
      (res) => {
        const status = res.statusCode ?? 502;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new Rejection("UPSTREAM_REDIRECT_DENIED", 502));
          return;
        }
        const h = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2)
          h.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        let bytes = 0;
        const frames: Buffer[] = [];
        const contentType = res.headers["content-type"] ?? "";
        const checkFrame = (text: string) => {
          JSON.parse(text, (key, value: unknown) => {
            if (["__proto__", "constructor", "prototype"].includes(key))
              throw new Rejection("UPSTREAM_UNSAFE_JSON_KEY", 502);
            return value;
          });
        };
        let eventBuffer = "";
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            bytes += chunk.length;
            if (bytes > 1048576) {
              done(new Error("UPSTREAM_OUTPUT_LIMIT"));
              return;
            }
            try {
              if (contentType.includes("application/json")) frames.push(chunk);
              else if (contentType.includes("text/event-stream")) {
                eventBuffer += decoder.decode(chunk, { stream: true });
                let match: RegExpExecArray | null;
                while ((match = /\r?\n\r?\n/.exec(eventBuffer))) {
                  const frame = eventBuffer.slice(
                    0,
                    match.index + match[0].length,
                  );
                  eventBuffer = eventBuffer.slice(frame.length);
                  const data = frame
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).replace(/^ /, ""))
                    .join("\n");
                  if (data) checkFrame(data);
                  this.push(frame);
                }
              } else this.push(chunk);
              done();
            } catch (e) {
              done(e as Error);
            }
          },
          flush(done) {
            try {
              if (contentType.includes("application/json")) {
                const bytes = Buffer.concat(frames);
                checkFrame(
                  new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                );
                this.push(bytes);
              } else if (
                contentType.includes("text/event-stream") &&
                (eventBuffer + decoder.decode()).trim()
              ) {
                throw new Rejection("UPSTREAM_INCOMPLETE_EVENT", 502);
              }
              done();
            } catch (e) {
              done(e as Error);
            }
          },
        });
        limiter.on("error", () => r.destroy());
        res.on("error", (e) => limiter.destroy(e));
        // A cancelled Web stream must close the source socket as well.
        limiter.on("close", () => {
          if (!res.complete) r.destroy();
        });
        if ([204, 205, 304].includes(status)) {
          res.resume();
          resolve(new Response(null, { status, headers: h }));
          return;
        }
        res.pipe(limiter);
        resolve(
          new Response(Readable.toWeb(limiter) as ReadableStream<Uint8Array>, {
            status,
            headers: h,
          }),
        );
      },
    );
    r.on("error", reject);
    r.end(body ?? undefined);
  });
}
