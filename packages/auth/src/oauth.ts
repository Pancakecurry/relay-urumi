import { AsyncLocalStorage } from "node:async_hooks";
import { admin, type Identity } from "./identity.js";
import {
  oauthProvider,
  getOAuthProviderApi,
  type OAuthOptions,
} from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod/v4";
import { Rejection, uuid, member } from "./identity.js";
import type { Store } from "../../db/src/store.js";
// A request-scoped server capability, not a mutable active-team field on a session.
const administrativeScope = new AsyncLocalStorage<{
  team: string;
  user: string;
}>();
export function withOAuthAdmin<T>(i: Identity, action: () => Promise<T>) {
  admin(i);
  if (i.kind !== "session" || !i.session)
    throw new Rejection("SESSION_REQUIRED", 401);
  return administrativeScope.run({ team: i.team, user: i.user }, action);
}
export function oauthConfiguration(store: Store, origin: string) {
  const resource = origin + "/mcp";
  const options: OAuthOptions<string[]> = {
    loginPage: "/oauth/login",
    consentPage: "/oauth/consent",
    disableJwtPlugin: true,
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    clientPrivileges: ({ headers, user, action }) => {
      const c = administrativeScope.getStore();
      return (
        !!c &&
        c.user === user?.id &&
        headers.get("x-relay-team") === c.team &&
        ["create", "update"].includes(action)
      );
    },
    clientReference: ({ user }) => {
      const c = administrativeScope.getStore();
      return c?.user === user?.id ? c?.team : undefined;
    },
    resourcePrivileges: () => false,
    enforcePerClientResources: true,
    clientRegistrationDefaultResources: [resource],
    scopes: ["mcp:tools", "offline_access"],
    grantTypes: ["authorization_code", "refresh_token"],
    accessTokenExpiresIn: 300,
    refreshTokenExpiresIn: 86400,
    resources: [
      {
        identifier: resource,
        name: "Relay MCP gateway",
        allowedScopes: ["mcp:tools", "offline_access"],
        accessTokenTtl: 300,
        refreshTokenTtl: 86400,
      },
    ],
    storeTokens: "hashed",
    prefix: { opaqueAccessToken: "roa_", refreshToken: "ror_" },
    customAccessTokenClaims: async ({ user, metadata, resources, scopes }) => {
      const team = uuid.safeParse(metadata?.["relay_team"]);
      if (
        !user ||
        !team.success ||
        resources?.length !== 1 ||
        resources[0] !== resource ||
        !scopes.includes("mcp:tools")
      )
        throw new Rejection("OAUTH_GRANT_DENIED", 403);
      await store.tenant(team.data, (tx) =>
        member(tx, user.id, team.data, "oauth"),
      );
      return { relay_team: team.data };
    },
  };
  const native = oauthProvider(options);
  // 1.7.7 generated OpenAPI optional-undefined declarations conflict with exactOptionalPropertyTypes.
  // This boundary preserves all native endpoints and runtime metadata; it changes no protocol behavior.
  type Endpoints = typeof native.endpoints;
  type Endpoint = NonNullable<BetterAuthPlugin["endpoints"]>[string];
  const plugin = native as Omit<typeof native, "endpoints"> &
    Omit<BetterAuthPlugin, "endpoints"> & {
      endpoints: { [K in keyof Endpoints]: Endpoints[K] & Endpoint };
    };
  const verification = {
    id: "relay-oauth-verification" as const,
    endpoints: {
      relayValidateOAuthToken: createAuthEndpoint(
        "/relay/oauth/validate",
        {
          method: "POST",
          body: z.strictObject({ token: z.string().min(20).max(4096) }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          return getOAuthProviderApi(
            ctx as unknown as Parameters<typeof getOAuthProviderApi>[0],
            options,
          ).requireActiveAccessToken(ctx.body.token);
        },
      ),
    },
  };
  return { plugins: [plugin, verification] as const, resource, options };
}
