-- PASSPORT-RENEWAL P1 assertions (contract §9 P1). Disposable clean-chain DB only; everything rolls back.
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

-- FIX3: a qualified general-fan invitation (inviter -> friend, screening passed on page cel). Fires the real wire trigger.
create function pg_temp.qrel(inviter uuid, friend uuid, cel uuid) returns uuid language plpgsql as $$
declare qp uuid := extensions.gen_random_uuid(); rid uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(qp,friend,cel,extensions.gen_random_uuid());
  insert into public.community_stamp_invite_codes(app_user_id,code) values(inviter,upper(substr(md5(inviter::text),1,24))) on conflict do nothing;
  insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
    values(rid,inviter,friend,upper(substr(md5(inviter::text),1,24)));
  insert into public.community_stamp_invitation_relations(redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version)
    values(rid,inviter,friend,(select min(version) from public.community_stamp_invitation_policy_versions));
  set local session_replication_role = origin;
  update public.community_stamp_invitation_relations set status='qualified',qualifying_quiz_pass_id=qp,qualified_at=now(),
    qualified_sequence=(select coalesce(max(qualified_sequence),0)+1 from public.community_stamp_invitation_relations where inviter_app_user_id=inviter)
    where redemption_id=rid;
  return rid;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'd1100000-0000-4000-8000-000000000001'; c2 uuid := 'd1100000-0000-4000-8000-000000000002';
  c3 uuid := 'd1100000-0000-4000-8000-000000000003';
  u1 uuid := 'd1100000-0000-4000-8000-000000000011'; u2 uuid := 'd1100000-0000-4000-8000-000000000012';
  u3 uuid := 'd1100000-0000-4000-8000-000000000013'; u4 uuid := 'd1100000-0000-4000-8000-000000000014';
  nopass uuid := 'd1100000-0000-4000-8000-000000000016';
  cs uuid[] := array[c1,c2,c3]; us uuid[] := array[u1,u2,u3,u4,nopass];
  i integer; t integer; r jsonb; r2 jsonb; n integer; bal bigint; before_bal bigint; k text;
  midnight timestamptz := (public.dukjil_kst_date()::timestamp at time zone 'Asia/Seoul');
