import pg from "pg";
import type { Store } from "../../db/src/store.js";
import { Rejection } from "./identity.js";
// The pinned provider documents a multi-step family invalidation race. Serialize
// its native token/revoke handlers per public client across API replicas. The
// provider still owns every grant, token, PKCE and revocation operation.
export function oauthProtocolGuard(store: Store) {
  const locks = new pg.Pool({
    ...store.pool.options,
    // pg deliberately stores this option as non-enumerable; object spread omits it.
    password: store.pool.options.password,
    max: 2,
    connectionTimeoutMillis: 2000,
  });
  locks.on("error", () => console.error("OAuth protocol guard unavailable"));
  return {
    close: () => locks.end(),
    async run<T>(client: string, action: () => Promise<T>) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(client))
        throw new Rejection("OAUTH_CLIENT_REQUIRED", 400);
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const c = await locks.connect();
        let acquired = false,
          broken = false;
        try {
          acquired = !!(
            await c.query<{ locked: boolean }>(
              "SELECT pg_try_advisory_lock(1806,hashtext($1)) AS locked",
              [client],
            )
          ).rows[0]?.locked;
          if (acquired) return await action();
        } finally {
          if (acquired)
            try {
              if (
                !(
                  await c.query<{ unlocked: boolean }>(
                    "SELECT pg_advisory_unlock(1806,hashtext($1)) AS unlocked",
                    [client],
                  )
                ).rows[0]?.unlocked
              )
                broken = true;
            } catch {
              broken = true;
            }
          c.release(broken);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Rejection("OAUTH_CLIENT_BUSY", 503);
    },
  };
}
