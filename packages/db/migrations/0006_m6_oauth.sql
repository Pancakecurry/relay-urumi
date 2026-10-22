-- Provider-owned schema from pinned1.7.7; no runtime app role can read token hashes.
SET ROLE relay_migrator;
CREATE TABLE IF NOT EXISTS auth."oauthClient" (
 id text PRIMARY KEY,
 "clientId" text NOT NULL UNIQUE,
 "clientSecret" text,
 "clientDiscoveryId" text,
 "disabled" boolean,
 "skipConsent" boolean,
 "enableEndSession" boolean,
 "subjectType" text,
 "scopes" text[],
 "clientCredentialsScopes" text[],
 "userId" text REFERENCES auth."user"("id"),
 "createdAt" timestamptz,
 "updatedAt" timestamptz,
 "name" text,
 "uri" text,
 "icon" text,
 "contacts" text[],
 "tos" text,
 "policy" text,
 "softwareId" text,
 "softwareVersion" text,
 "softwareStatement" text,
 "redirectUris" text[] NOT NULL,
 "postLogoutRedirectUris" text[],
 "backchannelLogoutUri" text,
 "backchannelLogoutSessionRequired" boolean,
 "tokenEndpointAuthMethod" text,
 "applicationType" text,
 "jwks" text,
 "jwksUri" text,
 "grantTypes" text[],
 "responseTypes" text[],
 "requirePKCE" boolean,
 "dpopBoundAccessTokens" boolean,
 "referenceId" text,
 "metadata" jsonb
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx" ON auth."oauthClient"("userId");
CREATE TABLE IF NOT EXISTS auth."oauthResource" (
 id text PRIMARY KEY,
 "identifier" text NOT NULL UNIQUE,
 "name" text NOT NULL,
 "accessTokenTtl" integer,
 "refreshTokenTtl" integer,
 "signingAlgorithm" text,
 "signingKeyId" text,
 "allowedScopes" text[],
 "customClaims" jsonb,
 "dpopBoundAccessTokensRequired" boolean,
 "disabled" boolean,
 "createdAt" timestamptz,
 "updatedAt" timestamptz,
 "policyVersion" integer,
 "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS auth."oauthClientResource" (
 id text PRIMARY KEY,
 "clientId" text NOT NULL REFERENCES auth."oauthClient"("clientId") ON DELETE CASCADE,
 "resourceId" text NOT NULL REFERENCES auth."oauthResource"("identifier") ON DELETE CASCADE,
 "metadata" jsonb,
 "createdAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx" ON auth."oauthClientResource"("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx" ON auth."oauthClientResource"("resourceId");
CREATE TABLE IF NOT EXISTS auth."oauthRefreshToken" (
 id text PRIMARY KEY,
 "token" text NOT NULL UNIQUE,
 "clientId" text NOT NULL REFERENCES auth."oauthClient"("clientId"),
 "sessionId" text REFERENCES auth."session"("id") ON DELETE SET NULL,
 "userId" text NOT NULL REFERENCES auth."user"("id"),
 "referenceId" text,
 "authorizationCodeId" text,
 "resources" text[],
 "requestedUserInfoClaims" text[],
 "expiresAt" timestamptz,
 "createdAt" timestamptz,
 "revoked" timestamptz,
 "rotatedAt" timestamptz,
 "rotationReplayResponse" text,
 "rotationReplayExpiresAt" timestamptz,
 "authTime" timestamptz,
 "confirmation" jsonb,
 "scopes" text[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx" ON auth."oauthRefreshToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx" ON auth."oauthRefreshToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx" ON auth."oauthRefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx" ON auth."oauthRefreshToken"("authorizationCodeId");
CREATE TABLE IF NOT EXISTS auth."oauthAccessToken" (
 id text PRIMARY KEY,
 "token" text UNIQUE,
 "clientId" text NOT NULL REFERENCES auth."oauthClient"("clientId"),
 "sessionId" text REFERENCES auth."session"("id") ON DELETE SET NULL,
 "userId" text REFERENCES auth."user"("id"),
 "referenceId" text,
 "authorizationCodeId" text,
 "resources" text[],
 "requestedUserInfoClaims" text[],
 "refreshId" text REFERENCES auth."oauthRefreshToken"("id"),
 "expiresAt" timestamptz,
 "createdAt" timestamptz,
 "revoked" timestamptz,
 "confirmation" jsonb,
 "scopes" text[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx" ON auth."oauthAccessToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx" ON auth."oauthAccessToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx" ON auth."oauthAccessToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx" ON auth."oauthAccessToken"("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx" ON auth."oauthAccessToken"("refreshId");
CREATE TABLE IF NOT EXISTS auth."oauthConsent" (
 id text PRIMARY KEY,
 "clientId" text NOT NULL REFERENCES auth."oauthClient"("clientId"),
 "userId" text REFERENCES auth."user"("id"),
 "referenceId" text,
 "resources" text[],
 "requestedUserInfoClaims" text[],
 "scopes" text[] NOT NULL,
 "createdAt" timestamptz,
 "updatedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx" ON auth."oauthConsent"("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx" ON auth."oauthConsent"("userId");
CREATE TABLE IF NOT EXISTS auth."oauthClientAssertion" (
 id text PRIMARY KEY,
 "expiresAt" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_client_resource_pair ON auth."oauthClientResource"("clientId","resourceId");
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA auth TO relay_auth;
INSERT INTO app.schema_migrations(version) VALUES('0006_m6_oauth') ON CONFLICT DO NOTHING;
RESET ROLE;
