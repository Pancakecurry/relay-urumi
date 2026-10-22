SET ROLE relay_migrator;
-- Reachability only, never credential values or cross-team configuration.
-- Pending managed-store registrations retain their fixed references through retries.
CREATE OR REPLACE FUNCTION app.live_credential_refs() RETURNS TABLE(ref uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT credential_ref FROM app.upstreams WHERE deleted_at IS NULL AND credential_ref IS NOT NULL
 UNION SELECT id FROM app.stores WHERE desired='present' AND status<>'Deleted'
$$;
REVOKE ALL ON FUNCTION app.live_credential_refs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.live_credential_refs() TO relay_app;
INSERT INTO app.schema_migrations(version) VALUES('0005_m6_credentials') ON CONFLICT DO NOTHING;
RESET ROLE;
