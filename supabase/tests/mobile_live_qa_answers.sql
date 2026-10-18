begin;

create or replace function pg_temp.expect_live_qa_error(statement text,marker text)returns void language plpgsql as $$
begin execute statement;raise exception'expected %',marker;
exception when others then if sqlerrm not like'%'||marker||'%'then raise;end if;end$$;

do $$
declare
  fan uuid:='5f000000-0000-4000-8000-000000000001';
  operator_user uuid:='5f000000-0000-4000-8000-000000000002';
  viewer_user uuid:='5f000000-0000-4000-8000-000000000003';
  creator uuid:='5f000000-0000-4000-8000-000000000004';
  operator_allow uuid:='5f000000-0000-4000-8000-000000000005';
  viewer_allow uuid:='5f000000-0000-4000-8000-000000000006';
  brand uuid:='5f000000-0000-4000-8000-000000000007';
  live_id uuid:='5f000000-0000-4000-8000-000000000008';
  context_id uuid:='5f000000-0000-4000-8000-000000000009';
  quiz_id uuid:='5f000000-0000-4000-8000-000000000010';
  attempt_id uuid:='5f000000-0000-4000-8000-000000000011';
  pass_id uuid:='5f000000-0000-4000-8000-000000000012';
  passport_id uuid:='5f000000-0000-4000-8000-000000000013';
  job_id uuid:='5f000000-0000-4000-8000-000000000014';
  question_id uuid;answer_id uuid;result jsonb;request_key uuid:='5f000000-0000-4000-8000-000000000015';
begin
  insert into public.app_users(id,privy_user_id,verified_email)values
    (fan,'did:privy:live-qa-fan','live-qa-fan@example.test'),
    (operator_user,'did:privy:live-qa-operator','live-qa-operator@example.test'),
    (viewer_user,'did:privy:live-qa-viewer','live-qa-viewer@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values
    (fan,'질문한 팬','질문한 팬'),(operator_user,'노출되면 안 되는 운영자','노출되면 안 되는 운영자');
  insert into public.admin_allowlist(id,email,role,active)values
    (operator_allow,'live-qa-operator@example.test','operator',true),
    (viewer_allow,'live-qa-viewer@example.test','viewer',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(creator,'live-qa-artist','draft','/artist.webp','{artist}','singer');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
    (creator,'ko','답변 아티스트','설명','아티스트'),(creator,'en','Answer Artist','Summary','Artist');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=creator;
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)
    values(brand,'live-qa-brand','published','/brand.webp','Brand',clock_timestamp());
  insert into public.live_events(
    id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,
    reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at
  )values(live_id,'live-qa-event',creator,brand,'published','scheduled',clock_timestamp()+interval'1 hour',
    clock_timestamp()+interval'2 hours',clock_timestamp()-interval'2 hours',clock_timestamp()+interval'30 minutes',
    'https://youtube.com/watch?v=liveqatest','/live.webp',extensions.crypt('123456',extensions.gen_salt('bf',12)),clock_timestamp());
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)values
    (live_id,'ko','질문 LIVE','설명','이미지'),(live_id,'en','Q&A LIVE','Summary','Image');
  insert into public.mobile_participation_contexts(
    id,context_type,source_live_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at
  )values(context_id,'live',live_id,creator,'live-qa-context','live-qa-v1','published',
    clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour');
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz_id,creator,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(attempt_id,fan,creator,quiz_id,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass_id,fan,creator,attempt_id);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values(job_id,'passport',passport_id,'live-qa-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
    values(passport_id,fan,creator,pass_id,job_id);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;

  result:=public.save_owned_mobile_participation_post_v2(
    fan,'live',context_id,null,'question','가장 좋아하는 무대는?','{}',null,extensions.gen_random_uuid()
  );question_id:=(result->>'id')::uuid;
  perform pg_temp.expect_live_qa_error(format(
    'select public.answer_owned_mobile_participation_question(%L,%L,%L,%L)',
    fan,question_id,'팬이 만든 답변',extensions.gen_random_uuid()),'MOBILE_PARTICIPATION_FORBIDDEN');
  perform pg_temp.expect_live_qa_error(format(
    'select public.answer_owned_mobile_participation_question(%L,%L,%L,%L)',
    viewer_user,question_id,'뷰어가 만든 답변',extensions.gen_random_uuid()),'MOBILE_PARTICIPATION_FORBIDDEN');

  result:=public.answer_owned_mobile_participation_question(operator_user,question_id,'첫 무대가 가장 기억에 남아요.',request_key);
  answer_id:=(result->>'id')::uuid;
  if result->>'answerToId'<>question_id::text or result->>'replayed'<>'false'
    or public.answer_owned_mobile_participation_question(operator_user,question_id,'첫 무대가 가장 기억에 남아요.',request_key)->>'replayed'<>'true'
    then raise exception'answer link or replay invalid: %',result;end if;
  perform pg_temp.expect_live_qa_error(format(
    'select public.answer_owned_mobile_participation_question(%L,%L,%L,%L)',
    operator_user,question_id,'다른 답변',extensions.gen_random_uuid()),'MOBILE_PARTICIPATION_CONFLICT');

  result:=public.read_owned_mobile_participation_context_v2(fan,'live',context_id,'ko',null,null,20);
  if not exists(select 1 from jsonb_array_elements(result->'items')item
      where item->>'id'=question_id::text and item#>>'{author,role}'='fan'and item->'answerToId'='null'::jsonb)
    or not exists(select 1 from jsonb_array_elements(result->'items')item
      where item->>'id'=answer_id::text and item->>'answerToId'=question_id::text
        and item#>>'{author,role}'='artist'and item#>>'{author,nickname}'='답변 아티스트'
        and item#>>'{author,avatarUrl}'='/artist.webp')
    or result::text like'%노출되면 안 되는 운영자%'
    then raise exception'Q&A author projection invalid or operator identity leaked: %',result;end if;
  if has_function_privilege('anon','public.answer_owned_mobile_participation_question(uuid,uuid,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.answer_owned_mobile_participation_question(uuid,uuid,text,uuid)','EXECUTE')
    then raise exception'answer RPC is exposed directly';end if;
end$$;

rollback;
