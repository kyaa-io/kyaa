\ir fan_action_producers.sql
\ir community_stamp_share_behavior.sql
-- The complete migration chain supplies the production first_clip proof and invite idempotency.
-- Reuse committed share/passport evidence used by the existing concurrency suite.
\ir community_stamp_share_concurrency.sql
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'COMMUNITY_NATIVE_TEST: %',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'unexpected %, wanted %',sqlerrm,expected; end if;
    return;
  end;
  raise exception 'missing error %',expected;
end $$;
create temporary table source_definition as select pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure) definition;
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
values('fa140000-0000-4000-8000-000000000001',91342,'0x'||repeat('1',64),'0x'||repeat('2',40),'0x'||repeat('3',40),'0x'||repeat('4',64),1,2,'ipfs://bafycommunitynative',jsonb_build_object('1','0x'||repeat('5',40)));
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version)
select code,'fa140000-0000-4000-8000-000000000001',false,1 from unnest(array[7,8,9,10,12]) code;
insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at)
values('fa140000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001',1,'0x'||repeat('6',64),now());
-- Prepare leaves share legacy and available until the explicit T2 transaction.
select public.visit_community_stamp_share_link('fc130000-0000-4000-8000-000000000021',token)
from public.community_share_race_tokens where owner_id='fc130000-0000-4000-8000-000000000011';
select pg_temp.assert(exists(select 1 from public.community_stamps where app_user_id='fc130000-0000-4000-8000-000000000011' and kind='share' and blockchain_job_id is not null),'prepare stopped legacy share');
\ir ../community_native_cutover.sql
select pg_temp.assert((select definition from source_definition)=pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure),'source proof changed');
-- Real unified-feed producer: the post source timestamp and replay contract survive T2.
insert into public.app_users(id,privy_user_id,verified_email,status)
values('fa140000-0000-4000-8000-000000000020','did:privy:community-native-post','community-native-post@byus.test','active');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
values('fa140000-0000-4000-8000-000000000020',91342,'0xfa14000000000000000000000000000000000020','privy','embedded');
do $$
declare owner uuid:='fa140000-0000-4000-8000-000000000020'; creator uuid:='fc130000-0000-4000-8000-000000000001';
  result jsonb; post_id uuid; score_count bigint:=(select count(*) from public.fan_score_ledger); ticket_count bigint;
begin
  result:=public.save_fan_post(owner,'community-share-race',null,'Native first post','public','{}',null,'fa140000-0000-4000-8000-000000000021');
  post_id:=(result->>'id')::uuid;
  ticket_count:=(select count(*) from public.fan_ticket_ledger);
  result:=public.save_fan_post(owner,'community-share-race',null,'Native first post','public','{}',null,'fa140000-0000-4000-8000-000000000021');
  perform pg_temp.assert(result->>'replayed'='true','unified feed post replay failed');
  perform pg_temp.assert(exists(select 1 from public.community_stamps stamp join public.fan_posts post on post.id=post_id
    join public.fan_action_outbox outbox on outbox.id=stamp.fan_action_outbox_id
    where stamp.app_user_id=owner and stamp.celebrity_id=creator and stamp.kind='first_comment'
      and stamp.source_key='first-comment:post:'||post_id and stamp.issued_at=post.created_at
      and post.first_comment_eligible and stamp.blockchain_job_id is null and outbox.source_snapshot->>'actionCode'='8'),
    'unified first post source or native timestamp was lost');
  perform pg_temp.assert((select count(*) from public.community_stamps where app_user_id=owner and kind='first_comment')=1,'unified first post duplicated');
  perform pg_temp.assert(not public.issue_community_stamp(owner,creator,'first_comment','first-comment:post:'||post_id),'first post source replay issued again');
  perform pg_temp.assert((select count(*) from public.fan_score_ledger)=score_count,'unified first post changed score');
  perform pg_temp.assert((select count(*) from public.fan_ticket_ledger)=ticket_count,'unified first post replay changed tickets');