begin
  for i in 1..3 loop
    insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
      values(cs[i],'dukjil-p1-'||i,'draft','/d.webp',null,'{artist}','idol');
    insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
      (cs[i],'ko','덕질'||i,'덕질','덕질'),(cs[i],'en','Dukjil'||i,'Dukjil','Dukjil');
    update public.celebrities set status='published' where id=cs[i];
  end loop;
  for i in 1..5 loop
    insert into public.app_users(id,privy_user_id,verified_email,status)
      values(us[i],'did:privy:dukjil-'||i,'dukjil-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values(us[i],91342,'0xdddddddddddddddddddddddddddddddddddd00'||lpad(i::text,2,'0'),'privy','embedded');
  end loop;
  set local session_replication_role = replica;
  for i in 1..4 loop
    for t in 1..3 loop
      insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
        (('d1100000-0000-4000-8000-0000000'||lpad((100+i*10+t)::text,5,'0'))::uuid,'passport',
         ('d1100000-0000-4000-8000-0000000'||lpad((200+i*10+t)::text,5,'0'))::uuid,'dukjil-fixture-'||i||'-'||t,1,
         jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd00'||lpad(i::text,2,'0'),'celebritySlug','dukjil-p1-'||t,'passportId','0x'||repeat('1',64)));
      insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
        (('d1100000-0000-4000-8000-0000000'||lpad((200+i*10+t)::text,5,'0'))::uuid,us[i],cs[t],extensions.gen_random_uuid(),
         ('d1100000-0000-4000-8000-0000000'||lpad((100+i*10+t)::text,5,'0'))::uuid);
    end loop;
  end loop;
  set local session_replication_role = origin;

  -- ===== draft: nothing changes =====
  if public.dukjil_policy_replaces_earning() then raise exception 'draft must not replace earning'; end if;
  perform pg_temp.expect_error(format('select public.attend_creator(%L,%L,%L)',u1,c1,extensions.gen_random_uuid()),'POLICY_INACTIVE');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L)',u1,c1,'share','s0',extensions.gen_random_uuid()),'POLICY_INACTIVE');
  r := public.check_in_owned_group_wallet(u4, extensions.gen_random_uuid());
  if r is null then raise exception 'legacy attendance should still run in draft'; end if;
  perform pg_temp.expect_error('select public.activate_dukjil_policy(1, now())','DUKJIL_EFFECTIVE_FROM_INVALID');

  -- P1-WIRE draft: hooks are no-ops while the policy is draft
  set local session_replication_role = replica;
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values('d1100000-0000-4000-8000-000000000513',u4,c3,'d1100000-0000-4000-8000-000000000514',1,extensions.gen_random_uuid(),'passed',3,now());
  set local session_replication_role = origin;
  insert into public.quiz_passes(app_user_id,celebrity_id,winning_attempt_id) values(u4,c3,'d1100000-0000-4000-8000-000000000513');
  select count(*) into n from public.dukjil_action_log where app_user_id=u4 and action_key='quiz';
  if n <> 0 then raise exception 'draft quiz hook wrote % rows', n; end if;
  delete from public.quiz_passes where app_user_id=u2 and celebrity_id=c1;

  -- ===== KST midnight boundary =====
  if public.dukjil_kst_date('2026-11-05 14:59:59+00') <> date '2026-11-05' or public.dukjil_kst_date('2026-11-05 15:00:00+00') <> date '2026-11-06' then
    raise exception 'KST boundary wrong'; end if;

  -- ===== before the conversion date: future effective_from rejects =====
  begin
    update public.dukjil_policy_versions set status='active', effective_from=now()+interval '1 day', activated_at=now() where version=1;
    if public.dukjil_policy_replaces_earning() then raise exception 'future policy must not replace earning'; end if;
    perform pg_temp.expect_error(format('select public.attend_creator(%L,%L,%L)',u1,c1,extensions.gen_random_uuid()),'POLICY_INACTIVE');
    raise exception 'ROLLBACK_PROBE';
  exception when others then if sqlerrm <> 'ROLLBACK_PROBE' then raise; end if; end;
  if (select status from public.dukjil_policy_versions where version=1) <> 'draft' then raise exception 'probe not rolled back'; end if;

  -- ===== activate (dev style direct update) =====
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  if not public.dukjil_policy_replaces_earning() then raise exception 'active policy expected'; end if;

  -- old attendance blocked
  perform pg_temp.expect_error(format('select public.check_in_owned_group_wallet(%L,%L)',u4,extensions.gen_random_uuid()),'DUKJIL_ATTENDANCE_MOVED');
  -- old earning funnel returns not_eligible
  r := public.award_mobile_fan_activity(u4, c1, 'comment', 'x');
  if r->>'status' <> 'not_eligible' then raise exception 'legacy award not frozen: %', r; end if;

  -- ===== attendance =====
  perform pg_temp.expect_error(format('select public.attend_creator(%L,%L,%L)',nopass,c1,extensions.gen_random_uuid()),'PASSPORT_REQUIRED');
  before_bal := public.group_wallet_balance(u1,'fan_point');
  k := extensions.gen_random_uuid()::text;
  r := public.attend_creator(u1,c1,k::uuid);
  if (r->>'points')::int <> 2 or (r->>'streak')::int <> 1 or (r->>'replayed')::boolean then raise exception 'attend result %', r; end if;
  r2 := public.attend_creator(u1,c1,k::uuid);
  if not (r2->>'replayed')::boolean then raise exception 'request replay expected'; end if;
  r2 := public.attend_creator(u1,c1,extensions.gen_random_uuid());
  if not (r2->>'replayed')::boolean then raise exception 'same-day replay expected'; end if;
  select count(*) into n from public.group_creator_attendance where app_user_id=u1 and celebrity_id=c1;
  if n <> 1 then raise exception 'attendance rows %', n; end if;
  -- fan_point paid exactly once across both ledgers (mobile economy + legacy score/ticket trigger path)
  bal := public.group_wallet_balance(u1,'fan_point') - before_bal;
  if bal <> 2 then raise exception 'fan_point delta %, wanted 2', bal; end if;
  select count(*) into n from public.mobile_fan_economy_ledger where app_user_id=u1 and asset='fan_point' and source_type='dukjil_action';
  if n <> 1 then raise exception 'fan_point ledger rows %', n; end if;
  select count(*) into n from public.community_stamps where app_user_id=u1 and celebrity_id=c1 and kind='daily_checkin';
  if n <> 1 then raise exception 'daily stamp rows %', n; end if;
  -- legacy daily key keeps ticket trigger path
  select count(*) into n from public.community_stamps where app_user_id=u1 and source_key='daily-checkin:'||c1||':'||public.dukjil_kst_date();
  if n <> 1 then raise exception 'legacy daily key missing'; end if;

  -- ===== stamp cap and user-wide point cap (share: 10 pts, 3/day per user, 1 stamp per creator/day) =====
  r := public.record_dukjil_action(u2,c1,'share','sh1',extensions.gen_random_uuid());
  if (r->>'points')::int <> 10 then raise exception 'share1 %', r; end if;
  r := public.record_dukjil_action(u2,c1,'share','sh2',extensions.gen_random_uuid());
  select count(*) into n from public.community_stamps where app_user_id=u2 and celebrity_id=c1 and kind='share';
  if n <> 1 then raise exception 'share stamp cap per creator/day: % rows', n; end if;
  r := public.record_dukjil_action(u2,c2,'share','sh3',extensions.gen_random_uuid());
  if (r->>'points')::int <> 10 then raise exception 'share3 %', r; end if;
  begin
    r := public.record_dukjil_action(u2,c3,'share','sh4',extensions.gen_random_uuid());
    if (r->>'points')::int <> 0 then raise exception 'share4 must be capped, got %', r; end if;
  exception when others then if sqlerrm not like '%DUKJIL_DAILY_LIMIT%' then raise; end if; end;
  select coalesce(sum(amount),0) into bal from public.mobile_fan_economy_ledger where app_user_id=u2 and asset='fan_point' and source_type='dukjil_action';
  if bal <> 30 then raise exception 'user-wide share cap broken: %', bal; end if;
  -- source reuse with other request key
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L)',u2,c1,'share','sh1',extensions.gen_random_uuid()),'SOURCE_REUSED');
  -- idempotent replay by request key
  k := extensions.gen_random_uuid()::text;
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L)',u3,c1,'comment','cm0',extensions.gen_random_uuid()),'DUKJIL_CONTENT_TOO_SHORT');
  r := public.record_dukjil_action(u3,c1,'comment','cm1',k::uuid,'{"chars":12}');
  r2 := public.record_dukjil_action(u3,c1,'comment','cm1',k::uuid,'{"chars":12}');
  if not (r2->>'replayed')::boolean then raise exception 'action replay expected'; end if;
  select count(*) into n from public.dukjil_action_log where app_user_id=u3;
  if n <> 1 then raise exception 'action log rows %', n; end if;

  -- ===== D4: slot 6 needs an invite; no 2-share substitute in the seed =====
  if exists(select 1 from public.dukjil_policy_versions, jsonb_array_elements(mission_book->'pages'->0->'slots') sl
            where version=1 and (sl->>'slot')::int=6 and (sl ? 'alt' or sl->>'action'<>'invite')) then
    raise exception 'slot 6 must be invite only'; end if;
  if (select rules->'gate'->>'companion' from public.dukjil_policy_versions where version=1) <> 'invite' then
    raise exception 'companion must be invite'; end if;
  -- two shares on two days never create an invite stamp
  select count(*) into n from public.community_stamps where app_user_id=u2 and kind='invite';
  if n <> 0 then raise exception 'shares must not fill the invite slot'; end if;

  -- ===== ticket path untouched: award_fan_ticket_activity exists and is not guarded =====
  if position('dukjil_policy_replaces_earning' in pg_get_functiondef('public.award_fan_ticket_activity(uuid,uuid,text,text,boolean)'::regprocedure)) > 0 then
    raise exception 'ticket award must not be guarded'; end if;

  -- ===== fan score freeze after activation =====
  if not public.dukjil_policy_replaces_earning() then raise exception 'freeze precondition'; end if;
