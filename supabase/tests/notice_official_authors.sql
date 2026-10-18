-- Run after 20261118000000_notice_official_authors.sql. All fixtures roll back.
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Official notice author tests require disposable local byus_clean';
  end if;
end $$;
begin;
do $$
declare
  admin_user constant uuid:='81800000-0000-4000-8000-000000000001';
  viewer_user constant uuid:='81800000-0000-4000-8000-000000000002';
  fan_user constant uuid:='81800000-0000-4000-8000-000000000003';
  creator constant uuid:='81800000-0000-4000-8000-000000000004';
  official_notice constant uuid:='81800000-0000-4000-8000-000000000005';
  regular_notice constant uuid:='81800000-0000-4000-8000-000000000006';
  official_comment constant uuid:='81800000-0000-4000-8000-000000000007';
  fan_comment constant uuid:='81800000-0000-4000-8000-000000000008';
  reply_comment constant uuid:='81800000-0000-4000-8000-000000000009';
  admin_allow constant uuid:='81800000-0000-4000-8000-000000000010';
  viewer_allow constant uuid:='81800000-0000-4000-8000-000000000011';
  result jsonb;
  projected jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_user,'did:privy:official-comment-admin','official-comment-admin@example.test'),
    (viewer_user,'did:privy:official-comment-viewer','official-comment-viewer@example.test'),
    (fan_user,'did:privy:official-comment-fan','official-comment-fan@example.test');
  insert into public.admin_allowlist(id,email,role,active) values
    (admin_allow,'official-comment-admin@example.test','operator',true),
    (viewer_allow,'official-comment-viewer@example.test','viewer',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(creator,'official-comment-test','draft','/official-comment-test.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','공식 아티스트','공식 아티스트','공식 아티스트'),
    (creator,'en','Official Artist','Official Artist','Official Artist');
  update public.celebrities set status='published',published_at=clock_timestamp() where id=creator;
  insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,post_type) values
    (official_notice,creator,'official-thread','draft','artist_post'),
    (regular_notice,creator,'regular-thread','draft','notice');
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (official_notice,'ko','공식 글','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"공식 본문"}]}]}'::jsonb),
    (official_notice,'en','Official post','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Official body"}]}]}'::jsonb),
    (regular_notice,'ko','일반 공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"일반 본문"}]}]}'::jsonb),
    (regular_notice,'en','Regular notice','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Regular body"}]}]}'::jsonb);
  update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp()
  where id in (official_notice,regular_notice);

  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,is_official) values
    (official_comment,official_notice,admin_user,'공식 답글',extensions.gen_random_uuid(),false),
    (fan_comment,official_notice,fan_user,'팬 답글',extensions.gen_random_uuid(),true);
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,is_official) values
    (official_notice,viewer_user,'보기 전용 답글',extensions.gen_random_uuid(),true),
    (regular_notice,admin_user,'일반 공지 관리자 답글',extensions.gen_random_uuid(),true);
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,parent_id)
    values(reply_comment,official_notice,fan_user,'공식 답글의 대댓글',extensions.gen_random_uuid(),official_comment);

  if not (select is_official from public.celebrity_notice_comments where id=official_comment)
    or (select is_official from public.celebrity_notice_comments where id=fan_comment)
    or exists(select 1 from public.celebrity_notice_comments where body in ('보기 전용 답글','일반 공지 관리자 답글') and is_official) then
    raise exception 'Server-owned official author classification failed';
  end if;

  result:=public.read_celebrity_notice_comments('official-comment-test','official-thread',fan_user,null,null,20,'ko');
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=official_comment::text;
  if projected->>'nickname'<>'공식 아티스트' or projected->>'avatarUrl'<>'/official-comment-test.webp'
    or projected->>'isOfficial'<>'true' or projected->>'isFriend'<>'false'
    or result::text like '%'||admin_user::text||'%' then
    raise exception 'Official public projection is invalid: %',result;
  end if;
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=reply_comment::text;
  if projected->>'parentNickname'<>'공식 아티스트' or projected->>'isOfficial'<>'false' then
    raise exception 'Official parent projection is invalid: %',projected;
  end if;
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=fan_comment::text;
  if projected->>'isOfficial'<>'false' or projected->>'avatarUrl'<>'/images/avatars/star-pink.webp' then
    raise exception 'Fan projection changed: %',projected;
  end if;
  if has_function_privilege('service_role','public.set_notice_comment_official_author()','EXECUTE')
    or has_function_privilege('authenticated','public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)','EXECUTE') then
    raise exception 'Official author authority boundary is exposed';
  end if;
  raise notice 'PASS official notice author classification, canonical projection, parent identity, and ACL';
end $$;
rollback;
