-- Run after the full chain (20261118000000 official authors, 20270115020500 official choice). All fixtures roll back.
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
  operator_user constant uuid:='81800000-0000-4000-8000-000000000012';
  artist_user constant uuid:='81800000-0000-4000-8000-000000000013';
  group_page constant uuid:='81800000-0000-4000-8000-000000000014';
  other_creator constant uuid:='81800000-0000-4000-8000-000000000015';
  other_notice constant uuid:='81800000-0000-4000-8000-000000000016';
  admin_comment constant uuid:='81800000-0000-4000-8000-000000000017';
  other_comment constant uuid:='81800000-0000-4000-8000-000000000018';
  author uuid;
  key uuid;
  result jsonb;
  projected jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_user,'did:privy:official-comment-admin','official-comment-admin@example.test'),
    (viewer_user,'did:privy:official-comment-viewer','official-comment-viewer@example.test'),
    (fan_user,'did:privy:official-comment-fan','official-comment-fan@example.test'),
    (operator_user,'did:privy:official-comment-operator','official-comment-operator@example.test'),
    (artist_user,'did:privy:official-comment-artist','official-comment-artist@example.test');
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

  -- 20270115020500: a comment is official only when its author chose the page name (the transaction-local setting
  -- names the author) and holds that page's own authority. The kyaa-wide admin allowlist alone stays personal.
  insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id) values(creator,operator_user,admin_allow);
  insert into public.group_pages(id,kind,celebrity_id,name) values(group_page,'fan',creator,'공식 아티스트');
  insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values(group_page,artist_user,admin_allow);
  insert into public.group_memberships(page_id,app_user_id)
    select group_page,member from unnest(array[admin_user,operator_user,artist_user,fan_user]) member;
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(other_creator,'official-comment-other','draft','/official-comment-other.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (other_creator,'ko','다른 아티스트','다른 아티스트','다른 아티스트'),(other_creator,'en','Other Artist','Other Artist','Other Artist');
  update public.celebrities set status='published',published_at=clock_timestamp() where id=other_creator;
  insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,post_type) values(other_notice,other_creator,'other-thread','draft','artist_post');
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (other_notice,'ko','다른 글','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"다른 본문"}]}]}'::jsonb),
    (other_notice,'en','Other post','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Other body"}]}]}'::jsonb);
  update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp() where id=other_notice;
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(operator_user,'운영자닉','운영자닉');

  -- Default: personal, whatever the client sends and whatever allowlist role the author has.
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,is_official) values
    (admin_comment,official_notice,admin_user,'관리자 개인 답글',extensions.gen_random_uuid(),true),
    (fan_comment,official_notice,fan_user,'팬 답글',extensions.gen_random_uuid(),true);
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,is_official) values
    (official_notice,viewer_user,'보기 전용 답글',extensions.gen_random_uuid(),true),
    (regular_notice,admin_user,'일반 공지 관리자 답글',extensions.gen_random_uuid(),true),
    (official_notice,operator_user,'운영자 개인 답글',extensions.gen_random_uuid(),true);
  if exists(select 1 from public.celebrity_notice_comments where notice_id in (official_notice,regular_notice) and is_official) then
    raise exception 'A comment became official without the author choosing the page name';
  end if;

  -- Chosen: the page operator and the bound artist become official; the setting must name the author.
  perform pg_catalog.set_config('kyaa.notice_comment_official',operator_user::text,true);
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key) values
    (official_comment,official_notice,operator_user,'공식 답글',extensions.gen_random_uuid());
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values
    (official_notice,fan_user,'다른 사람 이름의 선택',extensions.gen_random_uuid());
  perform pg_catalog.set_config('kyaa.notice_comment_official',artist_user::text,true);
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values
    (regular_notice,artist_user,'아티스트 공식 답글',extensions.gen_random_uuid());
  if not (select is_official from public.celebrity_notice_comments where id=official_comment)
    or not (select is_official from public.celebrity_notice_comments where body='아티스트 공식 답글')
    or (select is_official from public.celebrity_notice_comments where body='다른 사람 이름의 선택') then
    raise exception 'Page authority classification failed';
  end if;

  -- Chosen without the page's authority: the kyaa-wide admin, and the operator on a page it does not run.
  foreach author in array array[admin_user,viewer_user,fan_user] loop
    perform pg_catalog.set_config('kyaa.notice_comment_official',author::text,true);
    begin
      insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values
        (official_notice,author,'권한 없는 공식 선택',extensions.gen_random_uuid());
      raise exception 'Official choice without page authority was stored for %',author;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform pg_catalog.set_config('kyaa.notice_comment_official',operator_user::text,true);
  begin
    insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values
      (other_notice,operator_user,'다른 페이지 공식 선택',extensions.gen_random_uuid());
    raise exception 'Official choice crossed into another page';
  exception when insufficient_privilege then null;
  end;
  perform pg_catalog.set_config('kyaa.notice_comment_official','',true);
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key) values
    (other_comment,other_notice,operator_user,'다른 페이지 개인 답글',extensions.gen_random_uuid());

  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,parent_id)
    values(reply_comment,official_notice,fan_user,'공식 답글의 대댓글',extensions.gen_random_uuid(),official_comment);

  -- The server entry point: the same authority, replies included, and a replayed key keeps its kind.
  begin
    perform public.post_celebrity_notice_comment_as_official(admin_user,'official-comment-test','official-thread','관리자 공식 시도',extensions.gen_random_uuid());
    raise exception 'Admin allowlist posted under the page name';
  exception when insufficient_privilege then null;
  end;
  key:=extensions.gen_random_uuid();
  result:=public.post_celebrity_notice_comment_as_official(operator_user,'official-comment-test','official-thread','운영자 공식 원댓글',key);
  if result->>'replayed'<>'false' or not (select is_official from public.celebrity_notice_comments where id=(result->>'id')::uuid)
    or public.post_celebrity_notice_comment_as_official(operator_user,'official-comment-test','official-thread','운영자 공식 원댓글',key)->>'replayed'<>'true' then
    raise exception 'Official entry point failed: %',result;
  end if;
  result:=public.post_celebrity_notice_comment_as_official(operator_user,'official-comment-test','official-thread','운영자 공식 답글',extensions.gen_random_uuid(),fan_comment);
  if not (select is_official and parent_id=fan_comment from public.celebrity_notice_comments where id=(result->>'id')::uuid) then
    raise exception 'Official reply failed: %',result;
  end if;
  key:=extensions.gen_random_uuid();
  result:=public.post_celebrity_notice_comment(artist_user,'official-comment-test','official-thread','아티스트 개인 원댓글',key);
  if (select is_official from public.celebrity_notice_comments where id=(result->>'id')::uuid) then
    raise exception 'Default entry point wrote an official comment';
  end if;
  begin
    perform public.post_celebrity_notice_comment_as_official(artist_user,'official-comment-test','official-thread','아티스트 개인 원댓글',key);
    raise exception 'A personal key replayed as official';
  exception when check_violation then null;
  end;
  if coalesce(current_setting('kyaa.notice_comment_official',true),'')<>'' then
    raise exception 'Official choice leaked past its call';
  end if;

  -- The composer's names.
  if public.read_notice_comment_author(admin_user,'official-comment-test','ko')<>'{"name":"팬","official":null}'::jsonb
    or public.read_notice_comment_author(operator_user,'official-comment-test','ko')<>
      '{"name":"운영자닉","official":{"name":"공식 아티스트","avatarUrl":"/official-comment-test.webp"}}'::jsonb
    or public.read_notice_comment_author(artist_user,'official-comment-test','en')->'official'->>'name'<>'Official Artist'
    or public.read_notice_comment_author(operator_user,'official-comment-other','ko')->'official'<>'null'::jsonb
    or public.read_notice_comment_author(null,'official-comment-test','ko') is not null then
    raise exception 'Composer author names are invalid';
  end if;

  insert into public.app_user_avatars(app_user_id,initial_character_id,selected_character_id,source,object_path,revision,public_image_id)
    values(fan_user,'star-pink','heart-pink','upload',fan_user::text||'/1-81800000-0000-4000-8000-000000000011.webp',1,
      '81800000-0000-4000-8000-000000000010');
  result:=public.read_celebrity_notice_comments('official-comment-test','official-thread',fan_user,null,null,20,'ko');
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=official_comment::text;
  if projected->>'nickname'<>'공식 아티스트' or projected->>'avatarUrl'<>'/official-comment-test.webp'
    or projected->>'isOfficial'<>'true' or projected->>'isFriend'<>'false'
    or result::text like '%'||operator_user::text||'%' then
    raise exception 'Official public projection is invalid: %',result;
  end if;
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=reply_comment::text;
  if projected->>'parentNickname'<>'공식 아티스트' or projected->>'isOfficial'<>'false' then
    raise exception 'Official parent projection is invalid: %',projected;
  end if;
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=fan_comment::text;
  if projected->>'isOfficial'<>'false' or projected->>'avatarUrl'<>'/api/fan-avatars/81800000-0000-4000-8000-000000000010?revision=1' then
    raise exception 'Fan projection changed: %',projected;
  end if;
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=admin_comment::text;
  if projected->>'nickname'='공식 아티스트' or projected->>'isOfficial'<>'false' then
    raise exception 'Admin comment shows the page name: %',projected;
  end if;
  -- The admin list names the account and, for an official comment, the page name it went out under.
  result:=public.read_admin_notice_comments(admin_user,admin_allow,'official-comment-test',null,null,100);
  if (select item->>'officialName' from jsonb_array_elements(result->'comments') item where item->>'id'=official_comment::text)<>'공식 아티스트'
    or (select item->>'nickname' from jsonb_array_elements(result->'comments') item where item->>'id'=official_comment::text)<>'운영자닉'
    or (select item->'officialName' from jsonb_array_elements(result->'comments') item where item->>'id'=admin_comment::text)<>'null'::jsonb then
    raise exception 'Admin projection is invalid: %',result;
  end if;
  -- The same operator account keeps its own name on a page it does not run.
  result:=public.read_celebrity_notice_comments('official-comment-other','other-thread',fan_user,null,null,20,'ko');
  select item into projected from jsonb_array_elements(result->'comments') item where item->>'id'=other_comment::text;
  if projected->>'nickname'<>'운영자닉' or projected->>'isOfficial'<>'false' then
    raise exception 'Cross-page projection is invalid: %',projected;
  end if;
  if has_function_privilege('service_role','public.set_notice_comment_official_author()','EXECUTE')
    or has_function_privilege('service_role','public.notice_official_author_allowed(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.read_notice_comment_author(uuid,text,public.content_locale)','EXECUTE')
    or not has_function_privilege('service_role','public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)','EXECUTE') then
    raise exception 'Official author authority boundary is exposed';
  end if;
  raise notice 'PASS official notice author choice, page authority, entry point, composer names, projection, and ACL';
end $$;
rollback;
