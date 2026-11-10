-- PR-P1-DB-FIX2: existing LIVE payouts keep paying under an active Dukjil policy (same amounts, same limits, no double pay),
-- and survey / subscription are paid through the real approval RPCs with every trigger left on.
-- Disposable clean-chain DB only; everything rolls back.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;
\ir ../live_participation_fixture.sql

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

-- Creator earning policy with distinctive values for the two per-creator keys.
insert into public.mobile_fan_economy_policies(id,celebrity_id,kind,version,rules,effective_at)
  values(pg_temp.uuid(3),pg_temp.uuid(1),'earning','keep-test',
    jsonb_build_object('verification',1,'reaction',1,'comment',1,'checkin',1,'certification',1,'membership_instagram',1,'membership_tiktok',1,
      'membership_youtube',1,'share',1,'live_reservation',1,'live_attendance',1,'mission_completion',1,'first_clip',9,'journey_completion',7,'invitation_milestone',1),
    now()-interval '1 hour');
insert into public.mobile_fan_earning_cutovers values(pg_temp.uuid(1),pg_temp.uuid(3),now()-interval '1 hour','keep-test');

-- Policy takes over earning.
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

-- seed v1 states the kept payout
do $$ begin
  if (select rules #>> '{liveKept,perCreatorPolicy,0}' from public.dukjil_policy_versions where version=1) <> 'journey_completion'
     or (select rules #>> '{liveKept,perCreatorPolicy,1}' from public.dukjil_policy_versions where version=1) <> 'first_clip' then
    raise exception 'v1 seed must show the kept LIVE payout'; end if;
end $$;

-- ordinary participation key: pays its table value once, a replay pays nothing more
do $$
declare o uuid := pg_temp.uuid(101); c uuid; l uuid; m uuid; src uuid; r jsonb; b0 bigint; b1 bigint;
begin
  l := pg_temp.live(1001, now()-interval '1 minute', now()+interval '2 hours');
  c := pg_temp.cert('keep-comment'); m := pg_temp.mission(l,'comment','image',c);
  b0 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  src := pg_temp.review(o,c,extensions.gen_random_uuid());
  b1 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  perform pg_temp.assert(b1-b0 = public.live_participation_points('comment'), 'ordinary key must pay its table value: '||(b1-b0));
  r := public.live_participation_award(o,m,src);
  perform pg_temp.assert(public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point') = b1, 'replay paid again');
  perform pg_temp.assert((select count(*) from public.live_participation_receipts where app_user_id=o and live_event_id=l) = 1, 'receipt count');
end $$;

-- reservation: the plan pays live_reserve; the old reserve key must not pay on top
do $$
declare o uuid := pg_temp.uuid(110); l uuid; s uuid := extensions.gen_random_uuid(); b0 bigint; b1 bigint; n integer;
begin
  l := pg_temp.live(1002, now()+interval '1 hour', now()+interval '2 hours');
  perform pg_temp.mission(l,'reserve','reservation');
  b0 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  perform public.reserve_owned_live_event(o,l,extensions.gen_random_uuid(),s,'byus:stamp:v1:'||s,'0x'||repeat('a',64));
  b1 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  select count(*) into n from public.dukjil_action_log where app_user_id=o and action_key='live_reserve' and source_key=l::text;
  perform pg_temp.assert(n = 1, 'live_reserve wire rows '||n);
  perform pg_temp.assert(b1-b0 = 5, 'reservation must pay 5 once, paid '||(b1-b0)||'; failures '||(select coalesce(jsonb_agg(error_message),'[]')::text from public.dukjil_wire_failures));
  perform pg_temp.assert(not exists(select 1 from public.live_participation_receipts where app_user_id=o and live_event_id=l and awarded_points>0), 'old reserve key paid as well');
end $$;

-- attendance / early / first: one round pays max(live_attend 20, key value) in any order
do $$
declare
  orders text[][] := array[array['attendance','early','first'],array['first','early','attendance'],array['early','attendance','first'],array['first','attendance','early']];
  want integer[] := array[30,30,30,30];
  i integer; j integer; o uuid; l uuid; c1 uuid; c2 uuid; k text; s uuid; total bigint;
begin
  for i in 1..4 loop
    o := pg_temp.uuid(102+i);
    l := pg_temp.live(1010+i, now()-interval '1 minute', now()+interval '1 hour');
    c1 := pg_temp.cert('keep-early-'||i); c2 := pg_temp.cert('keep-first-'||i);
    perform pg_temp.mission(l,'attendance','attendance'); perform pg_temp.mission(l,'early','image',c1); perform pg_temp.mission(l,'first','image',c2);
    for j in 1..3 loop
      k := orders[i][j];
      if k = 'attendance' then
        s := extensions.gen_random_uuid();
        perform public.attend_owned_live_event_with_replay(o,'participation-'||(1010+i),extensions.gen_random_uuid(),'TEST2026',true,s,'byus:stamp:v1:'||s,'0x'||repeat('b',64));
      else
        perform pg_temp.review(o, case when k='early' then c1 else c2 end, extensions.gen_random_uuid());
      end if;
    end loop;
    total := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
    perform pg_temp.assert(total = want[i], 'round total for order '||i||' was '||total||', wanted '||want[i]);
    perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=o and action_key='live_attend' and source_key=l::text) = 1, 'live_attend log rows');
  end loop;
  -- attendance with the early key only: early 20 adds nothing on top of live_attend 20
  o := pg_temp.uuid(107);
  l := pg_temp.live(1020, now()-interval '1 minute', now()+interval '1 hour');
  c1 := pg_temp.cert('keep-early-only');
  perform pg_temp.mission(l,'attendance','attendance'); perform pg_temp.mission(l,'early','image',c1);
  s := extensions.gen_random_uuid();
  perform public.attend_owned_live_event_with_replay(o,'participation-1020',extensions.gen_random_uuid(),'TEST2026',true,s,'byus:stamp:v1:'||s,'0x'||repeat('b',64));
  perform pg_temp.review(o,c1,extensions.gen_random_uuid());
  perform pg_temp.assert(public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point') = 20, 'attend + early must total 20');
end $$;

-- journey_completion and first_clip: the creator earning policy value, once per scope
do $$
declare
  o uuid := pg_temp.uuid(108); l uuid; sv uuid; rev record; r jsonb; r2 jsonb; b0 bigint; b1 bigint;
begin
  l := pg_temp.live(1030, now()-interval '1 minute', now()+interval '1 hour');
  sv := pg_temp.survey(l,'vote');
  select id, policy_version, revision into rev from public.live_reward_setting_revisions where live_event_id=l order by revision desc limit 1;
  set local session_replication_role = replica;
  insert into public.live_journey_completions(app_user_id,live_event_id,requirement_revision_id,requirement_snapshot,bonus_ticket_amount,policy_version,
      reward_setting_revision,reward_setting_revision_id)
    values(o,l,extensions.gen_random_uuid(),'{}'::jsonb,0,rev.policy_version,rev.revision,rev.id);
  set local session_replication_role = origin;
  b0 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  r := public.award_mobile_fan_activity(o,pg_temp.uuid(1),'journey_completion',l::text);
  b1 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  perform pg_temp.assert(r->>'status' = 'awarded' and b1-b0 = 7, 'journey_completion must pay the creator policy value 7: '||r::text);
  r2 := public.award_mobile_fan_activity(o,pg_temp.uuid(1),'journey_completion',l::text);
  perform pg_temp.assert(public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point') = b1, 'journey_completion paid twice for one round');
  r2 := public.award_mobile_fan_activity(o,pg_temp.uuid(1),'journey_completion',extensions.gen_random_uuid()::text);
  perform pg_temp.assert(r2->>'status' = 'not_eligible' and public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point') = b1, 'journey_completion without evidence must not pay');

  insert into public.fan_clips(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)
    values(pg_temp.uuid(1),o,'first clip','public',extensions.gen_random_uuid(),repeat('a',64));
  b0 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  r := public.award_mobile_fan_activity(o,pg_temp.uuid(1),'first_clip','once');
  b1 := public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point');
  perform pg_temp.assert(r->>'status' = 'awarded' and b1-b0 = 9, 'first_clip must pay the creator policy value 9: '||r::text);
  insert into public.fan_clips(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)
    values(pg_temp.uuid(1),o,'second clip','public',extensions.gen_random_uuid(),repeat('b',64));
  r2 := public.award_mobile_fan_activity(o,pg_temp.uuid(1),'first_clip','once');
  perform pg_temp.assert(public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point') = b1, 'first_clip paid twice');
end $$;

-- M3: survey and subscription through the real RPCs (no trigger is disabled anywhere in this file)
do $$
declare
  o uuid := pg_temp.uuid(109); l uuid; sv uuid; q uuid; good uuid; saved jsonb; mid uuid; up uuid := extensions.gen_random_uuid(); sub jsonb; st uuid := extensions.gen_random_uuid(); n integer;
begin
  -- survey that is not tied to a LIVE participation mission: the Dukjil survey action pays once
  l := pg_temp.live(1040, now()-interval '1 minute', now()+interval '1 hour');
  sv := pg_temp.survey(l,'vote');
  select id into q from public.live_survey_questions where survey_id=sv;
  select id into good from public.live_survey_options where question_id=q order by position limit 1;
  perform public.submit_owned_live_mission(o,sv,extensions.gen_random_uuid(),jsonb_build_array(jsonb_build_object('questionId',q,'selectedOptionIds',jsonb_build_array(good))),st,'byus:stamp:v1:'||st,'0x'||repeat('a',64));
  select count(*) into n from public.dukjil_action_log where app_user_id=o and action_key='survey' and source_key=sv::text;
  perform pg_temp.assert(n = 1, 'real survey RPC must pay the survey action once: '||n||'; failures '||(select coalesce(jsonb_agg(error_message),'[]')::text from public.dukjil_wire_failures where action_key='survey'));

  -- survey tied to a LIVE participation mission: the kept LIVE payout pays, the Dukjil survey action does not add a second one
  l := pg_temp.live(1041, now()-interval '1 minute', now()+interval '1 hour');
  sv := pg_temp.survey(l,'vote'); perform pg_temp.mission(l,'corner','choice',null,sv);
  select id into q from public.live_survey_questions where survey_id=sv;
  select id into good from public.live_survey_options where question_id=q order by position limit 1;
  st := extensions.gen_random_uuid();
  perform public.submit_owned_live_mission(o,sv,extensions.gen_random_uuid(),jsonb_build_array(jsonb_build_object('questionId',q,'selectedOptionIds',jsonb_build_array(good))),st,'byus:stamp:v1:'||st,'0x'||repeat('a',64));
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log where app_user_id=o and action_key='survey' and source_key=sv::text), 'live-linked survey must not pay twice');
  perform pg_temp.assert((select awarded_points from public.live_participation_receipts where app_user_id=o and live_event_id=l and mission_key='corner') = 5, 'live corner key must keep paying 5');

  -- subscription: real membership mission, upload, submit and admin approve
  saved := public.save_admin_certification_mission_v2(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),null,pg_temp.uuid(1),'keep-membership-youtube',null,
    '멤버십','유튜브 유료 멤버십','YouTube paid membership','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '1 day',1::smallint,0::bigint,'youtube');
  mid := (saved->>'id')::uuid;
  perform public.set_admin_certification_mission_status(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),mid,1,'active');
  perform public.register_owned_certification_upload(o,mid,up,o||'/'||mid||'/'||up||'.webp',100,10,10,repeat('a',64));
  sub := public.submit_owned_certification(o,mid,extensions.gen_random_uuid(),jsonb_build_array(up),null,null);
  perform public.review_admin_certification_submission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),(sub->>'id')::uuid,extensions.gen_random_uuid(),1,'approve',null);
  -- BUGS-261110 B1: the membership approval records the proof action (slot 09, source = submission), never subscription (slot 07)
  select count(*) into n from public.dukjil_action_log where app_user_id=o and action_key='proof' and source_key=sub->>'id';
  perform pg_temp.assert(n = 1, 'real approval RPC must record the membership proof once: '||n||'; failures '||(select coalesce(jsonb_agg(error_message),'[]')::text from public.dukjil_wire_failures where action_key='proof'));
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log where app_user_id=o and action_key='subscription'), 'membership approval must not pay subscription');
  perform pg_temp.assert(exists(select 1 from public.dukjil_action_log a join public.passport_page_slots s on s.stamp_id=a.stamp_id
      join public.fan_passports fp on fp.id=s.passport_id and fp.app_user_id=o
    where a.app_user_id=o and a.action_key='proof' and a.source_key=sub->>'id' and s.slot_no=9), 'membership approval must fill slot 09');
  perform pg_temp.assert(not exists(select 1 from public.passport_page_slots s join public.fan_passports fp on fp.id=s.passport_id and fp.app_user_id=o
    join public.community_stamps cs on cs.id=s.stamp_id where s.slot_no=7), 'membership approval must leave slot 07 empty');
  perform pg_temp.assert(not exists(select 1 from public.dukjil_wire_failures where resolved_at is null and gave_up_at is null), 'wire failures left open');
