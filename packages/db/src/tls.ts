import { readFileSync, realpathSync } from "node:fs";
import { createPrivateKey, X509Certificate } from "node:crypto";
import type { ConnectionOptions } from "node:tls";
// SCRAM plus clientcert=verify-full binds each SQL role to its dedicated
// certificate CN. Redis retains the calling service's separate TLS identity.
export function dataTls(
  host: string,
  role?: "app" | "auth" | "migrator" | "provisioner" | "postgres",
): ConnectionOptions | undefined {
  if (process.env["RELAY_DATA_TLS"] !== "true") return;
  if (
    !/^relay-(postgres|redis)(\.relay-platform\.svc\.cluster\.local)?$/.test(
      host,
    )
  )
    throw new Error("DATA_TLS_SERVICE_DENIED");
  const database = host.startsWith("relay-postgres");
  if (database && !role) throw new Error("DATA_TLS_DATABASE_ROLE_REQUIRED");
  const directory = database
    ? `/run/db-tls/${role}`
    : process.env["RELAY_TLS_DIR"];
  if (!directory) throw new Error("DATA_TLS_IDENTITY_REQUIRED");
  const generation = realpathSync(directory + "/..data");
  const cert = readFileSync(generation + "/tls.crt"),
    key = readFileSync(generation + "/tls.key");
  if (!new X509Certificate(cert).checkPrivateKey(createPrivateKey(key)))
    throw new Error("DATA_TLS_KEY_PAIR_MISMATCH");
  return {
    cert,
    key,
    ca: readFileSync(generation + "/ca.crt"),
    servername: host,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
  };
}
