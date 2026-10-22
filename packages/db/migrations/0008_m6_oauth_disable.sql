-- Pinned provider1.7.7 silently strips disabled from its admin update schema.
-- Change only its declared native field through a current-team/admin capability.
SET ROLE relay_migrator;
CREATE OR REPLACE FUNCTION app.set_oauth_client_disabled(p_team uuid,p_user text,p_client text,p_disabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE affected integer;
BEGIN
 IF p_team::text IS DISTINCT FROM current_setting('relay.team_id',true) OR NOT EXISTS(
  SELECT 1 FROM app.memberships WHERE team_id=p_team AND user_id=p_user AND active AND role='admin'
 ) THEN RAISE EXCEPTION 'OAUTH_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE auth."oauthClient" SET disabled=p_disabled,"updatedAt"=now()
 WHERE "clientId"=p_client AND (CASE jsonb_typeof(metadata) WHEN 'string' THEN (metadata#>>'{}')::jsonb ELSE metadata END)->>'relay_team'=p_team::text;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION app.set_oauth_client_disabled(uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_oauth_client_disabled(uuid,text,text,boolean) TO relay_app;
INSERT INTO app.schema_migrations(version) VALUES('0008_m6_oauth_disable') ON CONFLICT DO NOTHING;
RESET ROLE;
