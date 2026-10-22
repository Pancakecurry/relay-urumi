SET ROLE relay_migrator;
CREATE OR REPLACE FUNCTION app.store_request(t uuid,u text,n text,k uuid,domain text,origin_suffix text,cap integer,timeout_s integer,action text,target uuid,scheme text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sid uuid; previous app.operations; s app.stores; r text; gen integer; BEGIN
IF scheme NOT IN ('http','https') THEN RAISE EXCEPTION 'STORE_SCHEME'; END IF;
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
 VALUES(sid,t,u,n,'relay-store-'||replace(sid::text,'-',''),'store','s-'||replace(sid::text,'-','')||'.'||domain,scheme||'://s-'||replace(sid::text,'-','')||'.'||domain||origin_suffix,'present','Provisioning',now()+make_interval(secs=>timeout_s));
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
REVOKE ALL ON FUNCTION app.store_request(uuid,text,text,uuid,text,text,integer,integer,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_request(uuid,text,text,uuid,text,text,integer,integer,text,uuid,text) TO relay_app;
INSERT INTO app.schema_migrations(version) VALUES('0009_store_transport') ON CONFLICT DO NOTHING;
RESET ROLE;