end $$;

-- ===== P1-WIRE: every action that the old paths paid now calls record_dukjil_action exactly once =====
do $$
declare
  c1 uuid := 'd1100000-0000-4000-8000-000000000001'; c2 uuid := 'd1100000-0000-4000-8000-000000000002';
  u1 uuid := 'd1100000-0000-4000-8000-000000000011'; u2 uuid := 'd1100000-0000-4000-8000-000000000012';
  u3 uuid := 'd1100000-0000-4000-8000-000000000013'; u4 uuid := 'd1100000-0000-4000-8000-000000000014';
  ev uuid := 'd1100000-0000-4000-8000-000000000501'; qz uuid := 'd1100000-0000-4000-8000-000000000502';
  qa uuid := 'd1100000-0000-4000-8000-000000000503'; pg uuid := 'd1100000-0000-4000-8000-000000000504';
  gev uuid := 'd1100000-0000-4000-8000-000000000505'; gms uuid := 'd1100000-0000-4000-8000-000000000506';
  gsub uuid := 'd1100000-0000-4000-8000-000000000507'; inv uuid := 'd1100000-0000-4000-8000-000000000508';
  lnk uuid := 'd1100000-0000-4000-8000-000000000509'; br uuid := 'd1100000-0000-4000-8000-00000000050a';
  n integer; before_bal bigint; pid uuid; fails integer;
