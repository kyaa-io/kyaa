-- POST-DELETE-CORRECTION: deleting or hiding a post/comment takes back its points once.
-- Disposable clean-chain DB only; everything rolls back. NOT RUN by the author (worker hook blocks DB access): first run is the orchestrator's.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected error was not raised: %', expected; end if;
end $$;

create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'cdel-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,now(),j);
  set local session_replication_role = origin;
  return s;
end $$;

-- A post/comment row plus the grant that the real award would have written (points paid through the wallet, optional stamp).
create function pg_temp.mkpost(u uuid, c uuid, stamped boolean) returns uuid language plpgsql as $$
declare p uuid := extensions.gen_random_uuid(); s uuid; lid uuid;
begin
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values(p,c,u,'cdel post body '||p,extensions.gen_random_uuid(),'h');
  lid := public.group_wallet_post(u,'fan_point',20::bigint,'dukjil_action',extensions.gen_random_uuid());
  if stamped then s := pg_temp.mkstamp(u,c,'post','cdel-post-'||p); end if;
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,ledger_id,capped,reason,policy_version,kst_date)
    values(u,c,'post',p::text,extensions.gen_random_uuid(),20,s,lid,not stamped,case when stamped then null else 'STAMP_CAP' end,1,public.dukjil_kst_date());
  return p;
end $$;

-- A stamp-only grant: the daily point cap was reached, so points = 0 and no ledger row, but the stamp was still given.
create function pg_temp.mkpost0(u uuid, c uuid) returns uuid language plpgsql as $$
declare p uuid := extensions.gen_random_uuid(); s uuid;
begin
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values(p,c,u,'cdel zero post body '||p,extensions.gen_random_uuid(),'h');
  s := pg_temp.mkstamp(u,c,'post','cdel-zero-'||p);
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,ledger_id,capped,reason,policy_version,kst_date)
    values(u,c,'post',p::text,extensions.gen_random_uuid(),0,s,null,true,'DAILY_POINT_CAP',1,public.dukjil_kst_date());
  return p;
end $$;

