begin;

do $$
declare
  owner uuid:='5c100000-0000-4000-8000-000000000001';
  creator uuid:='5c100000-0000-4000-8000-000000000002';
  event_id uuid:='5c100000-0000-4000-8000-000000000003';
  album_id uuid:='5c100000-0000-4000-8000-000000000004';
  create_key uuid:='5c100000-0000-4000-8000-000000000005';
  update_key uuid:='5c100000-0000-4000-8000-000000000006';
  delete_key uuid:='5c100000-0000-4000-8000-000000000007';
  create_key2 uuid:='5c100000-0000-4000-8000-000000000008';
  delete_key2 uuid:='5c100000-0000-4000-8000-000000000009';
  post_id uuid;
  post_id2 uuid;
  value jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
  values(owner,'did:privy:event-album-owner','event-album-owner@example.test');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
  values(creator,'event-album-source','draft','/event.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
  values(creator,'ko','행사 테스트','설명','이미지'),(creator,'en','Event test','Summary','Image');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=creator;
  insert into public.mobile_participation_events(
    id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,
    title_ko,title_en,summary_ko,summary_en,hero_url,venue_name_ko,venue_name_en,
    address_ko,address_en,directions_url,featured_rank
  )values(
    event_id,'event-album-contract',creator,'concert','event-v1','published',
    clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours',
    '공연','Concert','요약','Summary','/event-hero.webp','서울 공연장','Seoul Venue',
    '서울시','Seoul','https://maps.example.test/event',1
  );
  insert into public.mobile_participation_contexts(
    id,context_type,source_event_id,celebrity_id,slug,policy_version,state,
    opens_at,closes_at,require_checkin,album_kind
  )values(
    album_id,'album',event_id,creator,'event-album-contract-album','album-v1','published',
    clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours',true,'concert'
  );
  insert into public.mobile_participation_checkins(event_id,app_user_id,status,source,policy_version)
  values(event_id,owner,'valid','linked_web','event-v1');

  value:=public.read_owned_mobile_participation_events_v2(owner,'en',null,null,20);
  if value#>>'{items,0,heroUrl}'<>'/event-hero.webp'
    or value#>>'{items,0,venueName}'<>'Seoul Venue'
    or value#>>'{items,0,address}'<>'Seoul'
    or value#>>'{items,0,featuredRank}'<>'1'then
    raise exception'event presentation projection invalid: %',value;
  end if;
  value:=public.read_owned_mobile_participation_context_v2(owner,'album',album_id,'en',null,null,20);
  if value#>>'{access,allowed}'<>'false'or value#>>'{access,writeAllowed}'<>'true'
    or value#>>'{access,reason}'<>'POST_REQUIRED'or value#>>'{context,albumKind}'<>'concert'
    or value#>>'{event,heroUrl}'<>'/event-hero.webp'then
    raise exception'locked concert album contract invalid: %',value;
  end if;

  value:=public.save_owned_mobile_participation_post_v2(
    owner,'album',album_id,null,'memory','첫 기록','{}',null,create_key
  );post_id:=(value->>'id')::uuid;
  if value->>'replayed'<>'false'or public.save_owned_mobile_participation_post_v2(
    owner,'album',album_id,null,'memory','첫 기록','{}',null,create_key
  )->>'replayed'<>'true'then raise exception'create replay is not stable';end if;
  if public.read_owned_mobile_participation_post_request(owner,create_key)->>'operation'<>'create'
  then raise exception'create request recovery missing';end if;

  value:=public.save_owned_mobile_participation_post_v2(
    owner,'album',album_id,post_id,'memory','수정 기록','{}',1,update_key
  );
  if value->>'revision'<>'2'or public.read_owned_mobile_participation_post_request(owner,update_key)->>'operation'<>'update'
  then raise exception'update request recovery invalid: %',value;end if;
  value:=public.save_owned_mobile_participation_post_v2(
    owner,'album',album_id,null,'memory','두 번째 기록','{}',null,create_key2
  );post_id2:=(value->>'id')::uuid;
  value:=public.remove_owned_mobile_participation_post_v2(owner,post_id,2,delete_key);
  if value->>'removed'<>'true'or value->>'accessLost'<>'false'
    or public.remove_owned_mobile_participation_post_v2(owner,post_id,2,delete_key)->>'replayed'<>'true'
    or public.remove_owned_mobile_participation_post_v2(owner,post_id,2,delete_key)->>'accessLost'<>'false'
    or public.read_owned_mobile_participation_post_request(owner,delete_key)->>'operation'<>'delete'
    or public.read_owned_mobile_participation_post_request(owner,delete_key)->>'accessLost'<>'false'
  then raise exception'delete replay or recovery invalid: %',value;end if;
  value:=public.remove_owned_mobile_participation_post_v2(owner,post_id2,1,delete_key2);
  if value->>'removed'<>'true'or value->>'accessLost'<>'true'
    or public.remove_owned_mobile_participation_post_v2(owner,post_id2,1,delete_key2)->>'replayed'<>'true'
    or public.remove_owned_mobile_participation_post_v2(owner,post_id2,1,delete_key2)->>'accessLost'<>'true'
    or public.read_owned_mobile_participation_post_request(owner,delete_key2)->>'accessLost'<>'true'
  then raise exception'last delete consequence replay invalid: %',value;end if;
  value:=public.read_owned_mobile_participation_context_v2(owner,'album',album_id,'ko',null,null,20);
  if value#>>'{access,allowed}'<>'false'or value#>>'{access,writeAllowed}'<>'true'
  then raise exception'last-post deletion did not relock album: %',value;end if;
end$$;

rollback;