begin
  select id into pid from public.fan_passports where app_user_id=u1 and celebrity_id=c1;

  -- quiz
  set local session_replication_role = replica;
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(qa,u2,c1,qz,1,extensions.gen_random_uuid(),'passed',3,now());
  set local session_replication_role = origin;
  insert into public.quiz_passes(app_user_id,celebrity_id,winning_attempt_id) values(u2,c1,qa);
  select count(*) into n from public.dukjil_action_log where app_user_id=u2 and action_key='quiz' and source_key='quiz:'||c1;
  if n <> 1 then raise exception 'wire quiz rows %', n; end if;

  -- live reserve / attend
  set local session_replication_role = replica;
  insert into public.brands(id,slug,status,logo_url,logo_alt) values(br,'dukjil-wire-brand','draft','/d.webp','b');
  insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,external_live_url,approved_hero_url,fan_code_hash,attendance_valid_from,attendance_valid_until)
    values(ev,'dukjil-wire-live',c1,br,now()+interval '2 days',now()+interval '3 days',now()-interval '1 day',now()+interval '1 day',
      'https://www.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','/d.webp','$2b$10$'||repeat('a',53),now()-interval '1 hour',now()+interval '1 day');
  set local session_replication_role = origin;
  insert into public.live_reservations(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key) values(u1,ev,c1,pid,extensions.gen_random_uuid());
  insert into public.live_attendances(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key) values(u1,ev,c1,pid,extensions.gen_random_uuid());
  select count(*) into n from public.dukjil_action_log where app_user_id=u1 and action_key='live_reserve' and source_key=ev::text;
  if n <> 1 then raise exception 'wire live_reserve rows %', n; end if;
  select count(*) into n from public.dukjil_action_log where app_user_id=u1 and action_key='live_attend' and source_key=ev::text;
  if n <> 1 then raise exception 'wire live_attend rows %', n; end if;

  -- share: two visitors on the same day => one payout per owner/creator/day
  set local session_replication_role = replica;
  insert into public.community_stamp_share_links(id,token,owner_app_user_id,celebrity_id,fan_passport_id)
    values(lnk,repeat('c',32),u3,c1,(select id from public.fan_passports where app_user_id=u3 and celebrity_id=c1));
  set local session_replication_role = origin;
  insert into public.community_stamp_share_visits(share_link_id,visitor_app_user_id) values(lnk,u1);
  insert into public.community_stamp_share_visits(share_link_id,visitor_app_user_id) values(lnk,u2);
  select count(*) into n from public.dukjil_action_log where app_user_id=u3 and action_key='share';
  if n <> 1 then raise exception 'wire share rows %', n; end if;
  if not exists(select 1 from public.dukjil_action_log where app_user_id=u3 and action_key='share' and source_key=c1||':'||public.dukjil_kst_date()) then
    raise exception 'share source key must be creator:KSTdate'; end if;

  -- group page: event check-in and review, group mission, invitation
  insert into public.group_pages(id,kind,celebrity_id,name) values(pg,'fan',c2,'wire page');
  set local session_replication_role = replica;
  insert into public.group_events(id,page_id,title,starts_at,ends_at,opens_at,closes_at,location,state,created_by)
    values(gev,pg,'e',now()+interval '1 day',now()+interval '2 days',now()-interval '1 day',now()+interval '1 day','here','published',u3);
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(gms,pg,'m','m','published',120,1000,extensions.gen_random_uuid());
  insert into public.group_memberships(page_id,app_user_id,role) values(pg,u4,'member');
  insert into public.group_event_registrations(event_id,app_user_id,status) values(gev,u4,'confirmed');
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body) values(gsub,gms,u4,'done');
  set local session_replication_role = origin;
  update public.group_event_registrations set checked_in_at=now() where event_id=gev and app_user_id=u4;
  update public.group_event_registrations set checked_in_at=now() where event_id=gev and app_user_id=u4;
  select count(*) into n from public.dukjil_action_log where app_user_id=u4 and action_key='event_checkin' and source_key=gev::text;
  if n <> 1 then raise exception 'wire event_checkin rows %', n; end if;
  update public.group_event_registrations set review_body=repeat('후기',20), reviewed_at=now() where event_id=gev and app_user_id=u4;
  select count(*) into n from public.dukjil_action_log where app_user_id=u4 and action_key='event_review' and source_key=gev::text;
  if n <> 1 then raise exception 'wire event_review rows %', n; end if;

  before_bal := public.group_wallet_balance(u4,'fan_point');
  update public.group_mission_submissions set status='completed', reviewed_at=now() where id=gsub;
  select count(*) into n from public.dukjil_action_log where app_user_id=u4 and action_key='mission' and source_key=gsub::text;
  if n <> 1 then raise exception 'wire group mission rows %', n; end if;
  update public.group_mission_submissions set reviewed_at=now() where id=gsub;
  select count(*) into n from public.mobile_fan_economy_ledger where app_user_id=u4 and source_type='group_mission';
  if n <> 0 then raise exception 'group mission paid through the old path too: % rows', n; end if;
  select count(*) into n from public.mobile_fan_economy_ledger l join public.dukjil_action_log a on a.ledger_id=l.id
    where a.app_user_id=u4 and a.action_key='mission';
  if n <> 1 then raise exception 'group mission ledger rows %', n; end if;
  if not exists(select 1 from public.dukjil_action_log where app_user_id=u4 and action_key='mission' and points = 120) then
    raise exception 'group mission must pay the page reward amount'; end if;

  -- invitation (general-fan referral): inviter and friend are paid once when the friend's relation is qualified
  perform pg_temp.qrel(u1, u3, c1);
  select count(*) into n from public.dukjil_action_log where action_key='invite' and source_key='invite:'||md5('friend:'||u3::text)::uuid::text;
  if n <> 1 then raise exception 'invite must be global once per friend: % rows; failures %', n, (select coalesce(jsonb_agg(error_message),'[]') from public.dukjil_wire_failures); end if;
  select count(*) into n from public.dukjil_action_log where app_user_id=u3 and action_key='invite_friend';
  if n <> 1 then raise exception 'invite_friend rows %', n; end if;

  -- payout failure never fails the original action; the reason is kept
  select count(*) into fails from public.dukjil_wire_failures;
  perform public.dukjil_wire_award('probe', u1, c1, 'no_such_action', 'x');
  select count(*) into n from public.dukjil_wire_failures;
  if n <> fails + 1 then raise exception 'failure reason not recorded'; end if;
  perform public.dukjil_wire_award('probe', u1, c1, 'share', 'cap-probe-1');
  select count(*) into n from public.dukjil_wire_failures where action_key='share';
  if n <> 0 then raise exception 'normal rejection must not be logged as failure'; end if;
  -- ticket path stays unguarded
  if position('dukjil_policy_replaces_earning' in pg_get_functiondef('public.award_fan_ticket_activity(uuid,uuid,text,text,boolean)'::regprocedure)) > 0 then
    raise exception 'ticket award must not be guarded'; end if;
