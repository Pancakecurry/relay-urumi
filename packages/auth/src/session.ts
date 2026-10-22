import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../db/src/schema.js";
import { oauthConfiguration } from "./oauth.js";
import type { Store } from "../../db/src/store.js";
import { pool, secret } from "../../db/src/store.js";
export function sessionAuth(store: Store) {
  const p = pool("auth");
  const origin = process.env["PUBLIC_ORIGIN"] ?? "http://relay.localhost:18080";
  const oauth = oauthConfiguration(store, origin);
  if (process.env["OAUTH_ENABLED"] === "true" && !origin.startsWith("https://"))
    throw new Error("OAuth requires a canonical HTTPS origin");
  return {
    pool: p,
    auth: betterAuth({
      plugins:
        process.env["OAUTH_ENABLED"] === "true" ? [...oauth.plugins] : [],
      disabledPaths: ["/token"],
      database: drizzleAdapter(drizzle(p, { schema }), {
        provider: "pg",
        schema,
      }),
      secret: secret("auth-signing"),
      baseURL: origin,
      basePath: "/api/auth",
      trustedOrigins: [origin],
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      session: {
        cookieCache: { enabled: false },
        expiresIn: 86400,
        updateAge: 3600,
      },
      advanced: {
        disableOriginCheck: false,
        disableCSRFCheck: false,
        useSecureCookies: origin.startsWith("https://"),
      },
      logger: { disabled: true },
    }),
  };
}
