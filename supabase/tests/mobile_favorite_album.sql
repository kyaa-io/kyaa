do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Mobile favorite album tests require disposable local byus_clean';
  end if;
end $$;

begin;
do $$
declare
  owner uuid:='7a100000-0000-4000-8000-000000000001';
  peer uuid:='7a100000-0000-4000-8000-000000000002';
  stranger uuid:='7a100000-0000-4000-8000-000000000003';
  creator uuid:='7a100000-0000-4000-8000-000000000010';
  other_creator uuid:='7a100000-0000-4000-8000-000000000011';
  quiz uuid:='7a100000-0000-4000-8000-000000000012';
  attempt uuid:='7a100000-0000-4000-8000-000000000013';
  pass uuid:='7a100000-0000-4000-8000-000000000014';
  passport uuid:='7a100000-0000-4000-8000-000000000015';
  chain_job uuid:='7a100000-0000-4000-8000-000000000016';
  visible_post uuid:='7a100000-0000-4000-8000-000000000020';
  blocked_post uuid:='7a100000-0000-4000-8000-000000000021';
  deleted_post uuid:='7a100000-0000-4000-8000-000000000022';
  other_post uuid:='7a100000-0000-4000-8000-000000000023';
  visible_clip uuid:='7a100000-0000-4000-8000-000000000024';
  image_asset uuid:='7a100000-0000-4000-8000-000000000030';
  blocked_asset uuid:='7a100000-0000-4000-8000-000000000031';
  deleted_asset uuid:='7a100000-0000-4000-8000-000000000032';
  other_asset uuid:='7a100000-0000-4000-8000-000000000033';
  removed_media uuid:='7a100000-0000-4000-8000-000000000034';
  video_asset uuid:='7a100000-0000-4000-8000-000000000035';
  value jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values
    (owner,'did:privy:favorite-album-owner','favorite-album-owner@example.test'),
    (peer,'did:privy:favorite-album-peer','favorite-album-peer@example.test'),
    (stranger,'did:privy:favorite-album-stranger','favorite-album-stranger@example.test');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values
    (creator,'favorite-album','draft','/favorite-album.webp','{creator}','creator'),
    (other_creator,'other-favorite','draft','/other-favorite.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
    (creator,'ko','앨범 최애','설명','최애'),(creator,'en','Album favorite','Summary','Favorite'),
    (other_creator,'ko','다른 최애','설명','다른 최애'),(other_creator,'en','Other favorite','Summary','Other favorite');
  update public.celebrities set status='published',published_at=clock_timestamp()
    where id in(creator,other_creator);
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,creator,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(attempt,owner,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass,owner,creator,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values(chain_job,'passport',passport,'favorite-album-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
    values(passport,owner,creator,pass,chain_job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;

  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,deleted_at)values
    (visible_post,creator,owner,'보이는 사진','public',extensions.gen_random_uuid(),'visible',clock_timestamp(),null),
    (blocked_post,creator,peer,'차단 작성자 사진','public',extensions.gen_random_uuid(),'blocked',clock_timestamp()-interval'1 second',null),
    (deleted_post,creator,owner,'삭제된 사진','public',extensions.gen_random_uuid(),'deleted',clock_timestamp()-interval'2 seconds',clock_timestamp()),
    (other_post,other_creator,owner,'다른 최애 사진','public',extensions.gen_random_uuid(),'other',clock_timestamp()-interval'3 seconds',null);
  insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values
    (visible_clip,creator,owner,'보이는 영상','members',extensions.gen_random_uuid(),repeat('a',64),clock_timestamp()-interval'4 seconds');
  insert into public.user_blocks(app_user_id,blocked_app_user_id)values(owner,peer);

  insert into public.mobile_media_assets(
    id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,
    request_id,request_hash,width,height,duration_seconds,attached_type,attached_id,attached_version,position,access_scope,
    ready_at,storage_deleted_at
  )values
    (image_asset,owner,'image','fan_post','image/jpeg',100,100,'favorite/image','favorite/image-thumb','ready',extensions.gen_random_uuid(),'image',390,390,null,'fan_post',visible_post,1,0,'fan_post',clock_timestamp(),null),
    (blocked_asset,peer,'image','fan_post','image/jpeg',100,100,'favorite/blocked','favorite/blocked-thumb','ready',extensions.gen_random_uuid(),'blocked',390,390,null,'fan_post',blocked_post,1,0,'fan_post',clock_timestamp(),null),
    (deleted_asset,owner,'image','fan_post','image/jpeg',100,100,'favorite/deleted','favorite/deleted-thumb','ready',extensions.gen_random_uuid(),'deleted',390,390,null,'fan_post',deleted_post,1,0,'fan_post',clock_timestamp(),null),
    (other_asset,owner,'image','fan_post','image/jpeg',100,100,'favorite/other','favorite/other-thumb','ready',extensions.gen_random_uuid(),'other',390,390,null,'fan_post',other_post,1,0,'fan_post',clock_timestamp(),null),
    (removed_media,owner,'image','fan_post','image/jpeg',100,100,'favorite/removed','favorite/removed-thumb','ready',extensions.gen_random_uuid(),'removed',390,390,null,'fan_post',visible_post,1,1,'fan_post',clock_timestamp(),clock_timestamp()),
    (video_asset,owner,'video','fan_clip','video/mp4',100,100,'favorite/video','favorite/video-thumb','ready',extensions.gen_random_uuid(),'video',1080,1920,12,'fan_clip',visible_clip,1,0,'fan_clip',clock_timestamp(),null);

  value:=public.read_owned_mobile_favorite_album(owner,passport,'ko',null,null,20);
  if value#>>'{favorite,slug}'<>'favorite-album' or value#>>'{favorite,name}'<>'앨범 최애'
    or value#>>'{sourceAvailable}'<>'true' or jsonb_array_length(value->'items')<>2
    or value#>>'{items,0,id}'<>image_asset::text or value#>>'{items,1,id}'<>video_asset::text
    or value::text like '%favorite/blocked%' or value::text like '%storagePath%'
  then raise exception'favorite album scope or ACL filtering invalid: %',value;end if;
  if public.authorize_mobile_media_read(owner,image_asset,'thumbnail') is null
    or public.authorize_mobile_media_read(owner,removed_media,'thumbnail') is not null
  then raise exception'favorite album media ACL diverged';end if;
  if public.read_owned_mobile_favorite_album(stranger,passport,'ko',null,null,20) is not null
  then raise exception'passport ownership was not enforced';end if;

  update public.celebrities set status='draft',published_at=null where id=creator;
  value:=public.read_owned_mobile_favorite_album(owner,passport,'ko',null,null,20);
  if value#>>'{sourceAvailable}'<>'false' or jsonb_array_length(value->'items')<>0
    or value#>>'{favorite,name}'<>'앨범 최애'
  then raise exception'inaccessible source did not preserve summary only: %',value;end if;
end $$;
rollback;
