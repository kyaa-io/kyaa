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
  perform public.set_mobile_content_fan_clip_like(peer,clip,true);
  result:=public.post_mobile_content_clip_comment(peer,clip,null,'nice clip',comment_request);comment:=(result->>'id')::uuid;
  result:=public.set_mobile_content_comment_reaction(owner,'fan_clip_comment',comment,'👏');
  if result#>>'{reactions,1,count}'<>'1'or result#>>'{reactions,1,selected}'<>'true'then raise exception'clip reaction summary failed';end if;
  if public.read_mobile_content_clip_comments(owner,clip,null,null,20,'ko')#>>'{items,0,reactions,1,count}'<>'1'then raise exception'clip comment read omitted reactions';end if;

  result:=public.save_fan_post(owner,'mobile-content',null,'post','public','{}',null,'77000000-0000-4000-8000-000000000025');post:=(result->>'id')::uuid;
  result:=public.post_fan_post_comment(peer,post,null,'post comment','77000000-0000-4000-8000-000000000026');post_comment:=(result->>'id')::uuid;
  perform public.set_mobile_content_comment_reaction(owner,'fan_post_comment',post_comment,'❤');
  if public.read_fan_post_comments(owner,post,null,null,20,'ko')#>>'{items,0,reactions,0,count}'<>'1'then raise exception'fan-post comment read omitted reactions';end if;

  result:=public.save_admin_certification_mission(admin,allowlist,extensions.gen_random_uuid(),null,celebrity,'mobile-photo',null,'기타','사진 인증','Photo proof','설명','Description','사진을 올려 주세요.','Upload a photo.',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 day',0::smallint,0::bigint);mission:=(result->>'id')::uuid;
  perform public.set_admin_certification_mission_status(admin,allowlist,extensions.gen_random_uuid(),mission,1,'active');
  result:=public.reserve_owned_mobile_media(owner,'image','certification','image/png',120,cert_request);cert_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(owner,cert_asset);job:=public.claim_mobile_media_validation(cert_asset);
  perform public.finish_mobile_media_validation(cert_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/png',800,600,null);
  result:=public.submit_owned_certification_with_media(owner,mission,'77000000-0000-4000-8000-000000000027',jsonb_build_array(cert_asset),null,null);
  if public.get_owned_certification_proof_source(owner,(result->>'id')::uuid,cert_asset)#>>'{bucket}'<>'mobile-media'or public.get_admin_certification_proof_source(admin,allowlist,(result->>'id')::uuid,cert_asset)#>>'{contentType}'<>'image/png'then raise exception'mobile certification proof source failed';end if;
  if public.certification_membership_payload('{}'::jsonb,'instagram')<>jsonb_build_object('membershipPlatform','instagram','verificationMode','manual_photo','requiredPhotoCount',1)then raise exception'manual-photo metadata failed';end if;

  result:=public.post_content_report(peer,'fan_clip',clip,'policy issue',report_request);report:=(result->>'id')::uuid;
  perform public.resolve_admin_content_report(admin,allowlist,extensions.gen_random_uuid(),report,'resolved',true,'Confirmed policy violation');
  if public.read_mobile_content_fan_clip(peer,clip)is not null or not exists(select 1 from public.fan_clips where id=clip and hidden_at is not null)then raise exception'clip moderation failed';end if;

  update public.fan_clips set hidden_at=null,hidden_by_admin_id=null,hide_reason=null where id=clip;
  perform public.remove_mobile_content_clip_comment(peer,comment);
  perform public.remove_mobile_content_clip_comment(peer,comment);
  perform public.remove_mobile_content_fan_clip(owner,clip);
  perform public.remove_mobile_content_fan_clip(owner,clip);
  if not exists(select 1 from public.fan_clips where id=clip and deleted_at is not null)
    or not exists(select 1 from public.fan_clip_comments where id=comment and deleted_at is not null)
  then raise exception'idempotent clip deletion did not persist tombstones';end if;
  insert into public.account_deletion_requests(app_user_id,provider_subject)values(owner,'did:privy:content-owner');update public.app_users set status='disabled'where id=owner;
  perform set_config('byus.account_deletion_owner',owner::text,true);perform public.scrub_account_deletion(owner);
  if not exists(select 1 from public.mobile_media_assets where id=clip_asset and state='cancelled'and cleanup_requested_at is not null)or exists(select 1 from public.fan_clip_likes where clip_id=clip)or exists(select 1 from public.mobile_content_comment_reactions where target_type='fan_clip_comment'and target_id=comment)or exists(select 1 from public.fan_clip_comments where clip_id=clip and deleted_at is null)then raise exception'account deletion left clip content or interactions';end if;
  if public.read_mobile_content_fan_clip(peer,clip)is not null then raise exception'deleted owner clip remained visible';end if;

  failed:=false;begin perform public.create_mobile_content_fan_clip(peer,'mobile-content','bad','public',array[cert_asset],extensions.gen_random_uuid());exception when others then failed:=sqlerrm like'%FAN_WEB_FORBIDDEN%'or sqlerrm like'%MEDIA_INVALID_ASSET%';end;if not failed then raise exception'invalid clip asset accepted';end if;
  raise notice'MOBILE_CONTENT clip, reaction, certification, moderation and deletion: PASS';
end $$;
rollback;
