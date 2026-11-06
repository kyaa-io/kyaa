\set ON_ERROR_STOP on
-- A Passport without a first knowledge stamp (the 10-16 record behind the 503) reads as issued without a ceremony stamp instead of raising.
-- Disposable database only: the fixtures stay so passport_issuance_rollback.sql can read them after the rollback.
insert into public.app_users(id,privy_user_id,verified_email,status) values
  ('fc000000-0000-4000-8000-000000000001','did:privy:issuance-empty','issuance-empty@byus.test','active');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('fc100000-0000-4000-8000-000000000001','issuance-empty','draft','/issuance-empty.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('fc100000-0000-4000-8000-000000000001','ko','발급 시험','발급 시험','발급 시험'),
  ('fc100000-0000-4000-8000-000000000001','en','Issuance Test','Issuance test','Issuance test');
update public.celebrities set status='published',published_at=now() where id='fc100000-0000-4000-8000-000000000001';
insert into public.celebrity_quizzes(id,celebrity_id,version,status) values
  ('fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001',1,'draft');
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
  ('fc210000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001',1,'fc210000-0000-4000-8000-000000000011','passed',3,now());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
  ('fc220000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc210000-0000-4000-8000-000000000001');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload) values
  ('fc230000-0000-4000-8000-000000000001','passport','fc240000-0000-4000-8000-000000000001','issuance-empty-passport','{}');
alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at) values
  ('fc240000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc220000-0000-4000-8000-000000000001','fc230000-0000-4000-8000-000000000001','2026-10-16T00:00:00Z');
alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
do $$
declare
  r jsonb := public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','ko');
begin
  if r->'passport'->>'id' <> 'fc240000-0000-4000-8000-000000000001' then raise exception 'passport missing %', r; end if;
  if r->'celebrity'->>'name' <> '발급 시험' then raise exception 'celebrity missing %', r; end if;
  if jsonb_typeof(r->'firstStamp') <> 'null' then raise exception 'firstStamp must be null %', r; end if;
  if (r->'score'->>'points')::integer <> 0 then raise exception 'score must be 0 %', r; end if;
  if public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002','ko') is not null then raise exception 'other owner read'; end if;
end $$;

-- A complete first stamp still reads as before.
insert into public.app_users(id,privy_user_id,verified_email,status) values
  ('fc000000-0000-4000-8000-000000000003','did:privy:issuance-full','issuance-full@byus.test','active');
insert into public.user_wallets(app_user_id,chain_id,address) values
  ('fc000000-0000-4000-8000-000000000003',91342,'0x1111111111111111111111111111111111111111');
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
  ('fc210000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001',1,'fc210000-0000-4000-8000-000000000013','passed',3,now());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
  ('fc220000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc210000-0000-4000-8000-000000000003');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload) values
  ('fc230000-0000-4000-8000-000000000003','passport','fc240000-0000-4000-8000-000000000003','issuance-full-passport','{}');
alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at) values
  ('fc240000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc220000-0000-4000-8000-000000000003','fc230000-0000-4000-8000-000000000003','2026-11-07T00:00:00Z');
alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id) values
  ('fc250000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','knowledge','quiz_pass','fc220000-0000-4000-8000-000000000003');
insert into public.fan_score_ledger(activity_id,app_user_id,celebrity_id,points) values
  ('fc250000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001',1);
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload) values
  ('fc230000-0000-4000-8000-000000000004','stamp','fc260000-0000-4000-8000-000000000003','byus:stamp:v1:fc260000-0000-4000-8000-000000000003',jsonb_build_object('recipient','0x1111111111111111111111111111111111111111','celebritySlug','issuance-empty','issuanceId','0x'||repeat('2',64),'stampType','Knowledge'));
insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id) values
  ('fc260000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc240000-0000-4000-8000-000000000003','fc250000-0000-4000-8000-000000000003','knowledge','fc230000-0000-4000-8000-000000000004');
do $$
declare r jsonb := public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','ko');
begin
  if r->'firstStamp'->>'type' <> 'knowledge' or r->'firstStamp'->>'businessStatus' <> 'issued' then raise exception 'first stamp %', r; end if;
  if (r->'score'->>'points')::integer <> 1 then raise exception 'first stamp score %', r; end if;
  if r->'firstStamp'->>'issuedAt' is null or r->'passport'->>'mintStatus' is null then raise exception 'first stamp shape %', r; end if;
end $$;