end $$;

-- BUGS-261110 B6: slot 07 is an operator-approved screenshot of the fan's own SNS post (proof type sns_post), through the same
-- submit_certification_proof / review_certification_proof path as the slot 09 proofs. Real RPCs, every trigger on.
create function pg_temp.sns_mission(key text, ptype text, platform text) returns uuid language plpgsql as $f$
declare saved jsonb;
begin
  saved := public.save_admin_certification_mission_v3(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),null,pg_temp.uuid(1),key,null,
    '인증','인증 미션','Proof mission','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '1 day',0::smallint,0::bigint,null,ptype,platform);
  perform public.set_admin_certification_mission_status(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),(saved->>'id')::uuid,1,'active');
  return (saved->>'id')::uuid;
end $f$;
create function pg_temp.proof_submit(u uuid, mid uuid, ptype text, consent boolean default false) returns uuid language plpgsql as $f$
declare up uuid := extensions.gen_random_uuid(); r jsonb;
begin
  perform public.register_owned_certification_upload(u,mid,up,u||'/'||mid||'/'||up||'.webp',100,10,10,repeat('a',64));
  r := public.submit_certification_proof(u,pg_temp.uuid(1),ptype,up,consent,null,array[substr(md5(up::text),1,16)],extensions.gen_random_uuid(),
    md5(up::text)||md5(up::text),false,case when consent then '올렸어요' end);
  return (r->>'id')::uuid;
