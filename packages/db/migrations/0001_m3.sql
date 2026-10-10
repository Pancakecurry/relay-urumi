-- Applied by a dedicated migration owner, never a runtime owner/BYPASSRLS role.
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION relay_migrator;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION relay_migrator;
SET ROLE relay_migrator;
CREATE TABLE IF NOT EXISTS auth."user" (id text PRIMARY KEY,name text NOT NULL,email text UNIQUE NOT NULL,"emailVerified" boolean NOT NULL DEFAULT false,image text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth.session (id text PRIMARY KEY,"expiresAt" timestamptz NOT NULL,token text UNIQUE NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL,"ipAddress" text,"userAgent" text,"userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth.session("userId");
CREATE TABLE IF NOT EXISTS auth.account (id text PRIMARY KEY,"accountId" text NOT NULL,"providerId" text NOT NULL,"userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,"accessToken" text,"refreshToken" text,"idToken" text,"accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,scope text,password text,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth.verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL,"updatedAt" timestamptz NOT NULL);
GRANT USAGE ON SCHEMA auth TO relay_auth;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA auth TO relay_auth;
CREATE TABLE IF NOT EXISTS app.teams (id uuid PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.memberships (team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL REFERENCES auth."user"(id),role text NOT NULL CHECK(role IN ('admin','member')),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(team_id,user_id));
CREATE TABLE IF NOT EXISTS app.invitations (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),email text NOT NULL,role text NOT NULL CHECK(role IN ('admin','member')),token_hash text NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz,revoked_at timestamptz,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.api_keys (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL REFERENCES auth."user"(id),name text NOT NULL,key_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,last_used_at timestamptz);
CREATE TABLE IF NOT EXISTS app.upstreams (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),name text NOT NULL,url text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted_at timestamptz,credential_ref uuid,revision integer NOT NULL DEFAULT 1,timeout_ms integer NOT NULL DEFAULT 10000 CHECK(timeout_ms BETWEEN 100 AND 10000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(team_id,name));
CREATE TABLE IF NOT EXISTS app.tool_catalog_versions (upstream_id uuid PRIMARY KEY REFERENCES app.upstreams(id),team_id uuid NOT NULL REFERENCES app.teams(id),revision integer NOT NULL,tools jsonb NOT NULL DEFAULT '[]',state text NOT NULL CHECK(state IN ('Connected','Unreachable')),reason text,checked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.permission_rules (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),subject text NOT NULL,upstream_id uuid REFERENCES app.upstreams(id),tool_name text,effect text NOT NULL CHECK(effect IN ('allow','deny')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.audit_calls (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),user_id text,key_id uuid,auth_kind text NOT NULL,upstream_id uuid,tool_name text,alias text,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,duration_ms integer,status text NOT NULL CHECK(status IN ('started','success','failed','rejected','unknown')),code text,argument_hash text);
CREATE INDEX IF NOT EXISTS audit_team_time ON app.audit_calls(team_id,started_at DESC,id);
CREATE TABLE IF NOT EXISTS app.security_events (id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),code text NOT NULL,method text NOT NULL);
CREATE TABLE IF NOT EXISTS app.management_events (id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL,action text NOT NULL,target text,created_at timestamptz NOT NULL DEFAULT now());
-- Only this narrow function reveals existence of a currently live session, not its bearer token.
CREATE OR REPLACE FUNCTION app.session_valid(uid text,sid text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM auth.session s JOIN auth."user" u ON u.id=s."userId" WHERE s.id=sid AND s."userId"=uid AND s."expiresAt">now()) $$;
REVOKE ALL ON FUNCTION app.session_valid(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.session_valid(text,text) TO relay_app;
CREATE OR REPLACE FUNCTION app.identity_exists(uid text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM auth."user" WHERE id=uid) $$;
REVOKE ALL ON FUNCTION app.identity_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.identity_exists(text) TO relay_app;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['teams','memberships','invitations','api_keys','upstreams','tool_catalog_versions','permission_rules','audit_calls','management_events'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='tenant') THEN
   EXECUTE format('CREATE POLICY tenant ON app.%I FOR ALL TO relay_app USING (%I::text = current_setting(''relay.team_id'',true)) WITH CHECK (%I::text = current_setting(''relay.team_id'',true))',t,CASE WHEN t='teams' THEN 'id' ELSE 'team_id' END,CASE WHEN t='teams' THEN 'id' ELSE 'team_id' END);
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA app TO relay_app;
GRANT SELECT,INSERT,UPDATE ON app.teams,app.memberships,app.invitations,app.api_keys,app.upstreams,app.tool_catalog_versions,app.permission_rules TO relay_app;
GRANT DELETE ON app.permission_rules TO relay_app;
GRANT SELECT,INSERT,UPDATE ON app.audit_calls TO relay_app;
GRANT SELECT,INSERT ON app.management_events TO relay_app;
GRANT INSERT ON app.security_events TO relay_app;
CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON app.schema_migrations TO relay_app;
INSERT INTO app.schema_migrations(version) VALUES('0001_m3') ON CONFLICT DO NOTHING;
RESET ROLE;
SET ROLE relay_migrator;
ALTER TABLE app.invitations ADD COLUMN IF NOT EXISTS accepted_by text;
CREATE OR REPLACE FUNCTION app.my_teams(uid text) RETURNS TABLE(id uuid,name text,role text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT t.id,t.name,m.role FROM app.teams t JOIN app.memberships m ON m.team_id=t.id WHERE m.user_id=uid AND m.active $$;
REVOKE ALL ON FUNCTION app.my_teams(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_teams(text) TO relay_app;
RESET ROLE;
