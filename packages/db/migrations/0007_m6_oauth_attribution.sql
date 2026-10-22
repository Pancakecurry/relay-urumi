SET ROLE relay_migrator;
CREATE TABLE IF NOT EXISTS app.oauth_token_subjects (
 token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'),team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL,client_id text NOT NULL,session_id text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.oauth_token_subjects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='app' AND tablename='oauth_token_subjects' AND policyname='tenant') THEN
 CREATE POLICY tenant ON app.oauth_token_subjects FOR ALL TO relay_app USING(team_id::text=current_setting('relay.team_id',true)) WITH CHECK(team_id::text=current_setting('relay.team_id',true));
END IF; END $$;
GRANT SELECT,INSERT ON app.oauth_token_subjects TO relay_app;
-- A hash of a previously verified high-entropy token supports rejection attribution
-- after provider revocation deletes the token row. This is never an authorization grant.
CREATE OR REPLACE FUNCTION app.oauth_actor(h text) RETURNS TABLE(team_id uuid,user_id text,client_id text,session_id text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT team_id,user_id,client_id,session_id FROM app.oauth_token_subjects WHERE token_hash=h $$;
REVOKE ALL ON FUNCTION app.oauth_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.oauth_actor(text) TO relay_app;
ALTER TABLE app.audit_calls ADD COLUMN IF NOT EXISTS oauth_client_id text;
INSERT INTO app.schema_migrations(version) VALUES('0007_m6_oauth_attribution') ON CONFLICT DO NOTHING;
RESET ROLE;