end $f$;
create function pg_temp.approve(sub uuid, actor uuid default null) returns jsonb language sql as $f$
  select public.review_certification_proof(coalesce(actor, pg_temp.uuid(10)), s.id, s.review_revision, 'approved') from public.certification_submissions s where s.id = sub $f$;
create function pg_temp.slot_stamp(u uuid, slot integer) returns uuid language sql as $f$
  select s.stamp_id from public.passport_page_slots s join public.fan_passports fp on fp.id = s.passport_id and fp.app_user_id = u and fp.celebrity_id = pg_temp.uuid(1)
   where s.page_no = 1 and s.slot_no = slot $f$;
create function pg_temp.bal(u uuid) returns bigint language sql as $f$ select public.group_wallet_balance(u, 'fan_point') $f$;

do $$
declare
  ua uuid := pg_temp.uuid(102); ub uuid := pg_temp.uuid(103); uc uuid := pg_temp.uuid(104); ud uuid := pg_temp.uuid(105);
  c uuid := pg_temp.uuid(1); m_ig uuid; m_ig2 uuid; m_tt uuid; m_x uuid; m_mem uuid; m_rc uuid;
  sa uuid; sb uuid; sb2 uuid; s2 uuid; r jsonb; r2 jsonb; b0 bigint; n integer; st uuid; old_stamp uuid; jobs uuid; vr jsonb; k integer := 0;
