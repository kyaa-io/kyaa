do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
-- Generalized Mission reward-score regression.
-- Run with psql -v ON_ERROR_STOP=1 against a disposable clean-replay database.
-- All fixtures are rolled back.
begin;

insert into public.app_users(id,privy_user_id,verified_email,status) values
  ('a1000000-0000-4000-8000-000000000001','did:privy:mission-score-one','mission-score-one@byus.test','active'),
  ('a1000000-0000-4000-8000-000000000002','did:privy:mission-score-zero','mission-score-zero@byus.test','active'),
  ('a1000000-0000-4000-8000-000000000003','did:privy:mission-score-three','mission-score-three@byus.test','active'),
  ('a1000000-0000-4000-8000-000000000004','did:privy:mission-score-admin','mission-score-admin@byus.test','active');
insert into public.admin_allowlist(id,email,role,active) values
  ('a1000000-0000-4000-8000-000000000010','mission-score-admin@byus.test','admin',true);
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values
  ('a1000000-0000-4000-8000-000000000001',91342,'0xa100000000000000000000000000000000000001','privy','embedded'),
  ('a1000000-0000-4000-8000-000000000002',91342,'0xa100000000000000000000000000000000000002','privy','embedded'),
  ('a1000000-0000-4000-8000-000000000003',91342,'0xa100000000000000000000000000000000000003','privy','embedded');

insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('a1100000-0000-4000-8000-000000000001','mission-score-contract','published','/mission-score.webp',now(),'{artist}','idol'),
  ('a1100000-0000-4000-8000-000000000002','mission-score-other','draft','/mission-score-other.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('a1100000-0000-4000-8000-000000000001','ko','미션 점수 테스트','미션 점수 테스트','미션 점수 테스트'),
  ('a1100000-0000-4000-8000-000000000001','en','Mission Score Test','Mission score test','Mission score test');
insert into public.brands(id,slug,status,logo_url,logo_alt,published_at) values
  ('a1200000-0000-4000-8000-000000000001','mission-score-brand','published','/mission-score-brand.svg','Mission score brand',now());
insert into public.brand_localizations(brand_id,locale,name,description) values
  ('a1200000-0000-4000-8000-000000000001','ko','미션 점수 브랜드','미션 점수 브랜드'),
  ('a1200000-0000-4000-8000-000000000001','en','Mission Score Brand','Mission score brand');

insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values
  ('a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',1,'published',now());
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
  ('a1310000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',1,'a1310000-0000-4000-8000-000000000011','passed',3,now()),
  ('a1310000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',1,'a1310000-0000-4000-8000-000000000012','passed',3,now()),
  ('a1310000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',1,'a1310000-0000-4000-8000-000000000013','passed',3,now());
insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values('a1100000-0000-4000-8000-000000000001','source-fixture','earning','{"verification":5,"mission_completion":17,"journey_completion":25,"live_reservation":7,"live_attendance":11,"checkin":3,"comment":2,"first_clip":9,"membership_youtube":13,"invitation_milestone":19}',now()-interval'1 minute');
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
  ('a1320000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1310000-0000-4000-8000-000000000001'),
  ('a1320000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001','a1310000-0000-4000-8000-000000000002'),
  ('a1320000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','a1100000-0000-4000-8000-000000000001','a1310000-0000-4000-8000-000000000003');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
select fixture.job_id,'passport',fixture.passport_id,
  'byus:passport:v1:'||fixture.owner_id::text||':mission-score-contract',1,
  jsonb_build_object('recipient',fixture.wallet,'celebritySlug','mission-score-contract','passportId',fixture.issuance_id)
from (values
  ('a1340000-0000-4000-8000-000000000001'::uuid,'a1330000-0000-4000-8000-000000000001'::uuid,'a1000000-0000-4000-8000-000000000001'::uuid,'0xa100000000000000000000000000000000000001','0x'||repeat('1',64)),
  ('a1340000-0000-4000-8000-000000000002'::uuid,'a1330000-0000-4000-8000-000000000002'::uuid,'a1000000-0000-4000-8000-000000000002'::uuid,'0xa100000000000000000000000000000000000002','0x'||repeat('2',64)),
  ('a1340000-0000-4000-8000-000000000003'::uuid,'a1330000-0000-4000-8000-000000000003'::uuid,'a1000000-0000-4000-8000-000000000003'::uuid,'0xa100000000000000000000000000000000000003','0x'||repeat('3',64))
) fixture(job_id,passport_id,owner_id,wallet,issuance_id);
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
  ('a1330000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1320000-0000-4000-8000-000000000001','a1340000-0000-4000-8000-000000000001'),
  ('a1330000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001','a1320000-0000-4000-8000-000000000002','a1340000-0000-4000-8000-000000000002'),
  ('a1330000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','a1100000-0000-4000-8000-000000000001','a1320000-0000-4000-8000-000000000003','a1340000-0000-4000-8000-000000000003');

insert into public.live_events(
  id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,
  reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,
  attendance_valid_from,attendance_valid_until
) values
  ('a1400000-0000-4000-8000-000000000001','mission-score-one','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','2030-01-10T12:00:00Z','2030-01-10T13:00:00Z','2029-12-01T00:00:00Z','2030-01-10T11:00:00Z','https://www.youtube.com/watch?v=abcdefghijk','/mission-score-one.webp',extensions.crypt('MISSION-ONE',extensions.gen_salt('bf',12)),'2030-01-10T11:55:00Z','2030-01-10T13:10:00Z'),
  ('a1400000-0000-4000-8000-000000000002','mission-score-zero','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','2030-01-11T12:00:00Z','2030-01-11T13:00:00Z','2029-12-01T00:00:00Z','2030-01-11T11:00:00Z','https://www.youtube.com/watch?v=abcdefghijk','/mission-score-zero.webp',extensions.crypt('MISSION-ZERO',extensions.gen_salt('bf',12)),'2030-01-11T11:55:00Z','2030-01-11T13:10:00Z'),
  ('a1400000-0000-4000-8000-000000000003','mission-score-three','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','2030-01-12T12:00:00Z','2030-01-12T13:00:00Z','2029-12-01T00:00:00Z','2030-01-12T11:00:00Z','https://www.youtube.com/watch?v=abcdefghijk','/mission-score-three.webp',extensions.crypt('MISSION-THREE',extensions.gen_salt('bf',12)),'2030-01-12T11:55:00Z','2030-01-12T13:10:00Z');
insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
select live_id,locale,title,title,title from (values
  ('a1400000-0000-4000-8000-000000000001'::uuid,'ko'::public.content_locale,'1점 라이브'),
  ('a1400000-0000-4000-8000-000000000001'::uuid,'en'::public.content_locale,'One point live'),
  ('a1400000-0000-4000-8000-000000000002'::uuid,'ko'::public.content_locale,'0점 라이브'),
  ('a1400000-0000-4000-8000-000000000002'::uuid,'en'::public.content_locale,'Zero point live'),
  ('a1400000-0000-4000-8000-000000000003'::uuid,'ko'::public.content_locale,'3점 라이브'),
  ('a1400000-0000-4000-8000-000000000003'::uuid,'en'::public.content_locale,'Three point live')
) fixture(live_id,locale,title);
update public.live_events set publication_status='published',published_at=now()
where id in ('a1400000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000003');

-- Revision 3 is deliberately newer than the score-1 Mission's frozen revision 2.
insert into public.live_reward_setting_revisions(
  id,live_event_id,revision,policy_version,lifecycle_status,mission_score,mission_ticket,
  journey_bonus_ticket,actor_app_user_id,actor_admin_allowlist_id,correlation_id,published_at
)
select fixture.id,fixture.live_id,fixture.revision,activation.policy_version,'published',fixture.score,fixture.ticket,0,
  'a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000010',fixture.correlation_id,now()
from (values
  ('a1410000-0000-4000-8000-000000000001'::uuid,'a1400000-0000-4000-8000-000000000001'::uuid,2,1,1,'a1410000-0000-4000-8000-000000000011'::uuid),
  ('a1410000-0000-4000-8000-000000000002'::uuid,'a1400000-0000-4000-8000-000000000002'::uuid,2,0,1,'a1410000-0000-4000-8000-000000000012'::uuid),
  ('a1410000-0000-4000-8000-000000000003'::uuid,'a1400000-0000-4000-8000-000000000003'::uuid,2,3,0,'a1410000-0000-4000-8000-000000000013'::uuid)
) fixture(id,live_id,revision,score,ticket,correlation_id)
cross join public.reward_policy_activation activation
where activation.singleton;

insert into public.live_surveys(
  id,live_event_id,version,mission_type,legacy_contract,attendance_requirement,
  visible_from,visible_until
) values
  ('a1500000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001',1,'vote',false,'not_required','2020-01-01T00:00:00Z','2100-01-01T00:00:00Z'),
  ('a1500000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000002',1,'quiz',false,'not_required','2020-01-01T00:00:00Z','2100-01-01T00:00:00Z'),
  ('a1500000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000003',1,'vote',false,'not_required','2020-01-01T00:00:00Z','2100-01-01T00:00:00Z'),
  ('a1500000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000001',2,'vote',false,'not_required','2020-01-01T00:00:00Z','2100-01-01T00:00:00Z');
insert into public.live_survey_localizations(survey_id,locale,title,description)
select mission_id,locale,title,title from (values
  ('a1500000-0000-4000-8000-000000000001'::uuid,'ko'::public.content_locale,'1점 투표'),
  ('a1500000-0000-4000-8000-000000000001'::uuid,'en'::public.content_locale,'One point vote'),
  ('a1500000-0000-4000-8000-000000000002'::uuid,'ko'::public.content_locale,'0점 퀴즈'),
  ('a1500000-0000-4000-8000-000000000002'::uuid,'en'::public.content_locale,'Zero point quiz'),
  ('a1500000-0000-4000-8000-000000000003'::uuid,'ko'::public.content_locale,'3점 투표'),
  ('a1500000-0000-4000-8000-000000000003'::uuid,'en'::public.content_locale,'Three point vote')
) fixture(mission_id,locale,title);
insert into public.live_survey_questions(id,survey_id,question_type,position) values
  ('a1510000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001','single_choice',1),
  ('a1510000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000002','single_choice',1),
  ('a1510000-0000-4000-8000-000000000003','a1500000-0000-4000-8000-000000000003','single_choice',1);
insert into public.live_survey_options(id,question_id,position) values
  ('a1520000-0000-4000-8000-000000000001','a1510000-0000-4000-8000-000000000001',1),
  ('a1520000-0000-4000-8000-000000000002','a1510000-0000-4000-8000-000000000001',2),
  ('a1520000-0000-4000-8000-000000000003','a1510000-0000-4000-8000-000000000002',1),
  ('a1520000-0000-4000-8000-000000000004','a1510000-0000-4000-8000-000000000002',2),
  ('a1520000-0000-4000-8000-000000000005','a1510000-0000-4000-8000-000000000003',1),
  ('a1520000-0000-4000-8000-000000000006','a1510000-0000-4000-8000-000000000003',2);
update public.live_survey_questions set correct_option_id='a1520000-0000-4000-8000-000000000003'
where id='a1510000-0000-4000-8000-000000000002';
update public.live_surveys set
  lifecycle_status='published',publication_status='published',published_at=now(),ever_published_at=now()
where id in ('a1500000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000003');
-- The Mission is already frozen to revision 2; revision 3 is now the LIVE's latest.
insert into public.live_reward_setting_revisions(
  id,live_event_id,revision,policy_version,lifecycle_status,mission_score,mission_ticket,
  journey_bonus_ticket,actor_app_user_id,actor_admin_allowlist_id,correlation_id,published_at
)
select 'a1410000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000001',3,
  activation.policy_version,'published',3,2,0,'a1000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000010','a1410000-0000-4000-8000-000000000014',now()
from public.reward_policy_activation activation where activation.singleton;


do $$declare first_result jsonb;replay_result jsonb;receipt uuid;projection jsonb;mode jsonb;begin
  first_result:=public.submit_owned_live_mission(
    'a1000000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001',
    'a1700000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('questionId','a1510000-0000-4000-8000-000000000001','selectedOptionIds',jsonb_build_array('a1520000-0000-4000-8000-000000000001'))),
    'a1800000-0000-4000-8000-000000000001','byus:stamp:v1:a1800000-0000-4000-8000-000000000001','0x'||repeat('1',64)
  );
  replay_result:=public.submit_owned_live_mission(
    'a1000000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001',
    'a1700000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('questionId','a1510000-0000-4000-8000-000000000001','selectedOptionIds',jsonb_build_array('a1520000-0000-4000-8000-000000000001'))),
    'a1800000-0000-4000-8000-000000000001','byus:stamp:v1:a1800000-0000-4000-8000-000000000001','0x'||repeat('1',64)
  );

 select id into receipt from public.live_survey_responses where app_user_id='a1000000-0000-4000-8000-000000000001'and survey_id='a1500000-0000-4000-8000-000000000001';
 if first_result->>'responseId'<>receipt::text or first_result is distinct from replay_result or first_result#>>'{mission,ticketAmount}'<>'0' or first_result#>>'{mission,scorePoints}'<>'1'then raise exception 'Actual mission source/replay/XP/point ticket projection incorrect %',first_result;end if;
 if public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',receipt)->>'amount'<>'17'then raise exception 'Mission source did not resolve real point receipt';end if;
 if exists(select 1 from jsonb_array_elements(public.get_public_certifications('mission-score-contract','ko'))m where m#>>'{reward,ticketAmount}'<>'0')then raise exception 'Public certifications still advertise retired tickets';end if;
 if public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001','a1320000-0000-4000-8000-000000000001')->>'amount'<>'5'then raise exception 'Quiz source grant not point-only';end if;
 mode:=public.read_mobile_fan_economy_reward_mode();if mode->>'mode'<>'per_creator'or mode->>'legacyTicketEarning'<>'true'then raise exception 'DB mode incorrect';end if;
end $$;
-- The existing revision legitimately has zero legacy bonus; the point reward is separate.
insert into public.live_journey_requirement_revisions(id,live_event_id,revision,lifecycle_status,require_passport,require_reservation,require_attendance,bonus_ticket_amount,reward_setting_revision_id,reward_setting_revision,policy_version,actor_app_user_id,actor_admin_allowlist_id,correlation_id,published_at)
select 'a1600000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001',1,'published',true,false,false,0,'a1410000-0000-4000-8000-000000000001',2,policy_version,'a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000010','a1600000-0000-4000-8000-000000000002',now()from public.reward_policy_activation where singleton;
insert into public.live_journey_publications(live_event_id,published_journey_requirement_revision_id,actor_app_user_id,actor_admin_allowlist_id,correlation_id)values('a1400000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000010','a1600000-0000-4000-8000-000000000003');
do $$declare result jsonb;replay jsonb;source uuid;begin
 result:=public.evaluate_owned_live_journey('a1000000-0000-4000-8000-000000000001','mission-score-one','a1700000-0000-4000-8000-000000000020');
 select id into source from public.live_journey_completions where app_user_id='a1000000-0000-4000-8000-000000000001'and live_event_id='a1400000-0000-4000-8000-000000000001';
 if result->>'completionId'<>source::text or result->>'bonusTicketAmount'<>'0'or result->>'ticketLedgerId'is not null then raise exception 'Journey source/point-only projection incorrect %',result;end if;
 replay:=public.evaluate_owned_live_journey('a1000000-0000-4000-8000-000000000001','mission-score-one','a1700000-0000-4000-8000-000000000020');
 if result is distinct from replay or public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',source)->>'amount'<>'25'then raise exception 'Journey replay/source receipt incorrect';end if;
 result:=public.get_owned_live_journey('a1000000-0000-4000-8000-000000000001','mission-score-one');if result->>'completionId'<>source::text then raise exception 'Journey read lost completion ID';end if;
 raise notice 'PASS actual mission response UUID/cached source replay/XP preserved/public reward0/DB mode/journey completion UUID/point getter';
end $$;

insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,attendance_valid_from,attendance_valid_until,publication_status,published_at)values('a1400000-0000-4000-8000-000000000004','point-source-live','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001',now()+interval'1 hour',now()+interval'2 hours',now()-interval'2 hours',now()+interval'30 minutes','https://www.youtube.com/watch?v=abcdefghijk','/fixture.webp',extensions.crypt('POINT-SOURCE',extensions.gen_salt('bf',12)),now()-interval'1 hour',now()+interval'1 hour','published',now());
insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,attendance_valid_from,attendance_valid_until,publication_status,published_at)values('a1400000-0000-4000-8000-000000000005','point-source-live-attend','a1100000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001',now()-interval'30 minutes',now()+interval'1 hour',now()-interval'2 hours',now()-interval'45 minutes','https://www.youtube.com/watch?v=abcdefghijk','/fixture.webp',extensions.crypt('POINT-SOURCE',extensions.gen_salt('bf',12)),now()-interval'1 hour',now()+interval'1 hour','published',now());
insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)select id,locale,'Fixture','Fixture','Fixture'from(values('a1400000-0000-4000-8000-000000000004'::uuid),('a1400000-0000-4000-8000-000000000005'::uuid))events(id)cross join unnest(enum_range(null::public.content_locale))locale;
-- Real canonical operational facts exercise the changed insert triggers; original
-- reserve/attend business and credential producers are otherwise left intact.
do $$declare reservation uuid:=extensions.gen_random_uuid();attendance uuid:=extensions.gen_random_uuid();clip uuid:=extensions.gen_random_uuid();r jsonb;source uuid;old_stamps integer;begin
 insert into public.live_reservations(id,app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)values(reservation,'a1000000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000001','a1330000-0000-4000-8000-000000000001',extensions.gen_random_uuid());
 insert into public.live_attendances(id,app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)values(attendance,'a1000000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000005','a1100000-0000-4000-8000-000000000001','a1330000-0000-4000-8000-000000000001',extensions.gen_random_uuid());
 if public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',reservation)->>'amount'<>'7'or public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',attendance)->>'amount'<>'11'then raise exception 'Reservation/attendance canonical point trigger incorrect';end if;
 perform public.check_in_community_stamp('a1000000-0000-4000-8000-000000000001','mission-score-contract');
 select id into source from public.community_stamps where app_user_id='a1000000-0000-4000-8000-000000000001'and celebrity_id='a1100000-0000-4000-8000-000000000001'and kind='daily_checkin';
 if public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',source)->>'amount'<>'3'then raise exception 'Checkin point source missing';end if;
 perform public.check_in_community_stamp('a1000000-0000-4000-8000-000000000001','mission-score-contract');
 if(select count(*)from public.mobile_fan_economy_activity_receipts where app_user_id='a1000000-0000-4000-8000-000000000001'and action_key='checkin')<>1 then raise exception 'Checkin duplicate receipt';end if;
 insert into public.fan_clips(id,app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash)values(clip,'a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','fixture clip','members',extensions.gen_random_uuid(),repeat('c',64));
 r:=public.award_mobile_content_first_clip('a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',clip);
 if r<>'{"status":"unconfigured"}'::jsonb or public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',clip)->>'amount'<>'9'then raise exception 'Clip strict legacy/point receipt incorrect %',r;end if;
 perform public.award_mobile_content_first_clip('a1000000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',clip);
 if exists(select 1 from public.fan_ticket_ledger where app_user_id='a1000000-0000-4000-8000-000000000001'and source_type in('passport_verification','live_reservation','live_attendance','mission_completion','journey_completion','mobile_clip_first_upload','fan_activity_reward'))then raise exception 'Legacy direct tickets survived producer cutover';end if;
 raise notice 'PASS actual quiz/live insert triggers/checkin source+stamp/repeated clip strict old reward/new point receipt';
