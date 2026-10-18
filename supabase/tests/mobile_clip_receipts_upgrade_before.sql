do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Mobile content tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$ declare
  owner constant uuid:='78000000-0000-4000-8000-000000000001'; peer constant uuid:='78000000-0000-4000-8000-000000000002'; admin constant uuid:='78000000-0000-4000-8000-000000000003';
  celebrity constant uuid:='78000000-0000-4000-8000-000000000010'; allowlist constant uuid:='78000000-0000-4000-8000-000000000011';
  quiz constant uuid:='78000000-0000-4000-8000-000000000012'; attempt constant uuid:='78000000-0000-4000-8000-000000000013'; passport constant uuid:='78000000-0000-4000-8000-000000000014';
  chain_job constant uuid:='78000000-0000-4000-8000-000000000016';
  media_request constant uuid:='78000000-0000-4000-8000-000000000020'; clip_request constant uuid:='78000000-0000-4000-8000-000000000021'; comment_request constant uuid:='78000000-0000-4000-8000-000000000022';
  cert_request constant uuid:='78000000-0000-4000-8000-000000000023'; report_request constant uuid:='78000000-0000-4000-8000-000000000024';
  result jsonb; job jsonb; mission uuid; cert_asset uuid; clip_asset uuid; clip uuid;clip_policy uuid; comment uuid; post uuid; post_comment uuid; report uuid; failed boolean:=false;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:clip-upgrade-owner','clip-upgrade-owner@example.test'),(peer,'did:privy:clip-upgrade-peer','clip-upgrade-peer@example.test'),(admin,'did:privy:clip-upgrade-admin','clip-upgrade-admin@example.test');
  insert into public.admin_allowlist(id,email,role,active)values(allowlist,'clip-upgrade-admin@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(celebrity,'clip-upgrade','draft','/content.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(celebrity,'ko','콘텐츠','설명','콘텐츠'),(celebrity,'en','Content','Summary','Content');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=celebrity;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,celebrity,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,owner,celebrity,quiz,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values('78000000-0000-4000-8000-000000000015',owner,celebrity,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(chain_job,'passport',passport,'clip-upgrade-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,owner,celebrity,'78000000-0000-4000-8000-000000000015',chain_job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;


  result:=public.create_admin_mobile_content_clip_reward_policy(admin,allowlist,celebrity,'clip-upgrade-v1',3,'기존 첫 클립 보상 정책입니다.',extensions.gen_random_uuid());clip_policy:=(result->>'policyId')::uuid;
  perform public.set_admin_mobile_content_clip_reward_policy_enabled(admin,allowlist,clip_policy,true,'기존 보상 기록 보존을 검증합니다.',extensions.gen_random_uuid());
  result:=public.reserve_owned_mobile_media(owner,'image','fan_clip','image/jpeg',100,media_request);clip_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(owner,clip_asset);job:=public.claim_mobile_media_validation(clip_asset);
  perform public.finish_mobile_media_validation(clip_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,390,null);
  result:=public.create_mobile_content_fan_clip(owner,'clip-upgrade','first clip','public',array[clip_asset],clip_request);clip:=(result->>'id')::uuid;
  create table public.clip_receipt_upgrade_snapshot as select c.*,result as original_result from public.fan_clips c where c.id=clip;
end $$;
commit;
