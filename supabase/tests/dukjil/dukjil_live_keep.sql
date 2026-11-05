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
  select count(*) into n from public.dukjil_action_log where app_user_id=o and action_key='subscription' and source_key=pg_temp.uuid(1)::text||':youtube';
  perform pg_temp.assert(n = 1, 'real approval RPC must pay the subscription once: '||n||'; failures '||(select coalesce(jsonb_agg(error_message),'[]')::text from public.dukjil_wire_failures where action_key='subscription'));
  perform pg_temp.assert(not exists(select 1 from public.dukjil_wire_failures where resolved_at is null and gave_up_at is null), 'wire failures left open');
end $$;
rollback;