end $$;
create temporary table baseline_counts as select (select count(*) from public.blockchain_jobs) jobs,(select count(*) from public.fan_ticket_ledger) tickets;
-- Owner B has genuine issued passport evidence and no share reward yet.
select public.visit_community_stamp_share_link('fc130000-0000-4000-8000-000000000021',token)
from public.community_share_race_tokens where owner_id='fc130000-0000-4000-8000-000000000012';
insert into public.app_users(id,privy_user_id,verified_email,status) values('fa140000-0000-4000-8000-000000000002','did:privy:community-native','community-native@byus.test','active');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
values('fa140000-0000-4000-8000-000000000002',91342,'0x'||repeat('7',40),'privy','embedded');
insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key)
values('fa140000-0000-4000-8000-000000000003','fc130000-0000-4000-8000-000000000001','fa140000-0000-4000-8000-000000000002','native test','fa140000-0000-4000-8000-000000000003');
insert into public.community_stamp_invite_codes(app_user_id,code) values('fc130000-0000-4000-8000-000000000012',repeat('A',24));
insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
values('fa140000-0000-4000-8000-000000000004','fc130000-0000-4000-8000-000000000012','fa140000-0000-4000-8000-000000000002',repeat('A',24));
insert into public.fan_clips(id,app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash)
values('fa140000-0000-4000-8000-000000000005','fa140000-0000-4000-8000-000000000002','fc130000-0000-4000-8000-000000000001','Native clip fixture','public','fa140000-0000-4000-8000-000000000005',repeat('0',64));
-- Snapshot points/tickets after service fixtures; issuing stamps itself must not add rewards.
create temporary table reward_counts as select (select count(*) from public.fan_ticket_ledger) tickets,(select count(*) from public.fan_score_ledger) points;
do $$
declare owner uuid:='fa140000-0000-4000-8000-000000000002'; creator uuid:='fc130000-0000-4000-8000-000000000001'; kind public.community_stamp_kind; source text; code integer; descriptor jsonb; item jsonb;
begin
  perform public.issue_community_stamp(owner,null,'invite','invite:fa140000-0000-4000-8000-000000000004:invitee');
  -- Production permits a distinct invite relationship for the same inviter; only source replay is a duplicate.
  insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
    values('fa140000-0000-4000-8000-000000000022','fc130000-0000-4000-8000-000000000012','fa140000-0000-4000-8000-000000000020',repeat('A',24));
  perform pg_temp.assert(public.issue_community_stamp('fc130000-0000-4000-8000-000000000012',null,'invite','invite:fa140000-0000-4000-8000-000000000004:inviter'),'first inviter source missing');
  perform pg_temp.assert(public.issue_community_stamp('fc130000-0000-4000-8000-000000000012',null,'invite','invite:fa140000-0000-4000-8000-000000000022:inviter'),'second inviter source was incorrectly blocked globally');
  perform pg_temp.assert(not public.issue_community_stamp('fc130000-0000-4000-8000-000000000012',null,'invite','invite:fa140000-0000-4000-8000-000000000022:inviter'),'inviter source replay duplicated');
  perform public.issue_community_stamp(owner,creator,'daily_checkin','daily-checkin:'||creator||':'||public.community_stamp_kst_date());
  perform public.issue_community_stamp(owner,creator,'first_clip','first-clip:fa140000-0000-4000-8000-000000000005');
  perform pg_temp.assert(not public.issue_community_stamp(owner,creator,'first_clip','first-clip:fa140000-0000-4000-8000-000000000005'),'first clip duplicate');
  perform pg_temp.assert((select count(distinct stamp.kind) from public.community_stamps stamp where fan_action_outbox_id is not null)=6,'six native kinds missing');
  perform pg_temp.assert(not exists(select 1 from public.community_stamps where app_user_id=owner and blockchain_job_id is not null),'legacy fallback');
  perform pg_temp.assert((select count(*) from public.blockchain_jobs)=(select jobs from baseline_counts),'legacy queue increased');
  perform pg_temp.assert((select count(*) from public.fan_ticket_ledger)=(select tickets from reward_counts),'stamp issuance changed tickets');
  perform pg_temp.assert((select count(*) from public.fan_score_ledger)=(select points from reward_counts),'stamp issuance changed points');
  foreach kind in array array['subscription','support']::public.community_stamp_kind[] loop
    perform pg_temp.expect_error(format('select public.issue_community_stamp(%L,%L,%L,%L)',owner,creator,kind,'bad'),'COMMUNITY_STAMP_UNAVAILABLE');
  end loop;
  perform pg_temp.expect_error(format('select public.issue_community_stamp(%L,%L,%L,%L)',owner,creator,'share','verified-share-visit:fa140000-0000-4000-8000-000000000005'),'COMMUNITY_STAMP_INVALID_REQUEST');
  perform pg_temp.expect_error(format('select public.issue_community_stamp(%L,%L,%L,%L)',owner,creator,'first_clip','first-clip:fa140000-0000-4000-8000-000000000006'),'COMMUNITY_STAMP_INVALID_REQUEST');
  -- Direct action12 cannot smuggle another metadata kind, namespace, entity or asset kind.
  descriptor:=jsonb_build_array(jsonb_build_object('entityType','community_stamp','entityId',extensions.gen_random_uuid(),'kind',1,'issuanceKey','0x'||repeat('a',64),'operationKey','test','legacyPayload',jsonb_build_object('stampKind','welcome')));
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,now(),12,%L::jsonb)','community_stamps','bad',owner,creator,descriptor),'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  descriptor:=jsonb_build_array(jsonb_build_object('entityType','community_stamp','entityId','fa140000-0000-4000-8000-000000000010','kind',1,
    'issuanceKey','0x'||encode(extensions.digest('byus:community-stamp:v1:fa140000-0000-4000-8000-000000000010','sha256'),'hex'),
    'operationKey','byus:community-stamp:v1:fa140000-0000-4000-8000-000000000010','legacyPayload',jsonb_build_object('stampKind','first_clip',
      'issuanceId','0x'||encode(extensions.digest('byus:community-stamp:v1:fa140000-0000-4000-8000-000000000010','sha256'),'hex'))));
  foreach item in array array[
    jsonb_set(descriptor,'{0,entityType}','"stamp"'),
    jsonb_set(descriptor,'{0,kind}','0'),
    jsonb_set(descriptor,'{0,legacyPayload,stampKind}','"support"'),
    jsonb_set(descriptor,'{0,issuanceKey}',to_jsonb('0x'||repeat('0',64)))
  ] loop
    perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,now(),12,%L::jsonb)',
      'community_stamps','first-clip:fa140000-0000-4000-8000-000000000005:'||owner,owner,creator,item),'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  end loop;
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,now(),12,%L::jsonb)',
    'wrong_namespace','first-clip:fa140000-0000-4000-8000-000000000005:'||owner,owner,creator,descriptor),'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,null,null,now(),12,%L::jsonb)',
    'community_stamps','first-clip:fa140000-0000-4000-8000-000000000005:'||owner,owner,descriptor),'FAN_ACTION_INVALID_COMMUNITY_CREDENTIAL');
  perform pg_temp.expect_error(format('select public.enqueue_fan_action_source(%L,%L,%L,%L,null,now(),12,%L::jsonb)',
    'community_stamps','first-clip:fa140000-0000-4000-8000-000000000005:fc130000-0000-4000-8000-000000000012','fc130000-0000-4000-8000-000000000012',creator,descriptor),'COMMUNITY_STAMP_INVALID_REQUEST');
  update public.fan_clips set hidden_at=now() where id='fa140000-0000-4000-8000-000000000005';
  perform pg_temp.expect_error(format('select public.issue_community_stamp(%L,%L,%L,%L)',owner,creator,'first_clip','first-clip:fa140000-0000-4000-8000-000000000005'),'COMMUNITY_STAMP_INVALID_REQUEST');
  update public.fan_clips set hidden_at=null where id='fa140000-0000-4000-8000-000000000005';
  -- Missing/disabled/binding1 route never makes any supported kind enqueue legacy.
  foreach code in array array[7,8,9,10,12] loop
    update public.fan_action_producer_routes set enabled=false where action_code=code;
    perform pg_temp.expect_error(format('select public.fan_action_native_enabled(%s,%L,%L)',code,owner,creator),'FAN_ACTION_ROUTE_REQUIRED');
    update public.fan_action_producer_routes set enabled=true where action_code=code;
  end loop;
  perform pg_temp.assert(not has_function_privilege('authenticated','public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)','EXECUTE'),'authenticated issue grant');
  perform pg_temp.assert(not has_function_privilege('service_role','public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)','EXECUTE'),'service enqueue grant');
