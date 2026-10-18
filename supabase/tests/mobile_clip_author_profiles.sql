do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Mobile content tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$ declare
  owner constant uuid:='77000000-0000-4000-8000-000000000001'; peer constant uuid:='77000000-0000-4000-8000-000000000002'; admin constant uuid:='77000000-0000-4000-8000-000000000003';
  celebrity constant uuid:='77000000-0000-4000-8000-000000000010'; allowlist constant uuid:='77000000-0000-4000-8000-000000000011';
  quiz constant uuid:='77000000-0000-4000-8000-000000000012'; attempt constant uuid:='77000000-0000-4000-8000-000000000013'; passport constant uuid:='77000000-0000-4000-8000-000000000014';
  chain_job constant uuid:='77000000-0000-4000-8000-000000000016';
  media_request constant uuid:='77000000-0000-4000-8000-000000000020'; clip_request constant uuid:='77000000-0000-4000-8000-000000000021'; comment_request constant uuid:='77000000-0000-4000-8000-000000000022';
  cert_request constant uuid:='77000000-0000-4000-8000-000000000023'; report_request constant uuid:='77000000-0000-4000-8000-000000000024';
  result jsonb; job jsonb; mission uuid; cert_asset uuid; clip_asset uuid; clip uuid;clip_policy uuid; comment uuid; post uuid; post_comment uuid; report uuid; failed boolean:=false;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:content-owner','content-owner@example.test'),(peer,'did:privy:content-peer','content-peer@example.test'),(admin,'did:privy:content-admin','content-admin@example.test');
  insert into public.admin_allowlist(id,email,role,active)values(allowlist,'content-admin@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(celebrity,'mobile-content','draft','/content.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(celebrity,'ko','콘텐츠','설명','콘텐츠'),(celebrity,'en','Content','Summary','Content');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=celebrity;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,celebrity,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,owner,celebrity,quiz,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values('77000000-0000-4000-8000-000000000015',owner,celebrity,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(chain_job,'passport',passport,'mobile-content-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,owner,celebrity,'77000000-0000-4000-8000-000000000015',chain_job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;

  result:=public.create_admin_mobile_content_clip_reward_policy(admin,allowlist,celebrity,'clip-v1',3,'첫 클립 업로드 보상 정책을 등록합니다.',extensions.gen_random_uuid());clip_policy:=(result->>'policyId')::uuid;
  perform public.set_admin_mobile_content_clip_reward_policy_enabled(admin,allowlist,clip_policy,true,'검증된 첫 클립 보상 정책을 활성화합니다.',extensions.gen_random_uuid());

  result:=public.reserve_owned_mobile_media(owner,'image','fan_clip','image/jpeg',100,media_request);clip_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(owner,clip_asset);job:=public.claim_mobile_media_validation(clip_asset);
  perform public.finish_mobile_media_validation(clip_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,390,null);
  result:=public.create_mobile_content_fan_clip(owner,'mobile-content','first clip','public',array[clip_asset],clip_request);clip:=(result->>'id')::uuid;
  if result#>>'{reward,status}'<>'awarded'or result#>>'{reward,ticketAmount}'<>'3'or result#>>'{reward,policyVersion}'<>'clip-v1'or result->>'replayed'<>'false'then raise exception'clip result contract failed: %',result;end if;
  result:=public.create_mobile_content_fan_clip(owner,'mobile-content','first clip','public',array[clip_asset],clip_request);
  if result->>'replayed'<>'true'or result#>>'{reward,status}'<>'awarded'or(select count(*)from public.mobile_content_clip_reward_awards where app_user_id=owner and celebrity_id=celebrity)<>1 then raise exception'clip idempotency/reward failed: %',result;end if;
  if public.read_mobile_content_fan_clip(peer,clip)#>>'{assets,0,id}'<>clip_asset::text or public.authorize_mobile_media_read(peer,clip_asset,'original')is null then raise exception'public clip media was inaccessible';end if;

  result:=public.read_mobile_content_fan_clip(peer,clip);
  if result#>>'{author,profileId}' is not null or result#>>'{author,fanTier}' is not null then raise exception 'private author profile leaked'; end if;
  if public.read_mobile_content_fan_clip(owner,clip)#>>'{author,profileId}'<>owner::text then raise exception 'own profile link missing'; end if;
  perform public.set_owned_social_settings(owner,true,array['mobile-content'],'friends');
  result:=public.read_mobile_content_fan_clip(peer,clip);
  if result#>>'{author,profileId}'<>owner::text or result#>>'{author,fanTier}' is null then raise exception 'visible author profile missing'; end if;
  if public.read_mobile_content_fan_clips(peer,'mobile-content',null,null,20,'ko')#>>'{items,0,author,profileId}'<>owner::text then raise exception 'list profile projection missing'; end if;
  perform public.set_owned_social_settings(owner,true,'{}','friends');
  if public.read_mobile_content_fan_clip(peer,clip)#>>'{author,profileId}' is not null then raise exception 'hidden favorite profile leaked'; end if;
  perform public.set_owned_social_settings(owner,true,array['mobile-content'],'friends');
  insert into public.user_blocks(app_user_id,blocked_app_user_id)values(peer,owner);
  if public.read_mobile_content_fan_clip(peer,clip) is not null then raise exception 'blocked clip remained visible'; end if;
  delete from public.user_blocks where app_user_id=peer and blocked_app_user_id=owner;
  update public.app_users set status='disabled' where id=owner;
  if public.read_mobile_content_fan_clip(peer,clip) is not null then raise exception 'inactive author remained visible'; end if;
  if has_function_privilege('anon','public.mobile_content_clip_json(uuid,uuid,public.content_locale)','EXECUTE') or has_function_privilege('service_role','public.mobile_content_clip_json_before_author_profile(uuid,uuid,public.content_locale)','EXECUTE') then raise exception 'clip profile helper ACL leaked'; end if;
end $$;
rollback;
