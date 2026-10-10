SET ROLE relay_migrator;
-- Retain historical IDs/audits while allowing a removed display name to be reused.
ALTER TABLE app.upstreams DROP CONSTRAINT IF EXISTS upstreams_team_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS upstreams_active_name ON app.upstreams(team_id,name) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS app.chat_runs(id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL,prompt text NOT NULL,status text NOT NULL DEFAULT 'running',answer text,error_code text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE TABLE IF NOT EXISTS app.chat_events(id uuid PRIMARY KEY,team_id uuid NOT NULL,run_id uuid NOT NULL REFERENCES app.chat_runs(id),user_id text NOT NULL,kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['chat_runs','chat_events'] LOOP
EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='tenant') THEN EXECUTE format('CREATE POLICY tenant ON app.%I TO relay_app USING(team_id::text=current_setting(''relay.team_id'',true)) WITH CHECK(team_id::text=current_setting(''relay.team_id'',true))',t); END IF;
END LOOP; END $$;
GRANT SELECT,INSERT,UPDATE ON app.chat_runs,app.chat_events TO relay_app;
CREATE TABLE IF NOT EXISTS app.model_reservations(id uuid PRIMARY KEY,run_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),reserved_paise integer NOT NULL DEFAULT 500,usage jsonb);
ALTER TABLE app.model_reservations ALTER COLUMN reserved_paise SET DEFAULT 500;
REVOKE ALL ON app.model_reservations FROM relay_app;
-- A global, irreversible reservation. No team can reset the allowance or claim another team's usage.
CREATE OR REPLACE FUNCTION app.reserve_model(r uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n uuid; used bigint; BEGIN
PERFORM pg_advisory_xact_lock(74404);
SELECT COALESCE(sum(reserved_paise),0) INTO used FROM app.model_reservations;
IF used+500>9900 THEN RAISE EXCEPTION 'MODEL_BUDGET_EXHAUSTED'; END IF;
n:=gen_random_uuid();INSERT INTO app.model_reservations(id,run_id,reserved_paise) VALUES(n,r,500); RETURN n;
END $$;
CREATE OR REPLACE FUNCTION app.model_budget() RETURNS TABLE(reserved_paise bigint,remaining_paise bigint) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT COALESCE(sum(reserved_paise),0),9900-COALESCE(sum(reserved_paise),0) FROM app.model_reservations $$;
CREATE OR REPLACE FUNCTION app.model_usage(r uuid,u jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ UPDATE app.model_reservations SET usage=u WHERE id=r AND usage IS NULL $$;
REVOKE ALL ON FUNCTION app.reserve_model(uuid),app.model_budget(),app.model_usage(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_model(uuid),app.model_budget(),app.model_usage(uuid,jsonb) TO relay_app;
CREATE OR REPLACE FUNCTION app.member_directory() RETURNS TABLE(user_id text,name text,email text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT m.user_id,u.name,u.email FROM app.memberships m JOIN auth."user" u ON u.id=m.user_id WHERE m.team_id::text=current_setting('relay.team_id',true) $$;
REVOKE ALL ON FUNCTION app.member_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.member_directory() TO relay_app;
INSERT INTO app.schema_migrations(version) VALUES('0002_m4') ON CONFLICT DO NOTHING;
RESET ROLE;