end $$;

-- ===== P1-FIX: plan-v2 section 3.1 conditions judged in the DB =====
do $$
declare
  c1 uuid := 'd1100000-0000-4000-8000-000000000001';
  u1 uuid := 'd1100000-0000-4000-8000-000000000011'; u4 uuid := 'd1100000-0000-4000-8000-000000000014';
  ev uuid := 'd1100000-0000-4000-8000-000000000501';
  sv uuid := 'd1100000-0000-4000-8000-000000000601'; rsp uuid := 'd1100000-0000-4000-8000-000000000602';
  cm uuid := 'd1100000-0000-4000-8000-000000000603'; csub uuid := 'd1100000-0000-4000-8000-000000000604';
  adm uuid := 'd1100000-0000-4000-8000-000000000605';
  h1 text := repeat('a',64); h2 text := repeat('b',64);
  n integer; r jsonb;
begin
  -- D15: no open boost in the seed
  if exists(select 1 from public.dukjil_policy_versions where rules ? 'openBoost') then raise exception 'openBoost must not be in any policy'; end if;

  -- same body is excluded for the recent window; a different body is not
  r := public.record_dukjil_action(u1,c1,'post','fix-p1',extensions.gen_random_uuid(),jsonb_build_object('chars',80,'bodyHash',h1));
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L::jsonb)',u1,c1,'post','fix-p2',extensions.gen_random_uuid(),
    jsonb_build_object('chars',80,'bodyHash',h1)::text),'DUKJIL_DUPLICATE_BODY');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L::jsonb)',u1,c1,'post','fix-p3',extensions.gen_random_uuid(),
    jsonb_build_object('chars',80,'bodyHash','nothex')::text),'DUKJIL_PARAMS_INVALID');
  r := public.record_dukjil_action(u1,c1,'post','fix-p4',extensions.gen_random_uuid(),jsonb_build_object('chars',80,'bodyHash',h2));
  if (r->>'points')::int <= 0 then raise exception 'different body must pay: %', r; end if;
  if (select count(*) from public.dukjil_action_log where app_user_id=u1 and action_key='post' and source_key='fix-p2') <> 0 then
    raise exception 'duplicate body must not be logged as paid'; end if;

  -- one comment payout per post
  r := public.record_dukjil_action(u4,c1,'comment','fix-c1',extensions.gen_random_uuid(),'{"chars":12,"targetKey":"postA"}');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L::jsonb)',u4,c1,'comment','fix-c2',extensions.gen_random_uuid(),
    '{"chars":12,"targetKey":"postA"}'),'DUKJIL_REPEAT_TARGET');
  r := public.record_dukjil_action(u4,c1,'comment','fix-c3',extensions.gen_random_uuid(),'{"chars":12,"targetKey":"postB"}');
  if (r->>'points')::int <= 0 then raise exception 'another post must pay: %', r; end if;

  -- the rejection codes are normal rejections (not failure rows)
  if not (public.dukjil_wire_is_normal_rejection('DUKJIL_DUPLICATE_BODY') and public.dukjil_wire_is_normal_rejection('DUKJIL_REPEAT_TARGET')) then
    raise exception 'new codes must be normal rejections'; end if;

  -- survey: one submitted event => one payout, replays and later updates pay nothing more
  set local session_replication_role = replica;
  insert into public.live_survey_responses(id,app_user_id,live_event_id,celebrity_id,survey_id,attendance_id,passport_id,status)
    values(rsp,u1,ev,c1,sv,extensions.gen_random_uuid(),(select id from public.fan_passports where app_user_id=u1 and celebrity_id=c1),'draft');
  set local session_replication_role = origin;
  -- fixture rows have no parents: keep the row-level checks off, keep the wire trigger on
  alter table public.live_survey_responses disable trigger all;
  alter table public.live_survey_responses enable trigger zzz_dukjil_wire;
  update public.live_survey_responses set updated_at=now() where id=rsp;
  if (select count(*) from public.dukjil_action_log where app_user_id=u1 and action_key='survey') <> 0 then raise exception 'draft must not pay'; end if;
  update public.live_survey_responses set status='submitted', submitted_at=now() where id=rsp;
  update public.live_survey_responses set updated_at=now() where id=rsp;
  select count(*) into n from public.dukjil_action_log where app_user_id=u1 and action_key='survey' and source_key=sv::text;
  if n <> 1 then raise exception 'survey rows %; failures %', n, (select coalesce(jsonb_agg(error_message),'[]') from public.dukjil_wire_failures where action_key='survey'); end if;
  select count(*) into n from public.mobile_fan_economy_ledger l join public.dukjil_action_log a on a.ledger_id=l.id where a.app_user_id=u1 and a.action_key='survey';
  if n <> 1 then raise exception 'survey ledger rows %', n; end if;

  -- subscription: approval of a membership proof pays once per creator/platform
  set local session_replication_role = replica;
  insert into public.admin_allowlist(id,email,role) values(adm,'dukjil-admin@byus.test',(enum_range(null::public.admin_role))[1]);
  insert into public.certification_submissions(id,app_user_id,celebrity_id,mission_id,mission_revision,reward_revision_id,reward_revision,
      reward_policy_version,reward_score_points,reward_ticket_amount,attempt_number,idempotency_key,request_hash,status,membership_platform)
    values(csub,u1,c1,cm,1,extensions.gen_random_uuid(),1,1,1,0,1,extensions.gen_random_uuid(),repeat('c',64),'pending','youtube');
  set local session_replication_role = origin;
  alter table public.certification_submissions disable trigger all;
  alter table public.certification_submissions enable trigger zzz_dukjil_wire;
  if (select count(*) from public.dukjil_action_log where app_user_id=u1 and action_key='subscription') <> 0 then raise exception 'pending must not pay'; end if;
  update public.certification_submissions set status='approved', reviewed_by_app_user_id=u4, reviewed_by_admin_allowlist_id=adm, reviewed_at=now() where id=csub;
  update public.certification_submissions set updated_at=now() where id=csub;
  select count(*) into n from public.dukjil_action_log where app_user_id=u1 and action_key='subscription' and source_key=c1::text||':youtube';
  if n <> 1 then raise exception 'subscription rows %; failures %', n, (select coalesce(jsonb_agg(error_message),'[]') from public.dukjil_wire_failures where action_key='subscription'); end if;

  -- event review needs a check-in; the owner opening their own share link pays nothing
  if exists(select 1 from public.dukjil_action_log where action_key='event_review' and app_user_id not in (select app_user_id from public.group_event_registrations where checked_in_at is not null)) then
    raise exception 'review paid without check-in'; end if;
