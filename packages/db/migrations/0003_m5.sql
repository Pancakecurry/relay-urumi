SET ROLE relay_migrator;
CREATE TABLE IF NOT EXISTS app.stores(
 id uuid PRIMARY KEY,team_id uuid NOT NULL REFERENCES app.teams(id),user_id text NOT NULL,
 name text NOT NULL,namespace text NOT NULL UNIQUE,release text NOT NULL,host text NOT NULL UNIQUE,url text NOT NULL,
 desired text NOT NULL CHECK(desired IN ('present','absent')),status text NOT NULL CHECK(status IN ('Provisioning','Ready','Failed','Deleting','Deleted','RecoveryRequired')),
 phase text NOT NULL DEFAULT 'Requested',generation integer NOT NULL DEFAULT 1,attempt integer NOT NULL DEFAULT 0,
 deadline timestamptz NOT NULL,lease_until timestamptz,lease_owner uuid,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 error_code text,config jsonb NOT NULL DEFAULT '{}',resources jsonb NOT NULL DEFAULT '{}',upstream_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
CREATE TABLE IF NOT EXISTS app.operations(id uuid PRIMARY KEY,team_id uuid NOT NULL,store_id uuid NOT NULL REFERENCES app.stores(id),user_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('create','retry','delete','reconcile')),idempotency_id uuid NOT NULL,generation integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(team_id,user_id,idempotency_id));
ALTER TABLE app.operations DROP CONSTRAINT IF EXISTS operations_kind_check;
ALTER TABLE app.operations ADD CONSTRAINT operations_kind_check CHECK(kind IN ('create','retry','delete','reconcile'));
CREATE TABLE IF NOT EXISTS app.outbox_events(id uuid PRIMARY KEY,team_id uuid NOT NULL,store_id uuid NOT NULL REFERENCES app.stores(id),generation integer NOT NULL,dispatched_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.store_events(id uuid PRIMARY KEY,team_id uuid NOT NULL,store_id uuid NOT NULL REFERENCES app.stores(id),generation integer NOT NULL,phase text NOT NULL,code text,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['stores','operations','outbox_events','store_events'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='tenant') THEN EXECUTE format('CREATE POLICY tenant ON app.%I TO relay_app USING(team_id::text=current_setting(''relay.team_id'',true)) WITH CHECK(team_id::text=current_setting(''relay.team_id'',true))',t); END IF;
 IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='controller') THEN EXECUTE format('CREATE POLICY controller ON app.%I TO relay_provisioner USING(true) WITH CHECK(true)',t); END IF;
END LOOP; END $$;
GRANT SELECT ON app.stores,app.operations,app.outbox_events,app.store_events TO relay_app;
GRANT USAGE ON SCHEMA app TO relay_provisioner;
GRANT SELECT ON app.stores TO relay_provisioner;
GRANT UPDATE(status,phase,attempt,lease_until,lease_owner,next_attempt_at,error_code,config,resources,upstream_id,updated_at,deleted_at) ON app.stores TO relay_provisioner;
GRANT SELECT,INSERT,UPDATE ON app.outbox_events,app.store_events TO relay_provisioner;
-- Remove broad grants from an earlier install of this migration before restoring the column grants.
REVOKE INSERT,UPDATE ON app.stores FROM relay_provisioner;
GRANT UPDATE(status,phase,attempt,lease_until,lease_owner,next_attempt_at,error_code,config,resources,upstream_id,updated_at,deleted_at) ON app.stores TO relay_provisioner;
GRANT SELECT ON app.schema_migrations TO relay_provisioner;
GRANT SELECT,INSERT,UPDATE ON app.upstreams,app.tool_catalog_versions TO relay_provisioner;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['upstreams','tool_catalog_versions'] LOOP
IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='app' AND tablename=t AND policyname='controller') THEN EXECUTE format('CREATE POLICY controller ON app.%I TO relay_provisioner USING(true) WITH CHECK(true)',t); END IF; END LOOP; END $$;
-- The controller may register only IDs belonging to a durable store; it cannot mutate the core utility registrations.
DROP POLICY IF EXISTS controller ON app.upstreams;
CREATE POLICY controller ON app.upstreams TO relay_provisioner USING(EXISTS(SELECT 1 FROM app.stores s WHERE s.id=upstreams.id)) WITH CHECK(EXISTS(SELECT 1 FROM app.stores s WHERE s.id=upstreams.id));
DROP POLICY IF EXISTS controller ON app.tool_catalog_versions;
CREATE POLICY controller ON app.tool_catalog_versions TO relay_provisioner USING(EXISTS(SELECT 1 FROM app.stores s WHERE s.id=tool_catalog_versions.upstream_id)) WITH CHECK(EXISTS(SELECT 1 FROM app.stores s WHERE s.id=tool_catalog_versions.upstream_id));
CREATE INDEX IF NOT EXISTS stores_dispatch ON app.stores(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS stores_owner_admission ON app.stores(user_id) WHERE status<>'Deleted';
CREATE INDEX IF NOT EXISTS outbox_dispatch ON app.outbox_events(store_id,generation) WHERE dispatched_at IS NULL;
CREATE OR REPLACE FUNCTION app.repair_store(sid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.stores; BEGIN
UPDATE app.stores SET status='Provisioning',phase='Repair',generation=generation+1,attempt=0,deadline=now()+interval '10 minutes',next_attempt_at=now(),updated_at=now() WHERE id=sid AND status='Ready' AND desired='present' RETURNING * INTO s;
IF FOUND THEN INSERT INTO app.outbox_events(id,team_id,store_id,generation) VALUES(gen_random_uuid(),s.team_id,s.id,s.generation); END IF;
END $$;
REVOKE ALL ON FUNCTION app.repair_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.repair_store(uuid) TO relay_provisioner;
-- A trusted session-derived actor enters this narrow mutation function. Global per-user admission
-- counts across teams under one advisory lock; RLS on the API never exposes other teams' stores.
CREATE OR REPLACE FUNCTION app.store_request(t uuid,u text,n text,k uuid,domain text,origin_suffix text,cap integer,timeout_s integer,action text,target uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sid uuid; previous app.operations; s app.stores; r text; gen integer; BEGIN
IF t::text<>current_setting('relay.team_id',true) THEN RAISE EXCEPTION 'STORE_SCOPE'; END IF;
SELECT role INTO r FROM app.memberships WHERE team_id=t AND user_id=u AND active;
IF r IS NULL THEN RAISE EXCEPTION 'STORE_MEMBERSHIP'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('store-owner:'||u,0));
SELECT * INTO previous FROM app.operations WHERE team_id=t AND user_id=u AND idempotency_id=k;
IF FOUND THEN
 IF previous.kind<>action OR (target IS NOT NULL AND previous.store_id<>target) THEN RAISE EXCEPTION 'STORE_IDEMPOTENCY_CONFLICT'; END IF;
 IF action='create' AND (SELECT name FROM app.stores WHERE id=previous.store_id)<>n THEN RAISE EXCEPTION 'STORE_IDEMPOTENCY_CONFLICT'; END IF;
 RETURN previous.store_id;
END IF;
IF action='create' THEN
 IF (SELECT count(*) FROM app.stores WHERE user_id=u AND status<>'Deleted')>=cap THEN RAISE EXCEPTION 'STORE_LIMIT'; END IF;
 sid:=gen_random_uuid(); gen:=1;
 INSERT INTO app.stores(id,team_id,user_id,name,namespace,release,host,url,desired,status,deadline)
 VALUES(sid,t,u,n,'relay-store-'||replace(sid::text,'-',''),'store','s-'||replace(sid::text,'-','')||'.'||domain,'http://s-'||replace(sid::text,'-','')||'.'||domain||origin_suffix,'present','Provisioning',now()+make_interval(secs=>timeout_s));
ELSE
 SELECT * INTO s FROM app.stores WHERE id=target AND team_id=t FOR UPDATE;
 IF NOT FOUND OR (s.user_id<>u AND r<>'admin') THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
 sid:=s.id;gen:=s.generation+1;
 IF action IN ('retry','reconcile') THEN
  IF (action='retry' AND s.status NOT IN ('Failed','RecoveryRequired')) OR (action='reconcile' AND s.status<>'Ready') THEN RAISE EXCEPTION 'STORE_STATE_CONFLICT'; END IF;
  UPDATE app.stores SET status=CASE WHEN desired='absent' THEN 'Deleting' ELSE 'Provisioning' END,generation=gen,attempt=0,deadline=now()+make_interval(secs=>timeout_s),error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE id=sid;
 ELSIF action='delete' THEN
  IF s.status='Deleted' THEN RETURN sid; END IF;
  UPDATE app.stores SET desired='absent',status='Deleting',phase='Drain',generation=gen,attempt=0,deadline=now()+make_interval(secs=>timeout_s),error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE id=sid;
  UPDATE app.upstreams SET enabled=false,revision=revision+1,deleted_at=COALESCE(deleted_at,now()) WHERE id=s.upstream_id;
 ELSE RAISE EXCEPTION 'STORE_ACTION'; END IF;
END IF;
INSERT INTO app.operations(id,team_id,store_id,user_id,kind,idempotency_id,generation) VALUES(gen_random_uuid(),t,sid,u,action,k,gen);
INSERT INTO app.outbox_events(id,team_id,store_id,generation) VALUES(gen_random_uuid(),t,sid,gen);
INSERT INTO app.management_events(id,team_id,user_id,action,target) VALUES(gen_random_uuid(),t,u,'store.'||action,sid::text);
RETURN sid;
END $$;
REVOKE ALL ON FUNCTION app.store_request(uuid,text,text,uuid,text,text,integer,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_request(uuid,text,text,uuid,text,text,integer,integer,text,uuid) TO relay_app;
-- Owner authorized an additional INR15 of eligible prepaid credit on Oct11 for M5.
-- Preserve every reservation; raise the existing INR99 runtime ceiling to INR114 only.
CREATE OR REPLACE FUNCTION app.reserve_model(r uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n uuid; used bigint; BEGIN PERFORM pg_advisory_xact_lock(74404);
SELECT COALESCE(sum(reserved_paise),0) INTO used FROM app.model_reservations;
IF used+500>11400 THEN RAISE EXCEPTION 'MODEL_BUDGET_EXHAUSTED'; END IF;
n:=gen_random_uuid(); INSERT INTO app.model_reservations(id,run_id,reserved_paise) VALUES(n,r,500); RETURN n; END $$;
CREATE OR REPLACE FUNCTION app.model_budget() RETURNS TABLE(reserved_paise bigint,remaining_paise bigint) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT COALESCE(sum(reserved_paise),0),11400-COALESCE(sum(reserved_paise),0) FROM app.model_reservations $$;
INSERT INTO app.schema_migrations(version) VALUES('0003_m5') ON CONFLICT DO NOTHING;
RESET ROLE;