end $$;
select 'COMMUNITY_NATIVE_PASS' result;
-- Post-T2 route removal and binding downgrade must reject a genuine unissued source.
insert into public.fan_clips(id,app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash)
values('fa140000-0000-4000-8000-000000000006','fc130000-0000-4000-8000-000000000012','fc130000-0000-4000-8000-000000000001','Native clip fixture','public','fa140000-0000-4000-8000-000000000006',repeat('0',64));
create temporary table saved_route as select * from public.fan_action_producer_routes where action_code=12;
update public.fan_action_producer_routes set enabled=false where action_code=12;
select pg_temp.expect_error($q$select public.issue_community_stamp('fc130000-0000-4000-8000-000000000012','fc130000-0000-4000-8000-000000000001','first_clip','first-clip:fa140000-0000-4000-8000-000000000006')$q$,'FAN_ACTION_ROUTE_REQUIRED');
delete from public.fan_action_producer_routes where action_code=12;
select pg_temp.expect_error($q$select public.issue_community_stamp('fc130000-0000-4000-8000-000000000012','fc130000-0000-4000-8000-000000000001','first_clip','first-clip:fa140000-0000-4000-8000-000000000006')$q$,'FAN_ACTION_ROUTE_REQUIRED');
insert into public.fan_action_producer_routes select * from saved_route;
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
select 'fa140000-0000-4000-8000-000000000099',chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,1,asset_base_uri,assets from public.fan_action_bindings where id='fa140000-0000-4000-8000-000000000001';
update public.fan_action_producer_routes set binding_id='fa140000-0000-4000-8000-000000000099' where action_code=12;
select pg_temp.expect_error($q$select public.issue_community_stamp('fc130000-0000-4000-8000-000000000012','fc130000-0000-4000-8000-000000000001','first_clip','first-clip:fa140000-0000-4000-8000-000000000006')$q$,'FAN_ACTION_ROUTE_REQUIRED');
update public.fan_action_producer_routes set binding_id='fa140000-0000-4000-8000-000000000001' where action_code=12;
select pg_temp.assert((select count(*) from public.blockchain_jobs)=(select jobs from baseline_counts),'route rejection enqueued legacy');
-- The current WAVE campaign, activation gate, mission payload and source time survive cutover.
\ir kyaa_wave_mission_stamps.sql
