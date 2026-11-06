\set ON_ERROR_STOP on
-- A Passport without a first knowledge stamp (the 10-16 record behind the 503) reads as issued without a ceremony stamp instead of raising.
begin;
insert into public.app_users(id,privy_user_id,verified_email,status) values
  ('fc000000-0000-4000-8000-000000000001','did:privy:issuance-empty','issuance-empty@byus.test','active');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('fc100000-0000-4000-8000-000000000001','issuance-empty','published','/issuance-empty.webp',now(),'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('fc100000-0000-4000-8000-000000000001','ko','발급 시험','발급 시험','발급 시험'),
  ('fc100000-0000-4000-8000-000000000001','en','Issuance Test','Issuance test','Issuance test');
insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values
  ('fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001',1,'published',now());
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
rollback;