end $$;
-- Register a new invitee before authoritative quiz qualification. Only the inviter
-- owns the point milestone; redeem's response contains no inviter reward/ledger.
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values('a1000000-0000-4000-8000-000000000004',91342,'0xa100000000000000000000000000000000000004','privy','embedded');
insert into public.community_stamp_invitation_policy_versions(version,effective_at,milestone_size)values(777,clock_timestamp(),1);
insert into public.community_stamp_invitation_reward_configs(invitation_policy_version,config_version,celebrity_id,ticket_amount,reward_policy_version,effective_at)select 777,1,'a1100000-0000-4000-8000-000000000001',1,policy_version,clock_timestamp()from public.reward_policy_activation where singleton;
do $$declare code jsonb;r jsonb;source uuid;begin
 code:=public.get_community_stamp_invite_code('a1000000-0000-4000-8000-000000000001');
 r:=public.redeem_community_stamp_invite('a1000000-0000-4000-8000-000000000004',code->>'code');
 if r?'fanReward'or r?'rewardSources'then raise exception 'Invitee received inviter reward';end if;
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values('a1310000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id,passed_at)values('a1320000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000001','a1310000-0000-4000-8000-000000000004',clock_timestamp());
 select id into source from public.community_stamp_invitation_milestones where inviter_app_user_id='a1000000-0000-4000-8000-000000000001'and invitation_policy_version=777;
 if source is null or public.read_owned_mobile_fan_reward('a1000000-0000-4000-8000-000000000001',source)->>'amount'<>'19'then raise exception 'Inviter canonical point milestone missing';end if;
 r:=public.get_community_stamp_invitation_overview('a1000000-0000-4000-8000-000000000001');if r#>>'{rewardSources,0,sourceId}'<>source::text or r#>>'{rewardSources,0,pointReceiptId}'is null then raise exception 'Inviter-only source overview missing %',r;end if;
 r:=public.get_community_stamp_invitation_overview('a1000000-0000-4000-8000-000000000004');if jsonb_array_length(r->'rewardSources')<>0 then raise exception 'Invitee sees inviter-owned point source';end if;
 raise notice 'PASS actual invitation registration/qualification/owned milestone point receipt/invitee privacy';
end $$;
rollback;