end $$;

-- retry: capped, deduplicated, idempotent
do $$
declare u1 uuid := 'd1100000-0000-4000-8000-000000000011'; c1 uuid := 'd1100000-0000-4000-8000-000000000001'; n integer; g timestamptz;
begin
  perform public.dukjil_wire_award('r1', u1, c1, 'no_such_action', 'retry-x');
  perform public.dukjil_wire_award('r2', u1, c1, 'no_such_action', 'retry-x');
  select count(*) into n from public.dukjil_wire_failures where action_key='no_such_action' and source_key='retry-x' and resolved_at is null;
  if n <> 1 then raise exception 'open failure rows must be deduplicated: %', n; end if;
  for i in 1..6 loop perform public.retry_dukjil_wire_failures(); end loop;
  select gave_up_at into g from public.dukjil_wire_failures where action_key='no_such_action' and source_key='retry-x';
  if g is null then raise exception 'a failing row must be given up after the attempt cap'; end if;
  if (select attempts from public.dukjil_wire_failures where action_key='no_such_action' and source_key='retry-x') <> 5 then raise exception 'attempt cap'; end if;
  if not exists(select 1 from cron.job where jobname='dukjil-wire-retry') then raise exception 'retry schedule missing'; end if;
end $$;

-- ===== P1-FIX2: M4 replacement, B1 mission range, M1 legacy stamps, M3 direct inserts, invite stamp =====
do $$
declare
  c1 uuid := 'd1100000-0000-4000-8000-000000000001'; c2 uuid := 'd1100000-0000-4000-8000-000000000002';
  u1 uuid := 'd1100000-0000-4000-8000-000000000011'; u2 uuid := 'd1100000-0000-4000-8000-000000000012';
  u3 uuid := 'd1100000-0000-4000-8000-000000000013'; u4 uuid := 'd1100000-0000-4000-8000-000000000014';
  nopass uuid := 'd1100000-0000-4000-8000-000000000016';
  lg uuid := 'd1100000-0000-4000-8000-000000000017';
  pg uuid := 'd1100000-0000-4000-8000-000000000504'; gms uuid := 'd1100000-0000-4000-8000-000000000506';
  oldms uuid := 'd1100000-0000-4000-8000-000000000701'; oldsub uuid := 'd1100000-0000-4000-8000-000000000702';
  sv2 uuid := 'd1100000-0000-4000-8000-000000000703'; rsp2 uuid := 'd1100000-0000-4000-8000-000000000704';
  csub2 uuid := 'd1100000-0000-4000-8000-000000000705'; adm uuid := 'd1100000-0000-4000-8000-000000000605';
  rev jsonb; fails_before integer; n integer; k integer; pts integer;
