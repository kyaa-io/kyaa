do $$ declare
  actor constant uuid:='71700000-0000-4000-8000-000000000001';
  request_id constant uuid:='71700000-0000-4000-8000-000000000005';
  snapshot record;result jsonb;job jsonb;video uuid;notice uuid;notice_slug text;
begin
  select * into strict snapshot from public.official_video_upgrade_snapshot;
  select slug into strict notice_slug from public.celebrity_notices where id=snapshot.notice_id;
  result:=public.read_fan_notice(null,'official-video-upgrade',notice_slug,'ko');
  if result#>>'{body,content,1,type}'<>'image'
    or result#>>'{body,content,1,attrs,src}'<>'/api/public/notice-media/'||snapshot.asset_id::text
    or public.authorize_public_official_media_read(snapshot.asset_id,'original') is null then
    raise exception 'legacy official image changed after upgrade: %',result;
  end if;

  result:=public.reserve_owned_mobile_media(actor,'video','official_post','video/mp4',1000,extensions.gen_random_uuid());
  video:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(actor,video);job:=public.claim_mobile_media_validation(video);
  perform public.finish_mobile_media_validation(video,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'video/mp4',1920,1080,12.5);
  result:=public.publish_owned_mobile_official_post(actor,'official-video-upgrade','새 공식 영상',array[video],request_id);
  notice:=(result->>'id')::uuid;
  select slug into strict notice_slug from public.celebrity_notices where id=notice;
  result:=public.read_fan_notice(null,'official-video-upgrade',notice_slug,'ko');
  if result#>>'{body,content,1,type}'<>'video'
    or result#>>'{body,content,1,attrs,src}'<>'/api/public/notice-media/'||video::text
    or result#>>'{body,content,1,attrs,poster}'<>'/api/public/notice-media/'||video::text||'?variant=thumbnail'
    or (result#>>'{body,content,1,attrs,durationSeconds}')::numeric<>12.5
    or public.authorize_public_official_media_read(video,'original') is null
    or public.authorize_public_official_media_read(video,'thumbnail') is null then
    raise exception 'official video contract missing after upgrade: %',result;
  end if;
end $$;
