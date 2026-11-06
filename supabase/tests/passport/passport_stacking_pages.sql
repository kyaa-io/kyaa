-- From page 2 the passport is a stacking book: every issued dukjil stamp takes one slot. Voided community stamps leave the owner's collection and counts.
-- Disposable clean-chain DB only; everything rolls back.
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

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:stk-'||n,'stk-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'stk-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','stk','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text, at timestamptz) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'stk-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,at,j);
  set local session_replication_role = origin;
  return s;
end $$;

-- one real earning call; the request key follows the source, so calling it twice is a true replay
create function pg_temp.act(u uuid, c uuid, a text, src text, params jsonb default '{}') returns jsonb language sql as $$
  select public.record_dukjil_action(u, c, a, src, md5('stk:'||u||':'||a||':'||src)::uuid, params)
$$;

-- where a stamp sits, as 'page/slot', or null
create function pg_temp.at(s uuid) returns text language sql as $$
  select page_no||'/'||slot_no from public.passport_page_slots where stamp_id = s
$$;

create function pg_temp.page(road jsonb, n integer) returns jsonb language sql as $$
  select p from jsonb_array_elements(road->'pages') p where (p->>'pageNo')::integer = n
$$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f1600000-0000-4000-8000-000000000001';
  adm uuid := 'f1600000-0000-4000-8000-000000000010'; adm_al uuid := 'f1600000-0000-4000-8000-000000000011';
  ua uuid := 'f1600000-0000-4000-8000-000000000021'; ub uuid := 'f1600000-0000-4000-8000-000000000022';
  uc uuid := 'f1600000-0000-4000-8000-000000000023'; ud uuid := 'f1600000-0000-4000-8000-000000000024';
  pa uuid; pb uuid; pc uuid; pd uuid; r jsonb; r2 jsonb; road jsonb; s1 uuid; s2 uuid; bal bigint; n integer; i integer; before_count integer; k integer := 0; a text;
  expected_points integer; share_token text; shared_count integer;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'stk-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','STK','STK','STK'),(c1,'en','STK','STK','STK');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22); perform pg_temp.mkuser(uc,23); perform pg_temp.mkuser(ud,24);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'stk-10@byus.test','admin',true);
  pa := pg_temp.mkpass(ua,c1); pb := pg_temp.mkpass(ub,c1); pc := pg_temp.mkpass(uc,c1); pd := pg_temp.mkpass(ud,c1);

  -- ===== policy not active: nothing is earned, stamped or placed =====
  if public.dukjil_active_policy() is not null and (public.dukjil_active_policy()).version is not null then raise exception 'precondition: a policy is active'; end if;
  n := (select count(*) from public.community_stamps where app_user_id=ua);
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''survey'',''inactive-1'',%L,''{}'')',ua,c1,extensions.gen_random_uuid()),'POLICY_INACTIVE');
  if (select count(*) from public.community_stamps where app_user_id=ua) <> n or exists(select 1 from public.passport_page_slots where passport_id=pa) then raise exception 'inactive policy issued or placed a stamp'; end if;
  k := k + 1;

  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  before_count := (select count(*) from public.dukjil_policy_versions);

  -- ===== every kind without a stamp limit takes the next slot, one at a time, and pays its usual points =====
  -- an old stamp that never got a slot stays out: nothing is placed retroactively
  s2 := pg_temp.mkstamp(ua,c1,'survey','stk-old-unplaced',now() - interval '10 days');
  r := pg_temp.act(ua,c1,'subscription','sub-1',jsonb_build_object('platform','youtube'));
  if pg_temp.at((r->>'stampId')::uuid) <> '1/7' then raise exception 'first subscription belongs to slot 7, got %', pg_temp.at((r->>'stampId')::uuid); end if;
  i := 0;
  for a, expected_points in select * from (values ('subscription',30),('live_reserve',5),('live_attend',20),('survey',10),('event_checkin',100),('event_review',30)) v(x,y) loop
    i := i + 1;
    bal := public.group_wallet_balance(ua,'fan_point');
    r := pg_temp.act(ua,c1,a,'stack-'||a,case when a='subscription' then jsonb_build_object('platform','instagram') else '{}'::jsonb end);
    if (r->>'stampId') is null or pg_temp.at((r->>'stampId')::uuid) <> '2/'||i then raise exception '% must take page 2 slot %, got % (%)', a, i, pg_temp.at((r->>'stampId')::uuid), r; end if;
    if (r->>'points')::int <> expected_points or public.group_wallet_balance(ua,'fan_point') <> bal + expected_points then raise exception '% points changed: %', a, r; end if;
  end loop;
  r := pg_temp.act(ua,c1,'mission','stack-mission',jsonb_build_object('points',50));
  if pg_temp.at((r->>'stampId')::uuid) <> '2/7' or (r->>'points')::int <> 50 then raise exception 'mission slot %, %', pg_temp.at((r->>'stampId')::uuid), r; end if;
  if pg_temp.at(s2) is not null then raise exception 'an old stamp was placed retroactively'; end if;
  if (select count(*) from public.dukjil_policy_versions) <> before_count then raise exception 'policy rows changed'; end if;
  k := k + 1;

  -- page 2 slots ask for nothing
  road := public.read_passport_roadmap(ua,c1);
  if exists(select 1 from jsonb_array_elements(pg_temp.page(road,2)->'slots') s where s->>'action' is not null) then raise exception 'page 2 has a condition %', pg_temp.page(road,2); end if;
  if (pg_temp.page(road,2)->>'filled')::int <> 7 then raise exception 'page 2 filled %', pg_temp.page(road,2); end if;
  k := k + 1;

  -- ===== a replay adds nothing =====
  bal := public.group_wallet_balance(ua,'fan_point');
  n := (select count(*) from public.passport_page_slots where passport_id=pa and stamp_id is not null);
  r := pg_temp.act(ua,c1,'survey','stack-survey');
  if not (r->>'replayed')::boolean or public.group_wallet_balance(ua,'fan_point') <> bal or (select count(*) from public.passport_page_slots where passport_id=pa and stamp_id is not null) <> n then raise exception 'replay added something %', r; end if;
  -- the same platform again: one stamp per platform, so one slot
  r := pg_temp.act(ua,c1,'subscription','stack-subscription-again',jsonb_build_object('platform','instagram'));
  if (select count(*) from public.passport_page_slots where passport_id=pa and stamp_id is not null) <> n then raise exception 'same platform took a second slot %', r; end if;
  k := k + 1;

  -- ===== real stamp limits keep their rule =====
  r := pg_temp.act(ub,c1,'post','post-1',jsonb_build_object('chars',30));
  if pg_temp.at((r->>'stampId')::uuid) <> '1/3' then raise exception 'first post %', r; end if;
  r := pg_temp.act(ub,c1,'post','post-2',jsonb_build_object('chars',30));
  if r->>'stampId' is not null or position('STAMP_CAP' in r->>'reason') = 0 or (select count(*) from public.passport_page_slots where passport_id=pb and stamp_id is not null) <> 1 then raise exception 'second post of the day took a slot %', r; end if;
  r := pg_temp.act(ub,c1,'reaction','like-1');
  if pg_temp.at((r->>'stampId')::uuid) <> '2/1' then raise exception 'first like goes to page 2 %', r; end if;
  r := pg_temp.act(ub,c1,'reaction','like-2');
  if r->>'stampId' is not null or (select count(*) from public.passport_page_slots where passport_id=pb and page_no=2 and stamp_id is not null) <> 1 then raise exception 'second like took a slot %', r; end if;
  k := k + 1;

  -- ===== page 2 fills, stays locked before the title, the 10th stamp opens page 3 =====
  for i in 8..9 loop
    r := pg_temp.act(ua,c1,'survey','fill-'||i);
    if pg_temp.at((r->>'stampId')::uuid) <> '2/'||i then raise exception 'slot % got %', i, pg_temp.at((r->>'stampId')::uuid); end if;
  end loop;
  r := pg_temp.act(ua,c1,'survey','fill-10');
  if pg_temp.at((r->>'stampId')::uuid) <> '3/1' then raise exception 'tenth stamp %', pg_temp.at((r->>'stampId')::uuid); end if;
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,2)->>'claimable')::boolean or not (pg_temp.page(road,2)->>'locked')::boolean or pg_temp.page(road,2)->>'lockReason' <> 'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN' then raise exception 'page 2 before the title %', pg_temp.page(road,2); end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,2,%L)',ua,c1,'stk-early'),'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN');
  if public.passport_hearts(ua,c1) <> 0 then raise exception 'a locked claim minted a heart'; end if;
  k := k + 1;

  -- first proof takes slot 9 and the title; the second stacks on the open page and pays the repeat amount; the claim gives one heart for nine slots
  r := pg_temp.act(ua,c1,'proof','proof-1');
  if pg_temp.at((r->>'stampId')::uuid) <> '1/9' or (r->>'points')::int <> 500 then raise exception 'first proof %', r; end if;
  insert into public.jjinfan_titles(app_user_id,celebrity_id) values(ua,c1);
  r := pg_temp.act(ua,c1,'proof','proof-2');
  if pg_temp.at((r->>'stampId')::uuid) <> '3/2' or (r->>'points')::int <> 100 then raise exception 'second proof %, at %', r, pg_temp.at((r->>'stampId')::uuid); end if;
  r := public.claim_passport_page(ua,c1,2,'stk-claim-2');
  if (r->>'hearts')::int <> 1 or public.passport_hearts(ua,c1) <> 1 then raise exception 'claim %', r; end if;
  r2 := public.claim_passport_page(ua,c1,2,'stk-claim-2-again');
  if not (r2->>'replayed')::boolean or public.passport_hearts(ua,c1) <> 1 then raise exception 'claim replay %', r2; end if;
  -- the day's first claim issues a cheer stamp, which takes no slot, so a claim cannot pay for the next one
  if r->>'cheerStampId' is null or pg_temp.at((r->>'cheerStampId')::uuid) is not null then raise exception 'cheer stamp placed %', r; end if;
  k := k + 1;

  -- ===== void and delete corrections take the slot back =====
  -- unclaimed page: the count drops, the claim locks again, and the next stamp fills the hole first
  for i in 1..7 loop perform pg_temp.act(ua,c1,'survey','page3-'||i); end loop;
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,3)->>'filled')::int <> 9 or not (pg_temp.page(road,3)->>'claimable')::boolean then raise exception 'page 3 must be full %', pg_temp.page(road,3); end if;
  s1 := (select stamp_id from public.passport_page_slots where passport_id=pa and page_no=3 and slot_no=4);
  r := public.void_passport_stamp(adm,s1,'stack void',false,'stk-void-1');
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,3)->>'filled')::int <> 8 or (pg_temp.page(road,3)->>'claimable')::boolean then raise exception 'void did not drop page 3 %', pg_temp.page(road,3); end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,3,%L)',ua,c1,'stk-claim-3'),'PASSPORT_PAGE_NOT_COMPLETE');
  r := pg_temp.act(ua,c1,'survey','hole');
  if pg_temp.at((r->>'stampId')::uuid) <> '3/4' then raise exception 'next stamp must fill the hole, got %', pg_temp.at((r->>'stampId')::uuid); end if;
  -- claimed page: the void leaves the heart, and refilling pays no second heart
  s1 := (select stamp_id from public.passport_page_slots where passport_id=pa and page_no=2 and slot_no=1);
  perform public.void_passport_stamp(adm,s1,'claimed void',false,'stk-void-2');
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,2)->>'filled')::int <> 8 or not (pg_temp.page(road,2)->>'claimed')::boolean or public.passport_hearts(ua,c1) <> 1 then raise exception 'claimed page after a void %', pg_temp.page(road,2); end if;
  r := pg_temp.act(ua,c1,'survey','refill-claimed');
  if pg_temp.at((r->>'stampId')::uuid) <> '2/1' then raise exception 'claimed hole %', pg_temp.at((r->>'stampId')::uuid); end if;
  r := public.claim_passport_page(ua,c1,2,'stk-claim-2-third');
  if not (r->>'replayed')::boolean or public.passport_hearts(ua,c1) <> 1 then raise exception 'a refilled claimed page paid again %', r; end if;
  -- a post on page 2 deleted through the correction path takes its slot and its points back once
  r := pg_temp.act(uc,c1,'post','stk-post-old',jsonb_build_object('chars',30));
  update public.passport_page_slots set stamp_id = null, assigned_at = null, cleared_at = now() where passport_id=pc and page_no=1 and slot_no=3;
  s1 := pg_temp.mkstamp(uc,c1,'post','stk-post-filler',now() - interval '2 days');
  update public.passport_page_slots set stamp_id = s1, assigned_at = now(), cleared_at = null where passport_id=pc and page_no=1 and slot_no=3;
  s1 := (r->>'stampId')::uuid;
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pc,2,1,s1,now());
  bal := public.group_wallet_balance(uc,'fan_point');
  if public.dukjil_correct_content_grant(uc,uc,'post','stk-post-old','content_deleted') <> 'corrected' then raise exception 'delete correction'; end if;
  if public.group_wallet_balance(uc,'fan_point') <> bal - 20 or pg_temp.at(s1) is not null then raise exception 'delete kept the slot or the points'; end if;
  if public.dukjil_correct_content_grant(uc,uc,'post','stk-post-old','content_deleted') <> 'replayed' or public.group_wallet_balance(uc,'fan_point') <> bal - 20 then raise exception 'delete corrected twice'; end if;
  k := k + 1;

  -- ===== voided stamps leave the owner's collection and the counts =====
  n := jsonb_array_length(public.get_owned_community_stamps(ud,null)->'stamps');
  before_count := (public.read_owned_mobile_profile(ud,'ko')->'counts'->>'stamps')::int;
  r := public.create_community_stamp_share_link(ud,'stk-1'); share_token := r->>'token';
  shared_count := (public.read_shared_passport_activity(share_token)->>'stampCount')::int;
  r := pg_temp.act(ud,c1,'survey','seen-1'); s1 := (r->>'stampId')::uuid;
  r := pg_temp.act(ud,c1,'survey','seen-2'); s2 := (r->>'stampId')::uuid;
  if jsonb_array_length(public.get_owned_community_stamps(ud,null)->'stamps') <> n + 2 then raise exception 'collection before void'; end if;
  if (public.read_owned_mobile_profile(ud,'ko')->'counts'->>'stamps')::int <> before_count + 2 then raise exception 'profile count before void'; end if;
  insert into public.mobile_passport_public_stamps(app_user_id,celebrity_id,fan_passport_id,stamp_source,stamp_id) values(ud,c1,pd,'community',s1),(ud,c1,pd,'community',s2);
  if public.read_owned_mobile_passport_public_stamp_count(ud,pd) <> 2 then raise exception 'public count before void'; end if;
  if (public.read_shared_passport_activity(share_token)->>'stampCount')::int <> shared_count + 2 then raise exception 'shared passport count before void'; end if;
  perform public.void_passport_stamp(adm,s1,'seen',false,'stk-void-3');
  if position(s1::text in public.get_owned_community_stamps(ud,null)::text) > 0 or position(s2::text in public.get_owned_community_stamps(ud,null)::text) = 0 then raise exception 'voided stamp still listed'; end if;
  if (public.get_owned_community_stamps(ud,null)->>'today') is null then raise exception 'today field lost'; end if;
  if jsonb_array_length(public.get_owned_community_stamps(ud,null)->'stamps') <> n + 1 then raise exception 'collection after void'; end if;
  if (public.read_owned_mobile_profile(ud,'ko')->'counts'->>'stamps')::int <> before_count + 1 or (public.read_owned_mobile_profile(ud,'ko')->'passports'->>'stampCount')::int <> before_count + 1 then raise exception 'profile counts after void'; end if;
  if public.read_owned_mobile_passport_public_stamp_count(ud,pd) <> 1 then raise exception 'public count after void'; end if;
  if (public.read_shared_passport_activity(share_token)->>'stampCount')::int <> shared_count + 1 then raise exception 'shared passport still counts a voided stamp: %', public.read_shared_passport_activity(share_token)->>'stampCount'; end if;
  -- the daily stamp limit still counts a voided stamp, so a void does not hand the day's stamp back
  r := pg_temp.act(ud,c1,'post','limit-1',jsonb_build_object('chars',30));
  perform public.void_passport_stamp(adm,(r->>'stampId')::uuid,'limit',false,'stk-void-4');
  r := pg_temp.act(ud,c1,'post','limit-2',jsonb_build_object('chars',30));
  if r->>'stampId' is not null then raise exception 'a void handed the daily stamp back %', r; end if;
  k := k + 1;

  raise notice 'passport stacking pages: % assertion groups passed', k;
end $$;

select 'passport stacking pages verification passed' as result;
rollback;
