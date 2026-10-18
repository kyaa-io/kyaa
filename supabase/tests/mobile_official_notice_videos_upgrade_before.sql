do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Official video upgrade tests require disposable local byus_clean';
  end if;
end $$;
begin;
do $$ declare
  actor constant uuid:='71700000-0000-4000-8000-000000000001';
  celebrity constant uuid:='71700000-0000-4000-8000-000000000002';
  allowlist constant uuid:='71700000-0000-4000-8000-000000000003';
  request_id constant uuid:='71700000-0000-4000-8000-000000000004';
  result jsonb;job jsonb;asset uuid;notice uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    values(actor,'did:privy:official-video-upgrade','official-video-upgrade@example.test');
  insert into public.admin_allowlist(id,email,role,active)
    values(allowlist,'official-video-upgrade@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(celebrity,'official-video-upgrade','draft','/official-video-upgrade.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
    (celebrity,'ko','공식 영상 업그레이드','공식 영상 업그레이드','공식 영상 업그레이드'),
    (celebrity,'en','Official video upgrade','Official video upgrade','Official video upgrade');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=celebrity;

  result:=public.reserve_owned_mobile_media(actor,'image','fan_post','image/jpeg',100,extensions.gen_random_uuid());
  asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(actor,asset);job:=public.claim_mobile_media_validation(asset);
  perform public.finish_mobile_media_validation(asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,260,null);
  result:=public.publish_owned_mobile_official_post(actor,'official-video-upgrade','기존 공식 사진',array[asset],request_id);
  notice:=(result->>'id')::uuid;
  if public.authorize_public_official_media_read(asset,'original') is null then
    raise exception 'legacy official image was not public before upgrade';
  end if;
  create table public.official_video_upgrade_snapshot as
    select notice notice_id,asset asset_id;
end $$;
commit;