create function pg_temp.mkcomment(u uuid, c uuid, post uuid) returns uuid language plpgsql as $$
declare k uuid := extensions.gen_random_uuid(); lid uuid;
begin
  insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values(k,post,u,'cdel comment',extensions.gen_random_uuid());
  lid := public.group_wallet_post(u,'fan_point',3::bigint,'dukjil_action',extensions.gen_random_uuid());
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,ledger_id,capped,policy_version,kst_date)
    values(u,c,'comment',k::text,extensions.gen_random_uuid(),3,lid,false,1,public.dukjil_kst_date());
  return k;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'd9100000-0000-4000-8000-000000000001';
  uo uuid := 'd9100000-0000-4000-8000-000000000011'; adm uuid := 'd9100000-0000-4000-8000-000000000012'; rep uuid := 'd9100000-0000-4000-8000-000000000013';
  uspent uuid := 'd9100000-0000-4000-8000-000000000014';
  allow uuid := 'd9100000-0000-4000-8000-000000000021';
  pass uuid := extensions.gen_random_uuid(); j uuid := extensions.gen_random_uuid();
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; k1 uuid; k2 uuid; rep1 uuid; s uuid; r jsonb;
  bal bigint; b0 bigint; n integer; st text; i integer;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'cdel-c1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','삭제정정','삭제정정','삭제정정'),(c1,'en','Cdel','Cdel','Cdel');
  update public.celebrities set status='published' where id=c1;
  for i in 1..4 loop
    insert into public.app_users(id,privy_user_id,verified_email,status) values
      ((array[uo,adm,rep,uspent])[i],'did:privy:cdel-'||i,'cdel-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values((array[uo,adm,rep,uspent])[i],91342,'0xcccccccccccccccccccccccccccccccccccc'||lpad(i::text,4,'0'),'privy','embedded');
  end loop;
  insert into public.admin_allowlist(id,email,role,active) values(allow,'cdel-2@byus.test','admin',true);
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',pass,'cdel-pass',1,jsonb_build_object('recipient','0xcccccccccccccccccccccccccccccccccccc0001','celebritySlug','cdel-c1','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(pass,uo,c1,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- ===== 1. stamped post grant: delete takes the points back, revokes the stamp, writes one correction =====
  p1 := pg_temp.mkpost(uo,c1,true);
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post(uo,p1);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 20 then raise exception 'stamped delete: balance % -> %', b0, public.group_wallet_balance(uo,'fan_point'); end if;
  select s.id into s from public.community_stamps s where s.source_key='cdel-post-'||p1;
  if (select revoked_at from public.community_stamps where id=s) is null then raise exception 'stamped delete: stamp not revoked'; end if;
  select count(*), min(c.status) into n, st from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key=p1::text;
  if n <> 1 or st <> 'corrected' then raise exception 'stamped delete: corrections % status %', n, st; end if;
  if not exists(select 1 from public.fan_posts where id=p1 and deleted_at is not null) then raise exception 'stamped delete: post not deleted'; end if;

  -- ===== 2. re-request: no second deduction, no error =====
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post(uo,p1);
  if public.group_wallet_balance(uo,'fan_point') <> b0 then raise exception 're-request deducted again'; end if;
  select count(*) into n from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key=p1::text;
  if n <> 1 then raise exception 're-request corrections %', n; end if;
  if public.dukjil_correct_content_grant(uo,uo,'post',p1::text,'content_deleted') <> 'replayed' then raise exception 'direct replay should be replayed'; end if;

  -- ===== 3. STAMP_CAP grant (points > 0, no stamp): the case found on dev =====
  p2 := pg_temp.mkpost(uo,c1,false);
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post(uo,p2);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 20 then raise exception 'STAMP_CAP delete: balance % -> %', b0, public.group_wallet_balance(uo,'fan_point'); end if;
  select count(*), min(c.status) into n, st from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id
   where l.source_key=p2::text and c.stamp_id is null and c.ledger_id is not null;
  if n <> 1 or st <> 'corrected' then raise exception 'STAMP_CAP delete: corrections % status %', n, st; end if;
  perform public.remove_fan_post(uo,p2);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 20 then raise exception 'STAMP_CAP re-request deducted again'; end if;

  -- ===== 4. points already spent after the grant: review / rights_spent, no deduction =====
  p3 := pg_temp.mkpost(uspent,c1,false);
  perform public.group_wallet_post(uspent,'fan_point',-5::bigint,'group_exchange',extensions.gen_random_uuid());
  perform public.group_wallet_post(uspent,'fan_point',500::bigint,'dukjil_action',extensions.gen_random_uuid());
  b0 := public.group_wallet_balance(uspent,'fan_point');
  perform public.remove_fan_post(uspent,p3);
  if public.group_wallet_balance(uspent,'fan_point') <> b0 then raise exception 'spent delete changed the balance'; end if;
  select count(*) into n from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id
   where l.source_key=p3::text and c.status='review' and c.reason='rights_spent' and c.ledger_id is null;
  if n <> 1 then raise exception 'spent delete: review rows %', n; end if;
  -- the review list shows the unstamped row (stampId null, celebrity from the action log)
  if not exists(select 1 from jsonb_array_elements(public.read_passport_point_reviews(adm,50,null)) e
                 where (e->>'appUserId')::uuid=uspent and e->'stampId' = 'null'::jsonb and (e->>'celebrityId')::uuid=c1) then
    raise exception 'unstamped review row missing from read_passport_point_reviews'; end if;

  -- ===== 5. delete after a Claim exists: the delete still corrects (Claim records are immutable and are not touched) =====
  insert into public.passport_page_claims(passport_id,page_no,request_key) values(pass,1,'cdel-claim-1');
  p4 := pg_temp.mkpost(uo,c1,true);
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post(uo,p4);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 20 then raise exception 'delete after claim: balance'; end if;
  if not exists(select 1 from public.passport_page_claims where passport_id=pass and page_no=1) then raise exception 'claim row must stay'; end if;

  -- ===== 6. comment grant =====
  p5 := pg_temp.mkpost(uo,c1,false);   -- keeps an undeleted post for the comments
  k1 := pg_temp.mkcomment(uo,c1,p5);
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post_comment(uo,k1);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 3 then raise exception 'comment delete: balance'; end if;
  perform public.remove_fan_post_comment(uo,k1);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 3 then raise exception 'comment re-request deducted again'; end if;

  -- ===== 7. operator / report hide: post (unstamped here) and comment =====
  k2 := pg_temp.mkcomment(uo,c1,p5);
  insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
    values(rep,c1,'fan_post_comment',k2,1,uo,'cdel report',extensions.gen_random_uuid()) returning id into rep1;
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.resolve_admin_content_report(adm,allow,extensions.gen_random_uuid(),rep1,'resolved',true,'confirmed abusive content',false);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 3 then raise exception 'hide comment: balance % -> %', b0, public.group_wallet_balance(uo,'fan_point'); end if;
  if not exists(select 1 from public.fan_post_comments where id=k2 and hidden_at is not null) then raise exception 'hide comment: not hidden'; end if;
  perform public.resolve_admin_content_report(adm,allow,extensions.gen_random_uuid(),rep1,'resolved',true,'confirmed abusive content',false);
  if public.group_wallet_balance(uo,'fan_point') <> b0 - 3 then raise exception 'hide re-request deducted again'; end if;
  select count(*) into n from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key=k2::text;
  if n <> 1 then raise exception 'hide comment: corrections %', n; end if;

  -- a dismissed report or a hide=false resolution corrects nothing
  k2 := pg_temp.mkcomment(uo,c1,p5);
  insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
    values(rep,c1,'fan_post_comment',k2,1,uo,'cdel report 2',extensions.gen_random_uuid()) returning id into rep1;
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.resolve_admin_content_report(adm,allow,extensions.gen_random_uuid(),rep1,'dismissed',false,'not a violation, kept',false);
  if public.group_wallet_balance(uo,'fan_point') <> b0 then raise exception 'dismissed report changed the balance'; end if;

  -- ===== 8. a deleted post without any grant (or a reaction grant) is untouched =====
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values('d9100000-0000-4000-8000-0000000000a1',c1,uo,'cdel no grant post',extensions.gen_random_uuid(),'h');
  b0 := public.group_wallet_balance(uo,'fan_point');
  perform public.remove_fan_post(uo,'d9100000-0000-4000-8000-0000000000a1');
  if public.group_wallet_balance(uo,'fan_point') <> b0 then raise exception 'no-grant delete changed the balance'; end if;
  perform pg_temp.expect_error(format('select public.dukjil_correct_content_grant(%L,%L,%L,%L,%L)',uo,uo,'reaction','x','content_deleted'),'DUKJIL_CORRECTION_INVALID');

  -- ===== 9. delete does not free the caps: the grant rows stay and keep counting =====
  select count(*) into n from public.dukjil_action_log where app_user_id=uo and action_key='post' and points>0;
  if n <> 4 then raise exception 'grant rows must stay after delete, got %', n; end if;
  -- ===== 10. wallet disabled / write-fenced: delete and hide still succeed, the correction is queued and retried later =====
  declare pw uuid; kw uuid; pw2 uuid; pend integer; rid uuid;
  begin
    pw := pg_temp.mkpost(uo,c1,false);
    pw2 := pg_temp.mkpost(uo,c1,false);
    kw := pg_temp.mkcomment(uo,c1,p5);
    b0 := public.group_wallet_balance(uo,'fan_point');
    update public.group_wallet_release set write_fenced = true;
    perform public.remove_fan_post(uo,pw);
    if not exists(select 1 from public.fan_posts where id=pw and deleted_at is not null) then raise exception 'fenced delete must still delete'; end if;
    if exists(select 1 from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key=pw::text) then
      raise exception 'fenced delete must not correct yet'; end if;
    select count(*) into pend from public.dukjil_pending_content_corrections where source_key=pw::text and resolved_at is null;
    if pend <> 1 then raise exception 'fenced delete: pending rows %', pend; end if;
    perform public.remove_fan_post(uo,pw);
    select count(*) into pend from public.dukjil_pending_content_corrections where source_key=pw::text;
    if pend <> 1 then raise exception 'fenced re-request: pending rows %', pend; end if;
    -- the operator hide path is not blocked either
    insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
      values(rep,c1,'fan_post_comment',kw,1,uo,'cdel fenced report',extensions.gen_random_uuid()) returning id into rid;
    perform public.resolve_admin_content_report(adm,allow,extensions.gen_random_uuid(),rid,'resolved',true,'confirmed abusive content',false);
    if not exists(select 1 from public.fan_post_comments where id=kw and hidden_at is not null) then raise exception 'fenced hide must still hide'; end if;
    if (select count(*) from public.dukjil_pending_content_corrections where source_key=kw::text and resolved_at is null) <> 1 then raise exception 'fenced hide: not queued'; end if;
    if public.group_wallet_balance(uo,'fan_point') <> b0 then raise exception 'fenced: balance must not move yet'; end if;
    -- retry while still fenced: nothing resolves, no error
    if public.retry_dukjil_content_corrections(50) <> 0 then raise exception 'retry while fenced must resolve nothing'; end if;
    update public.group_wallet_release set write_fenced = false;
    if public.retry_dukjil_content_corrections(50) <> 2 then raise exception 'retry after fence must resolve both'; end if;
    if public.group_wallet_balance(uo,'fan_point') <> b0 - 23 then raise exception 'retry: balance % wanted %', public.group_wallet_balance(uo,'fan_point'), b0 - 23; end if;
    if public.retry_dukjil_content_corrections(50) <> 0 then raise exception 'second retry must be a no-op'; end if;
    select count(*) into pend from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key in (pw::text, kw::text);
    if pend <> 2 then raise exception 'retry: corrections %', pend; end if;
    -- disabled wallet (not just fenced) behaves the same
    update public.group_wallet_release set enabled = false;
    perform public.remove_fan_post(uo,pw2);
    if not exists(select 1 from public.dukjil_pending_content_corrections where source_key=pw2::text and resolved_at is null) then raise exception 'disabled wallet: not queued'; end if;
    update public.group_wallet_release set enabled = true;
    if public.retry_dukjil_content_corrections(50) <> 1 then raise exception 'disabled wallet retry'; end if;
  end;

  -- ===== 11. 0P stamp (daily point cap reached, stamp still given): delete / hide voids the stamp, no points move =====
  declare z1 uuid; z2 uuid; zk uuid; zs uuid; zrid uuid; zb bigint;
  begin
    zb := public.group_wallet_balance(uo,'fan_point');
    z1 := pg_temp.mkpost0(uo,c1);
    select stamp_id into zs from public.dukjil_action_log where source_key=z1::text;
    perform public.remove_fan_post(uo,z1);
    if (select revoked_at from public.community_stamps where id=zs) is null then raise exception '0P delete must void the stamp'; end if;
    if public.group_wallet_balance(uo,'fan_point') <> zb then raise exception '0P delete must not move points'; end if;
    if exists(select 1 from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id=c.action_log_id where l.source_key=z1::text) then
      raise exception '0P delete must not write a point correction'; end if;
    perform public.remove_fan_post(uo,z1);
    if not exists(select 1 from public.passport_stamp_voids where stamp_id=zs) then raise exception '0P delete: no void record'; end if;
    -- operator hide of a 0P post
    z2 := pg_temp.mkpost0(uo,c1);
    select stamp_id into zs from public.dukjil_action_log where source_key=z2::text;
    insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
      values(rep,c1,'fan_post',z2,1,uo,'cdel zero report',extensions.gen_random_uuid()) returning id into zrid;
    perform public.resolve_admin_content_report(adm,allow,extensions.gen_random_uuid(),zrid,'resolved',true,'confirmed abusive content',false);
    if (select revoked_at from public.community_stamps where id=zs) is null then raise exception '0P hide must void the stamp'; end if;
    if public.group_wallet_balance(uo,'fan_point') <> zb then raise exception '0P hide must not move points'; end if;
    -- fenced wallet: the 0P delete is queued and the retry voids the stamp
    z1 := pg_temp.mkpost0(uo,c1);
    select stamp_id into zs from public.dukjil_action_log where source_key=z1::text;
    update public.group_wallet_release set write_fenced = true;
    perform public.remove_fan_post(uo,z1);
    if (select revoked_at from public.community_stamps where id=zs) is not null then raise exception '0P fenced delete must wait'; end if;
    if not exists(select 1 from public.dukjil_pending_content_corrections where source_key=z1::text and resolved_at is null) then raise exception '0P fenced delete: not queued'; end if;
    update public.group_wallet_release set write_fenced = false;
    if public.retry_dukjil_content_corrections(50) <> 1 then raise exception '0P retry must resolve one'; end if;
    if (select revoked_at from public.community_stamps where id=zs) is null then raise exception '0P retry must void the stamp'; end if;
    if public.group_wallet_balance(uo,'fan_point') <> zb then raise exception '0P retry must not move points'; end if;
  end;

  -- ===== 12. one pending row that cannot be processed does not block the others; the failure is recorded on the row =====
  declare bp uuid; gp uuid; bl uuid; gl uuid; bstamp uuid; rbad record; rgood record;
  begin
    bp := pg_temp.mkpost(uo,c1,true);
    gp := pg_temp.mkpost(uo,c1,false);
    select id into bl from public.dukjil_action_log where source_key=bp::text;
    select id into gl from public.dukjil_action_log where source_key=gp::text;
    -- the bad row is older and its actor is neither an admin nor the stamp owner (ADMIN_REQUIRED, not a wallet error)
    insert into public.dukjil_pending_content_corrections(action_log_id,app_user_id,actor_app_user_id,action_key,source_key,reason,created_at)
      values(bl,uo,rep,'post',bp::text,'content_hidden',now()-interval '2 hours');
    insert into public.dukjil_pending_content_corrections(action_log_id,app_user_id,actor_app_user_id,action_key,source_key,reason,created_at)
      values(gl,uo,uo,'post',gp::text,'content_deleted',now()-interval '1 hour');
    if public.retry_dukjil_content_corrections(1) <> 0 then raise exception 'limit 1 must try only the bad row first'; end if;
    select * into rbad from public.dukjil_pending_content_corrections where action_log_id=bl;
    if rbad.attempts <> 1 or rbad.last_error is null or rbad.resolved_at is not null or rbad.last_attempt_at is null then
      raise exception 'bad row not recorded: attempts %, error %', rbad.attempts, rbad.last_error; end if;
    -- the next run (same limit) goes to the row not yet tried, not back to the one that just failed
    if public.retry_dukjil_content_corrections(1) <> 1 then raise exception 'the good row must be processed behind the failed one'; end if;
    select * into rgood from public.dukjil_pending_content_corrections where action_log_id=gl;
    if rgood.resolved_at is null or rgood.last_error is not null then raise exception 'good row not resolved'; end if;
    if public.retry_dukjil_content_corrections(50) <> 0 then raise exception 'only the failing row is left'; end if;
    if (select attempts from public.dukjil_pending_content_corrections where action_log_id=bl) <> 2 then raise exception 'bad row attempts not counted'; end if;
    -- the bad row is closed by hand so the later read of the final state is clean
    update public.dukjil_pending_content_corrections set resolved_at=now(), resolution='cdel-test' where action_log_id=bl;
  end;

  -- ===== 13. a failed award is not paid again for content deleted or hidden in the meantime =====
  declare wp uuid; wk uuid; wh uuid; wn integer;
  begin
    wp := extensions.gen_random_uuid(); wk := extensions.gen_random_uuid();
    insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,deleted_at)
      values(wp,c1,uo,'cdel late deleted post body',extensions.gen_random_uuid(),'h',now());
    wh := extensions.gen_random_uuid();
    insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values(wh,c1,uo,'cdel late post body ',extensions.gen_random_uuid(),'h');
    insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key,hidden_at)
      values(wk,wh,uo,'cdel late hidden comment',extensions.gen_random_uuid(),now());
    insert into public.dukjil_wire_failures(wire,app_user_id,celebrity_id,action_key,source_key,error_message)
      values('app',uo,c1,'post',wp::text,'DUKJIL_WIRE_LOCK_BUSY'),('app',uo,c1,'comment',wk::text,'DUKJIL_WIRE_LOCK_BUSY');
    b0 := public.group_wallet_balance(uo,'fan_point');
    perform public.retry_dukjil_wire_failures(500);
    if exists(select 1 from public.dukjil_action_log where source_key in (wp::text, wk::text)) then raise exception 'retry paid a deleted or hidden item'; end if;
    select count(*) into wn from public.dukjil_wire_failures where source_key in (wp::text, wk::text) and resolved_at is not null;
    if wn <> 2 then raise exception 'late failure rows must be closed, got %', wn; end if;
    if public.group_wallet_balance(uo,'fan_point') <> b0 then raise exception 'retry moved points for deleted content'; end if;
  end;

  -- ===== 14. the periodic run is wired (same pg_cron pattern as dukjil-wire-retry) =====
  if not exists(select 1 from cron.job where jobname='dukjil-content-correction-retry' and command like '%retry_dukjil_content_corrections%') then
    raise exception 'content correction retry is not scheduled'; end if;
end $$;

rollback;