begin
  m_ig := pg_temp.sns_mission('sns-instagram','sns_post','instagram');
  m_ig2 := pg_temp.sns_mission('sns-instagram-2','sns_post','instagram');
  m_tt := pg_temp.sns_mission('sns-tiktok','sns_post','tiktok');
  m_x := pg_temp.sns_mission('sns-x','sns_post','x');
  m_mem := pg_temp.sns_mission('proof-membership','membership',null);
  m_rc := pg_temp.sns_mission('proof-receipt','receipt',null);
  -- an sns_post mission names one of the five networks
  perform pg_temp.expect_error(format($q$select public.save_admin_certification_mission_v3(%L,%L,%L,null,%L,'sns-none',null,'인증','t','t','d','d','i','i',now(),now()+interval '1 day',0::smallint,0::bigint,null,'sns_post',null)$q$,
    pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),c),'PROOF_INVALID');
  perform pg_temp.expect_error(format($q$select public.save_admin_certification_mission_v3(%L,%L,%L,null,%L,'sns-blog',null,'인증','t','t','d','d','i','i',now(),now()+interval '1 day',0::smallint,0::bigint,null,'sns_post','blog')$q$,
    pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),c),'PROOF_INVALID');

  -- 1. one approval: subscription action with the sns source, 30P once, slot 07; no proof action, no slot 09, no title, no public post
  b0 := pg_temp.bal(ua);
  sa := pg_temp.proof_submit(ua,m_ig,'sns_post');
  r := pg_temp.approve(sa);
  perform pg_temp.assert(r->>'status' = 'approved' and (r->>'points')::int = 30 and (r->>'slotNo')::int = 7 and not (r->>'titleIssued')::boolean and r->>'postId' is null,
    'sns approval result '||r::text);
  select count(*) into n from public.dukjil_action_log where app_user_id=ua and action_key='subscription' and source_key='sns:'||c||':instagram' and points=30 and ledger_id is not null;
  perform pg_temp.assert(n = 1, 'sns approval must write one subscription row with a ledger entry: '||n);
  perform pg_temp.assert(pg_temp.bal(ua) - b0 = 30, 'sns approval must pay 30P once: '||(pg_temp.bal(ua) - b0));
  perform pg_temp.assert(pg_temp.slot_stamp(ua,7) = (r->>'stampId')::uuid and pg_temp.slot_stamp(ua,9) is null, 'sns approval must fill 07 only');
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log where app_user_id=ua and action_key='proof'), 'sns approval must not pay the proof action');
  perform pg_temp.assert(not exists(select 1 from public.jjinfan_titles where app_user_id=ua), 'sns approval must not issue the title');
  perform pg_temp.assert(not exists(select 1 from public.fan_posts where source_type='certification_submission' and source_id=sa), 'sns approval must not publish');
  k := k + 1;

  -- 2. the same decision sent again from the same revision replays; nothing more is paid
  r2 := public.review_certification_proof(pg_temp.uuid(10),sa,(r->>'revision')::bigint - 1,'approved');
  perform pg_temp.assert((r2->>'replayed')::boolean, 'sns replay must replay: '||r2::text);
  perform pg_temp.assert(pg_temp.bal(ua) - b0 = 30 and (select count(*) from public.dukjil_action_log where app_user_id=ua and action_key='subscription') = 1, 'sns replay paid again');
  k := k + 1;

  -- 3. same creator and network again: refused at submit; a second open one is refused at review, with no payout
  perform pg_temp.expect_error(format('select pg_temp.proof_submit(%L,%L,%L)',ua,m_ig2,'sns_post'),'PROOF_ALREADY_APPROVED');
  sb := pg_temp.proof_submit(ub,m_ig,'sns_post'); sb2 := pg_temp.proof_submit(ub,m_ig2,'sns_post');
  perform pg_temp.approve(sb);
  b0 := pg_temp.bal(ub);
  perform pg_temp.expect_error(format('select pg_temp.approve(%L)',sb2),'PROOF_ALREADY_APPROVED');
  perform pg_temp.assert(pg_temp.bal(ub) = b0 and (select status::text from public.certification_submissions where id=sb2) = 'pending'
    and (select count(*) from public.dukjil_action_log where app_user_id=ub and action_key='subscription') = 1, 'second same-network approval must change nothing');
  -- the mission list shows the approved network as done
  perform pg_temp.assert((public.list_proof_missions(ua,c,date_trunc('month',now())) -> 'approvedMissionIds') @> jsonb_build_array(m_ig, m_ig2)
    and not (public.list_proof_missions(ua,c,date_trunc('month',now())) -> 'approvedMissionIds') @> jsonb_build_array(m_tt), 'approved network must be listed as done');
  k := k + 1;

  -- 4. another network pays 30P once more; slot 07 keeps the first stamp
  b0 := pg_temp.bal(ua); old_stamp := pg_temp.slot_stamp(ua,7);
  r := pg_temp.approve(pg_temp.proof_submit(ua,m_tt,'sns_post'));
  perform pg_temp.assert((r->>'points')::int = 30 and pg_temp.bal(ua) - b0 = 30 and r->>'stampId' is not null and (r->>'stampId')::uuid <> old_stamp, 'second network must pay 30P with its own stamp: '||r::text);
  perform pg_temp.assert(pg_temp.slot_stamp(ua,7) = old_stamp, 'slot 07 must keep its first stamp');
  k := k + 1;

  -- 5. SNS posts neither count toward nor wait for the two proofs a month (slot 09)
  perform pg_temp.assert((public.list_proof_missions(ua,c,date_trunc('month',now()) - interval '1 day') ->> 'monthCount')::int = 0, 'sns posts must not count toward the month');
  perform pg_temp.proof_submit(ua,m_mem,'membership');
  perform pg_temp.proof_submit(ua,m_rc,'receipt');
  perform pg_temp.assert((public.list_proof_missions(ua,c,date_trunc('month',now()) - interval '1 day') ->> 'monthCount')::int = 2, 'two proofs must count');
  s2 := pg_temp.proof_submit(ua,m_x,'sns_post');
  perform pg_temp.assert(s2 is not null, 'an sns post must be accepted after two proofs this month');
  k := k + 1;

  -- 6. an sns post is never published on the proof board
  perform pg_temp.expect_error(format('select pg_temp.proof_submit(%L,%L,%L,true)',uc,m_ig,'sns_post'),'PROOF_INVALID');
  perform pg_temp.assert(not exists(select 1 from public.certification_submissions where app_user_id=uc and proof_type is not null), 'refused consent left a row');
  k := k + 1;

  -- 7. only an active non-viewer admin approves; the screenshot opens for its owner only
  insert into public.app_users(id,privy_user_id,verified_email,status) values(pg_temp.uuid(12),'did:privy:sns-viewer','sns-viewer@byus.test','active');
  insert into public.admin_allowlist(id,email,role,active) values(pg_temp.uuid(13),'sns-viewer@byus.test','viewer',true);
  s2 := pg_temp.proof_submit(ud,m_ig,'sns_post');
  perform pg_temp.expect_error(format('select pg_temp.approve(%L,%L)',s2,pg_temp.uuid(12)),'ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select pg_temp.approve(%L,%L)',s2,ud),'ADMIN_REQUIRED');
  perform pg_temp.assert(public.get_owned_certification_proof_source(ud,s2,(select id from public.certification_uploads where consumed_submission_id=s2)) is not null
    and public.get_owned_certification_proof_source(ua,s2,(select id from public.certification_uploads where consumed_submission_id=s2)) is null, 'screenshot must open for its owner only');
  -- rejection and changes requested pay nothing
  perform public.review_certification_proof(pg_temp.uuid(10),s2,(select review_revision from public.certification_submissions where id=s2),'rejected','다른 사람의 글입니다');
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log where app_user_id=ud and action_key in ('subscription','proof')), 'rejected sns post paid');
  k := k + 1;

  -- 9. a legacy membership subscription stamp voided by the B1 correction does not come back: the sns approval fills 07 with a new stamp
  r := public.record_dukjil_action(uc,c,'subscription',c||':instagram',extensions.gen_random_uuid(),jsonb_build_object('platform','instagram'));
  old_stamp := (r->>'stampId')::uuid;
  perform pg_temp.assert(pg_temp.slot_stamp(uc,7) = old_stamp, 'legacy subscription stamp must sit in 07');
  vr := public.void_passport_stamp(pg_temp.uuid(10),old_stamp,'멤버십 인증이 구독 칸에 잘못 기록됨(BUGS-261110 B1)',false,'b1-261110-'||old_stamp);
  perform pg_temp.assert(pg_temp.slot_stamp(uc,7) is null, 'void must clear 07: '||vr::text);
  perform pg_temp.assert(public.void_passport_stamp(pg_temp.uuid(10),old_stamp,'멤버십 인증이 구독 칸에 잘못 기록됨(BUGS-261110 B1)',false,'b1-261110-'||old_stamp) is not null, 'void replay');
  r := pg_temp.approve(pg_temp.proof_submit(uc,m_ig,'sns_post'));
  perform pg_temp.assert((r->>'stampId')::uuid <> old_stamp and pg_temp.slot_stamp(uc,7) = (r->>'stampId')::uuid, 'sns approval must fill 07 with a new stamp after the void: '||r::text);
  k := k + 1;

  -- 10. one passport fills 01-09 and claims page 1: 07 by an sns post, 09 by a membership proof
  set local session_replication_role = replica;
  for n in 1..8 loop
    continue when n = 7;
    st := extensions.gen_random_uuid(); jobs := extensions.gen_random_uuid();
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(jobs,'community_stamp',st,'sns-fill-'||st,1,'{}'::jsonb);
    insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id,policy_version)
      values(st,ud,c,(array['quiz','daily_checkin','post','comment','share','invite',null,'steady_checkin'])[n]::public.community_stamp_kind,'sns-fill-'||n,now()-interval '3 days',jobs,1);
    insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at)
      values((select id from public.fan_passports where app_user_id=ud and celebrity_id=c),1,n,st,now());
  end loop;
  set local session_replication_role = origin;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,1,%L)',ud,c,'sns-claim-0'),'PASSPORT_PAGE_NOT_COMPLETE');
  perform pg_temp.approve(pg_temp.proof_submit(ud,m_tt,'sns_post'));
  perform pg_temp.approve(pg_temp.proof_submit(ud,m_mem,'membership'));
  perform pg_temp.assert(pg_temp.slot_stamp(ud,7) is not null and pg_temp.slot_stamp(ud,9) is not null, '07 and 09 must be filled');
  r := public.claim_passport_page(ud,c,1,'sns-claim-1');
  perform pg_temp.assert(not coalesce((r->>'replayed')::boolean, false), 'page 1 claim: '||r::text);
  k := k + 1;

  perform pg_temp.assert(not exists(select 1 from public.dukjil_wire_failures where resolved_at is null and gave_up_at is null), 'wire failures left open');
  raise notice 'sns_post slot 07: % assertion groups passed', k;
end $$;
rollback;
