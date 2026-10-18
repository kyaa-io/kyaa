do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;end$$;
begin;
do $$<<behavior>>
declare
  owner uuid:='7c100000-0000-4000-8000-000000000001';
  author uuid:='7c100000-0000-4000-8000-000000000002';
  artist uuid:='7c100000-0000-4000-8000-000000000003';
  allow_id uuid:='7c100000-0000-4000-8000-000000000004';
  event_id uuid:='7c100000-0000-4000-8000-000000000005';
  context_id uuid:='7c100000-0000-4000-8000-000000000006';
  post_id uuid:='7c100000-0000-4000-8000-000000000007';
  asset_id uuid:='7c100000-0000-4000-8000-000000000008';
  space_id uuid;result jsonb;old_revision integer;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values
    (owner,'did:privy:media-summary-owner','media-summary-owner@example.test'),
    (author,'did:privy:media-summary-author','media-summary-author@example.test');
  insert into public.admin_allowlist(id,email,role,active)values(allow_id,'media-summary-owner@example.test','operator',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(artist,'media-summary','draft','/favorite.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(artist,'ko','공간','설명','사진'),(artist,'en','Space','Description','Photo');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=artist;
  result:=public.upsert_admin_mobile_participation_space_v2(owner,allow_id,null,null,artist,'media-summary-space','v1','published',
    clock_timestamp()+interval'1 day',clock_timestamp()+interval'2 days',null,'카페','Cafe','','','/cafe.webp','서울','Seoul','공간 사진과 운영 정보를 등록합니다.',extensions.gen_random_uuid(),'/cafe-inside.webp');
  space_id:=(result->>'id')::uuid;
  result:=public.read_owned_mobile_participation_space(owner,space_id,'ko');
  if result#>>'{space,interiorImageUrl}'<>'/cafe-inside.webp' or result#>>'{space,scanAllowed}'<>'false' or result#>>'{space,state}'<>'upcoming'
    then raise exception 'Interior photo changed venue access';end if;
  begin
    perform public.upsert_admin_mobile_participation_space_v2(owner,allow_id,space_id,1,artist,'media-summary-space','v1','published',
      clock_timestamp()+interval'1 day',clock_timestamp()+interval'2 days',null,'카페','Cafe','','','/cafe.webp','서울','Seoul','유효하지 않은 사진 주소 변경 테스트',extensions.gen_random_uuid(),'//outside.test/image.jpg');
    raise exception 'Unsafe media address accepted';
  exception when others then if sqlerrm<>'MOBILE_PARTICIPATION_INVALID'then raise;end if;end;
  update public.admin_allowlist set role='viewer'where id=allow_id;
  begin
    perform public.upsert_admin_mobile_participation_space_v2(owner,allow_id,space_id,1,artist,'media-summary-space','v1','published',
      clock_timestamp()+interval'1 day',clock_timestamp()+interval'2 days',null,'카페','Cafe','','','/cafe.webp','서울','Seoul','읽기 전용 운영자 권한 검증 테스트',extensions.gen_random_uuid(),null);
    raise exception 'Viewer changed interior media';
  exception when others then if sqlerrm<>'viewer is read-only'then raise;end if;end;
  if(select revision from public.mobile_participation_spaces where id=space_id)<>1 then raise exception 'Failed update changed revision';end if;

  insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en)
    values(event_id,'media-summary-event',artist,'general','v1','ended',clock_timestamp()-interval'2 days',clock_timestamp()-interval'1 day','지난 행사','Past event');
  insert into public.mobile_participation_contexts(id,context_type,source_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at,require_checkin)
    values(context_id,'event',event_id,artist,'media-summary-context','v1','published',clock_timestamp()-interval'2 days',clock_timestamp()+interval'1 day',false);
  insert into public.mobile_participation_posts(id,context_id,app_user_id,kind,body,request_key,payload_hash)
    values(post_id,context_id,author,'photo','사진',extensions.gen_random_uuid(),repeat('a',32));
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,request_id,request_hash,width,height,attached_type,attached_id,access_scope)
    values(asset_id,author,'image','participation','image/jpeg',100,100,'test/summary.jpg','test/summary-thumb.webp','ready',extensions.gen_random_uuid(),'summary',100,100,'participation_post',post_id,'participation');
  insert into public.mobile_participation_post_media(post_id,asset_id,position)values(post_id,asset_id,0);
  result:=public.read_owned_mobile_participation_catalog(owner,'ko','past','event','media-summary',null,null,null,20);
  if result#>>'{items,0,mediaSummary,postCount}'<>'1' or result#>>'{items,0,mediaSummary,photoCount}'<>'1' or result#>>'{items,0,mediaSummary,videoCount}'<>'0'
    then raise exception 'Actual media summary missing: %',result;end if;
  if public.authorize_mobile_media_read(owner,asset_id,'original') is null then raise exception 'Visible media unreadable';end if;
  insert into public.user_blocks(app_user_id,blocked_app_user_id)values(owner,author);
  result:=public.read_owned_mobile_participation_catalog(owner,'ko','past','event','media-summary',null,null,null,20);
  if result#>>'{items,0,mediaSummary,postCount}'<>'0' or result#>>'{items,0,mediaSummary,photoCount}'<>'0'
    or public.authorize_mobile_media_read(owner,asset_id,'original')is not null
    or public.authorize_mobile_media_read(owner,asset_id,'thumbnail')is not null then raise exception 'Blocked content remained visible';end if;
  delete from public.user_blocks where app_user_id=owner and blocked_app_user_id=author;
  update public.mobile_media_assets set storage_deleted_at=clock_timestamp()where id=asset_id;
  result:=public.read_owned_mobile_participation_catalog(owner,'ko','past','event','media-summary',null,null,null,20);
  if result#>>'{items,0,mediaSummary,photoCount}'<>'0' then raise exception 'Deleted media counted';end if;
  update public.mobile_participation_contexts set require_checkin=true where id=context_id;
  result:=public.read_owned_mobile_participation_catalog(owner,'ko','past','event','media-summary',null,null,null,20);
  if result#>'{items,0,mediaSummary}'<>'null'::jsonb then raise exception 'Locked context counts exposed';end if;
  if has_function_privilege('authenticated','public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale)','EXECUTE')
    or has_function_privilege('service_role','public.authorize_mobile_media_read_before_participation_visibility(uuid,uuid,text)','EXECUTE')
    then raise exception 'Media boundary bypass exposed';end if;
end$$;
rollback;
