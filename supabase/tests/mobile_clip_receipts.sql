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


  result:=public.reserve_owned_mobile_media(owner,'image','fan_clip','image/jpeg',100,media_request);clip_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(owner,clip_asset);job:=public.claim_mobile_media_validation(clip_asset);
  perform public.finish_mobile_media_validation(clip_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,390,null);
  result:=public.create_mobile_content_fan_clip(owner,'mobile-content','first clip','public',array[clip_asset],clip_request);clip:=(result->>'id')::uuid;
  if result#>>'{stamp,status}'<>'preparing' then raise exception 'wallet-less publication did not remain separate from stamp: %',result;end if;
  if public.read_owned_mobile_clip_result(peer,'mobile-content',clip_request) is not null then raise exception 'another owner read receipt';end if;
  if public.read_owned_mobile_clip_result(owner,'wrong-creator',clip_request) is not null then raise exception 'wrong creator read receipt';end if;
  if public.read_owned_mobile_clip_result(owner,'mobile-content',clip_request)->>'id'<>clip::text then raise exception 'published clip receipt missing';end if;
  if exists(select 1 from public.community_stamps where app_user_id=owner and kind='first_clip') then raise exception 'wallet-less clip awarded stamp';end if;
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(owner,91342,'0x'||replace(owner::text,'-','')||'00000000','privy','embedded');
  result:=public.recover_owned_mobile_clip_stamp(owner,'mobile-content',clip_request);
  if result#>>'{stamp,status}'<>'awarded' or result#>>'{stamp,stampId}' is null then raise exception 'stamp recovery failed: %',result;end if;
  result:=public.create_mobile_content_fan_clip(owner,'mobile-content','first clip','public',array[clip_asset],clip_request);
  if result->>'replayed'<>'true' or result#>>'{stamp,status}'<>'awarded' then raise exception 'replayed clip lost stamp: %',result;end if;
  if (select count(*) from public.community_stamps where app_user_id=owner and celebrity_id=celebrity and kind='first_clip')<>1 then raise exception 'stamp duplicated';end if;
  begin
    perform public.assert_community_stamp_source(peer,celebrity,'first_clip','first-clip:'||clip::text);
    raise exception 'wrong owner source accepted';
  exception when sqlstate '22023' then null;end;
  result:=public.reserve_owned_mobile_media(owner,'image','fan_clip','image/jpeg',100,extensions.gen_random_uuid());cert_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(owner,cert_asset);job:=public.claim_mobile_media_validation(cert_asset);
  perform public.finish_mobile_media_validation(cert_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,390,null);
  result:=public.create_mobile_content_fan_clip(owner,'mobile-content','second clip','public',array[cert_asset],cert_request);
  if result#>>'{stamp,status}'<>'already_awarded' then raise exception 'second clip did not report existing award: %',result;end if;
  if (select count(*) from public.community_stamps where app_user_id=owner and kind='first_clip')<>1 then raise exception 'second clip awarded duplicate';end if;
  perform public.remove_mobile_content_fan_clip(owner,clip);
  result:=public.read_owned_mobile_clip_result(owner,'mobile-content',clip_request);
  if result#>>'{stamp,status}'<>'awarded' then raise exception 'deletion revoked valid commemorative stamp';end if;
  if has_function_privilege('service_role','public.mobile_content_first_clip_stamp_result(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.recover_owned_mobile_clip_stamp(uuid,text,uuid)','EXECUTE') then raise exception 'stamp helper privileges leaked';end if;
end $$;
rollback;