begin
  -- M4: a replacement is refused, the current policy stays untouched
  insert into public.dukjil_policy_versions(version,status,rules,mission_book,note)
    select 2,'draft',rules,mission_book,'replacement probe' from public.dukjil_policy_versions where version=1;
  perform pg_temp.expect_error('select public.activate_dukjil_policy(2)','DUKJIL_REPLACEMENT_UNSUPPORTED');
  if (select status from public.dukjil_policy_versions where version=1) <> 'active' then raise exception 'v1 must stay active'; end if;
  if (select status from public.dukjil_policy_versions where version=2) <> 'draft' then raise exception 'v2 must stay draft'; end if;

  -- B1: with an active policy a mission reward outside 50..300 is refused on create and on edit; 0 is allowed
  select count(*) into fails_before from public.dukjil_wire_failures;
  perform pg_temp.expect_error(format($f$insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(%L,%L,'big','big','published',500,5000,%L)$f$, extensions.gen_random_uuid(), pg, extensions.gen_random_uuid()),'DUKJIL_MISSION_REWARD_RANGE');
  perform pg_temp.expect_error(format('update public.group_missions set reward_points=500 where id=%L', gms),'DUKJIL_MISSION_REWARD_RANGE');
  perform pg_temp.expect_error(format('update public.group_missions set reward_points=10 where id=%L', gms),'DUKJIL_MISSION_REWARD_RANGE');
  update public.group_missions set reward_points=0, reward_approved_by=adm where id=gms;
  update public.group_missions set reward_points=120 where id=gms;

  -- a mission created before activation keeps paying the value shown to members (no silent loss, no cut)
  set local session_replication_role = replica;
  insert into public.group_missions(id,page_id,title,instructions,state,reward_points,reward_budget,reward_approved_by)
    values(oldms,pg,'old','old','published',500,5000,adm);
  insert into public.group_mission_submissions(id,mission_id,app_user_id,body) values(oldsub,oldms,u3,'done');
  set local session_replication_role = origin;
  update public.group_mission_submissions set status='completed', reviewed_at=now() where id=oldsub;
  select points into pts from public.dukjil_action_log where app_user_id=u3 and action_key='mission' and source_key=oldsub::text;
  if pts is distinct from 500 then raise exception 'pre-activation mission must pay its shown 500, paid %; failures %', pts,
    (select coalesce(jsonb_agg(error_message),'[]') from public.dukjil_wire_failures); end if;
  -- editing other fields of that mission keeps working (the reward is unchanged)
  update public.group_missions set title='old edited' where id=oldms;
  select count(*) into n from public.dukjil_wire_failures;
  if n <> fails_before then raise exception 'mission range must leave no failure rows: % -> %', fails_before, n; end if;

  -- M1: legacy (policy-less) subscription / share stamps stay unique per creator; policy-issued ones may repeat
  set local session_replication_role = replica;
  insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,blockchain_job_id)
    values(lg,c1,'subscription','legacy-sub-a',extensions.gen_random_uuid());
  insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,blockchain_job_id,policy_version)
    values(lg,c1,'share','policy-share-a',extensions.gen_random_uuid(),1);
  insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,blockchain_job_id,policy_version)
    values(lg,c1,'share','policy-share-b',extensions.gen_random_uuid(),1);
  begin
    insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,blockchain_job_id)
      values(lg,c1,'subscription','legacy-sub-b',extensions.gen_random_uuid());
    raise exception 'a legacy duplicate subscription stamp must stay blocked';
  exception when unique_violation then null; end;
  set local session_replication_role = origin;

  -- invite stamp: one per invited friend, at most 3 a month
  set local session_replication_role = replica;
  for k in 1..4 loop
    insert into public.app_users(id,privy_user_id,verified_email,status)
      values(('d1100000-0000-4000-8000-0000000007' || lpad(k::text,2,'0'))::uuid,'did:privy:dukjil-friend-'||k,'dukjil-friend-'||k||'@byus.test','active');
    insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
      values(('d1100000-0000-4000-8000-0000000007' || lpad(k::text,2,'0'))::uuid,c1,extensions.gen_random_uuid(),extensions.gen_random_uuid());
  end loop;
  set local session_replication_role = origin;
  for k in 1..4 loop
    perform pg_temp.qrel(u2, ('d1100000-0000-4000-8000-0000000007' || lpad(k::text,2,'0'))::uuid, c1);
  end loop;
  select count(*) into n from public.community_stamps where app_user_id=u2 and kind='invite' and policy_version is not null;
  if n <> 3 then raise exception 'invite stamps must be per friend and capped at 3 a month: % ; log %; failures %', n, (select coalesce(jsonb_agg(source_key||':'||points),'[]') from public.dukjil_action_log where app_user_id=u2 and action_key='invite'),
    (select coalesce(jsonb_agg(error_message),'[]') from public.dukjil_wire_failures where action_key='invite'); end if;

  -- M3: rows inserted straight in the paid state are paid once; the original insert never fails
  alter table public.live_survey_responses disable trigger all;
  alter table public.live_survey_responses enable trigger zzz_dukjil_wire;
  alter table public.certification_submissions disable trigger all;
  alter table public.certification_submissions enable trigger zzz_dukjil_wire;
  select count(*) into fails_before from public.dukjil_wire_failures;
  insert into public.live_survey_responses(id,app_user_id,live_event_id,celebrity_id,survey_id,attendance_id,passport_id,status,submitted_at)
    values(rsp2,u2,extensions.gen_random_uuid(),c1,sv2,extensions.gen_random_uuid(),(select id from public.fan_passports where app_user_id=u2 and celebrity_id=c1),'submitted',now());
  select count(*) into n from public.dukjil_action_log where app_user_id=u2 and action_key='survey' and source_key=sv2::text;
  if n <> 1 then raise exception 'direct submitted survey rows %', n; end if;
  insert into public.certification_submissions(id,app_user_id,celebrity_id,mission_id,mission_revision,reward_revision_id,reward_revision,
      reward_policy_version,reward_score_points,reward_ticket_amount,attempt_number,idempotency_key,request_hash,status,membership_platform,
      reviewed_by_app_user_id,reviewed_by_admin_allowlist_id,reviewed_at)
    values(csub2,u2,c1,extensions.gen_random_uuid(),1,extensions.gen_random_uuid(),1,1,1,0,1,extensions.gen_random_uuid(),repeat('d',64),'approved','instagram',u4,adm,now());
  select count(*) into n from public.dukjil_action_log where app_user_id=u2 and action_key='subscription' and source_key=c1::text||':instagram';
  if n <> 1 then raise exception 'direct approved subscription rows %', n; end if;
  select count(*) into n from public.dukjil_wire_failures;
  if n <> fails_before then raise exception 'direct inserts must not add failure rows'; end if;
end $$;
rollback;
\ir dukjil_read.sql
\ir dukjil_live_keep.sql
\ir dukjil_fix3.sql
