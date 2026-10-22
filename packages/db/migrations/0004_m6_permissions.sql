SET ROLE relay_migrator;
ALTER TABLE app.teams ADD COLUMN IF NOT EXISTS default_tool_effect text NOT NULL DEFAULT 'allow' CHECK(default_tool_effect IN ('allow','deny'));
ALTER TABLE app.teams ADD COLUMN IF NOT EXISTS permission_revision integer NOT NULL DEFAULT 1 CHECK(permission_revision>0);
INSERT INTO app.schema_migrations(version) VALUES('0004_m6_permissions') ON CONFLICT DO NOTHING;
RESET ROLE;
