do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Official post tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$ declare
  actor constant uuid:='79000000-0000-4000-8000-000000000001'; peer constant uuid:='79000000-0000-4000-8000-000000000002';
  creator constant uuid:='79000000-0000-4000-8000-000000000003'; admin_id constant uuid:='79000000-0000-4000-8000-000000000004';
  request_id constant uuid:='79000000-0000-4000-8000-000000000005'; result jsonb; job jsonb; asset uuid; video_asset uuid; peer_asset uuid; notice uuid; rejected boolean;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(actor,'did:privy:official-admin','official-admin@example.test'),(peer,'did:privy:official-peer','official-peer@example.test');
  insert into public.admin_allowlist(id,email,role,active) values(admin_id,'official-admin@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(creator,'official-test','draft','/official.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','공식','안내','공식'),(creator,'en','Official','Summary','Official');
  update public.celebrities set status='published',published_at=clock_timestamp() where id=creator;
  if public.read_owned_mobile_official_capability(actor,'official-test','en')->>'canPublish'<>'true'
    or public.read_owned_mobile_official_capability(peer,'official-test')->>'canPublish'<>'false' then raise exception 'author capability invalid'; end if;
  result:=public.reserve_owned_mobile_media(actor,'image','fan_post','image/jpeg',100,extensions.gen_random_uuid()); asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(actor,asset);job:=public.claim_mobile_media_validation(asset);
  perform public.finish_mobile_media_validation(asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,260,null);
  if public.authorize_public_official_media_read(asset,'original') is not null then raise exception 'unpublished image leaked'; end if;
  result:=public.reserve_owned_mobile_media(actor,'video','official_post','video/mp4',1000,extensions.gen_random_uuid()); video_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(actor,video_asset);job:=public.claim_mobile_media_validation(video_asset);
  perform public.finish_mobile_media_validation(video_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'video/mp4',1080,1920,12.5);
  if public.authorize_public_official_media_read(video_asset,'original') is not null
    or public.authorize_public_official_media_read(video_asset,'thumbnail') is not null then raise exception 'unpublished video leaked'; end if;
  result:=public.publish_owned_mobile_official_post(actor,'official-test','공식 소식',array[asset,video_asset],request_id);notice:=(result->>'id')::uuid;
  if public.read_owned_mobile_official_post_result(actor,'official-test',request_id)->>'id'<>notice::text or public.read_owned_mobile_official_post_result(peer,'official-test',request_id) is not null then raise exception 'receipt owner boundary invalid'; end if;
  if result->>'replayed'<>'false' or result->>'revision'<>'2' then raise exception 'publish receipt invalid'; end if;
  if (select post_type from public.celebrity_notices where id=notice)<>'artist_post'
    or (select count(*) from public.fan_posts where app_user_id=actor)<>0 then raise exception 'official post downgraded to a fan post'; end if;
  result:=public.read_fan_notice(null,'official-test',(select slug from public.celebrity_notices where id=notice),'ko');
  if result is null or result::text like '%'||actor::text||'%'
    or result#>>'{body,content,1,attrs,src}'<>'/api/public/notice-media/'||asset::text
    or result#>>'{body,content,2,type}'<>'video'
    or result#>>'{body,content,2,attrs,src}'<>'/api/public/notice-media/'||video_asset::text
    or result#>>'{body,content,2,attrs,poster}'<>'/api/public/notice-media/'||video_asset::text||'?variant=thumbnail'
    or (result#>>'{body,content,2,attrs,durationSeconds}')::numeric<>12.5 then raise exception 'official public identity or media incorrect'; end if;
  if public.authorize_public_official_media_read(asset,'original') is null
    or public.authorize_public_official_media_read(video_asset,'original') is null
    or public.authorize_public_official_media_read(video_asset,'thumbnail') is null then raise exception 'published media unavailable'; end if;
  result:=public.publish_owned_mobile_official_post(actor,'official-test','공식 소식',array[asset,video_asset],request_id);
  if result->>'replayed'<>'true' or (select count(*) from public.mobile_official_post_receipts where app_user_id=actor)<>1 then raise exception 'publish replay duplicated'; end if;
  rejected:=false;begin perform public.publish_owned_mobile_official_post(actor,'official-test','changed',array[asset,video_asset],request_id);exception when others then if sqlerrm='FAN_WEB_CONFLICT' then rejected:=true;else raise;end if;end;
  if not rejected then raise exception 'request payload conflict accepted'; end if;
  rejected:=false;begin perform public.publish_owned_mobile_official_post(peer,'official-test','forged',array[]::uuid[],extensions.gen_random_uuid());exception when others then if sqlerrm='FAN_WEB_FORBIDDEN' then rejected:=true;else raise;end if;end;
  if not rejected then raise exception 'non-author published'; end if;
  result:=public.reserve_owned_mobile_media(peer,'image','fan_post','image/jpeg',100,extensions.gen_random_uuid());peer_asset:=(result->>'assetId')::uuid;
  perform public.queue_owned_mobile_media_validation(peer,peer_asset);job:=public.claim_mobile_media_validation(peer_asset);
  perform public.finish_mobile_media_validation(peer_asset,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',390,260,null);
  rejected:=false;begin perform public.publish_owned_mobile_official_post(actor,'official-test','forged attachment',array[peer_asset],extensions.gen_random_uuid());exception when others then if sqlerrm='FAN_WEB_INVALID_ASSET' then rejected:=true;else raise;end if;end;
  if not rejected then raise exception 'another owner attachment accepted'; end if;
  perform public.set_admin_celebrity_notice_state(actor,admin_id,extensions.gen_random_uuid(),notice,2,'unpublish',null);
  if public.authorize_public_official_media_read(asset,'original') is not null
    or public.authorize_public_official_media_read(video_asset,'original') is not null then raise exception 'unpublished official media remained public'; end if;
  update public.admin_allowlist set role='viewer' where id=admin_id;
  if public.read_owned_mobile_official_capability(actor,'official-test')->>'canPublish'<>'false' then raise exception 'viewer capability writable'; end if;
  rejected:=false;begin perform public.publish_owned_mobile_official_post(actor,'official-test','role changed',array[]::uuid[],extensions.gen_random_uuid());exception when others then if sqlerrm='FAN_WEB_FORBIDDEN' then rejected:=true;else raise;end if;end;
  if not rejected then raise exception 'revoked author published'; end if;
  if has_function_privilege('anon','public.publish_owned_mobile_official_post(uuid,text,text,uuid[],uuid)','execute')
    or has_function_privilege('authenticated','public.authorize_public_official_media_read(uuid,text)','execute')
    or has_table_privilege('authenticated','public.mobile_official_post_receipts','select') then raise exception 'official service boundary exposed'; end if;
end $$;
rollback;
