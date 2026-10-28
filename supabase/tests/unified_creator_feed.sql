-- Disposable latest-chain database only. Fixtures roll back.
begin;
do $$
declare
  viewer uuid := 'fa100000-0000-4000-8000-000000000001';
  author uuid := 'fa100000-0000-4000-8000-000000000002';
  blocked_author uuid := 'fa100000-0000-4000-8000-000000000003';
  creator uuid := 'fa100000-0000-4000-8000-000000000004';
  welcome uuid := 'fa100000-0000-4000-8000-000000000005';
  standard_notice uuid := 'fa100000-0000-4000-8000-00000000000a';
  public_post uuid := 'fa100000-0000-4000-8000-000000000006';
  private_post uuid := 'fa100000-0000-4000-8000-000000000007';
  blocked_post uuid := 'fa100000-0000-4000-8000-000000000008';
  cheer uuid := 'fa100000-0000-4000-8000-000000000009';
  disabled_author uuid := 'fa100000-0000-4000-8000-00000000000b';
  page jsonb;
  next_page jsonb;
  cheer_item jsonb;
  video_post uuid := extensions.gen_random_uuid();
  text_post uuid := extensions.gen_random_uuid();
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (viewer,'did:privy:feed-viewer','feed-viewer@example.test'),
    (author,'did:privy:feed-author','feed-author@example.test'),
    (blocked_author,'did:privy:feed-blocked','feed-blocked@example.test');
  insert into public.app_users(id,privy_user_id,verified_email,status)
    values(disabled_author,'did:privy:feed-disabled','feed-disabled@example.test','active');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'unified-feed-qa','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','통합 피드','소개','사진'),(creator,'en','Unified feed','Summary','Photo');

  insert into public.celebrity_notices(id,celebrity_id,slug,notice_kind,publication_status,pinned,published_at,ever_published_at)
    values
      (welcome,creator,'welcome-feed','welcome','published',true,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),
      (standard_notice,creator,'standard-feed','standard','published',true,'2026-09-15T00:00:00Z','2026-09-15T00:00:00Z');
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (welcome,'ko','환영합니다','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"환영합니다"}]}]}'::jsonb),
    (welcome,'en','Welcome','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Welcome"}]}]}'::jsonb),
    (standard_notice,'ko','중요 공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"중요 공지"}]}]}'::jsonb),
    (standard_notice,'en','Important notice','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Important notice"}]}]}'::jsonb);

  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at) values
    (public_post,creator,author,'public fan post','public',extensions.gen_random_uuid(),'public','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
    (private_post,creator,author,'private fan post','members',extensions.gen_random_uuid(),'private','2026-10-03T00:00:00Z','2026-10-03T00:00:00Z'),
    (blocked_post,creator,blocked_author,'blocked fan post','public',extensions.gen_random_uuid(),'blocked','2026-10-02T00:00:00Z','2026-10-02T00:00:00Z');
  insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key,created_at)
    values(cheer,creator,author,'cheer',extensions.gen_random_uuid(),'2026-08-01T00:00:00Z');
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(viewer,blocked_author);
  insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key,reply_to_id,removed_at) values
    (creator,author,'visible reply',extensions.gen_random_uuid(),cheer,null),
    (creator,blocked_author,'blocked reply',extensions.gen_random_uuid(),cheer,null),
    (creator,disabled_author,'disabled reply',extensions.gen_random_uuid(),cheer,null),
    (creator,author,'removed reply',extensions.gen_random_uuid(),cheer,now());
  insert into public.fan_lounge_message_reactions(message_id,app_user_id,emoji) values
    (cheer,viewer,'👏'),(cheer,author,'👏'),(cheer,blocked_author,'👏'),(cheer,disabled_author,'👏'),(cheer,author,'👍');
  update public.app_users set status='disabled' where id=disabled_author;
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key) values
    (welcome,author,'visible comment',extensions.gen_random_uuid()),
    (welcome,blocked_author,'blocked comment',extensions.gen_random_uuid());

  page := public.read_unified_creator_feed(
    p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'all',p_limit=>2,p_locale=>'ko'
  );
  if jsonb_array_length(page->'entries')<>2
     or page#>>'{entries,0,item,id}'<>standard_notice::text
     or page#>>'{entries,0,pinRank}'<>'2'
     or page#>>'{entries,1,item,id}'<>welcome::text
     or page#>>'{entries,1,pinRank}'<>'1'
     or page#>>'{entries,1,item,noticeKind}'<>'welcome'
     or page#>>'{entries,1,item,commentCount}'<>'1' then
    raise exception 'pinned notice priority or filtered comment count failed: %',page;
  end if;

  next_page := public.read_unified_creator_feed(
    p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'all',p_before_rank=>1,
    p_before_at=>(page#>>'{entries,1,item,publishedAt}')::timestamptz,
    p_before_kind=>'notice',p_before_id=>welcome,p_limit=>1,p_locale=>'ko'
  );
  if next_page#>>'{entries,0,item,id}'<>public_post::text then
    raise exception 'visibility was applied after limit or cursor skipped the public row: %',next_page;
  end if;
  if next_page::text like '%'||private_post::text||'%' or next_page::text like '%'||blocked_post::text||'%' then
    raise exception 'private or blocked row leaked: %',next_page;
  end if;

  page := public.read_unified_creator_feed(
    p_app_user_id=>null,p_slug=>'unified-feed-qa',p_source=>'official',p_news=>'notice',p_limit=>20,p_locale=>'en'
  );
  if page#>>'{entries,0,item,title}'<>'Important notice'
     or page#>>'{entries,0,item,commentCount}'<>'0'
     or page#>>'{entries,1,item,title}'<>'Welcome'
     or page#>>'{entries,1,item,commentCount}'<>'2' then
    raise exception 'official locale/subtype or guest comment count failed: %',page;
  end if;

  update public.celebrity_notices set pinned=false where id=welcome;
  page := public.read_unified_creator_feed(
    p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'official',p_news=>'notice',p_limit=>20,p_locale=>'ko'
  );
  if page#>>'{entries,1,item,id}'<>welcome::text or page#>>'{entries,1,pinRank}'<>'0' then
    raise exception 'unpinned welcome notice was promoted: %',page;
  end if;

  page := public.read_unified_creator_feed(
    p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'fans',p_limit=>20,p_locale=>'ko'
  );
  if page::text like '%'||welcome::text||'%' or page::text not like '%'||public_post::text||'%' or page::text not like '%'||cheer::text||'%' then
    raise exception 'fan source filter failed: %',page;
  end if;
  select entry->'item' into cheer_item from jsonb_array_elements(page->'entries') entry
    where entry#>>'{item,id}'=cheer::text;
  if cheer_item->'replyCount' is distinct from '1'::jsonb
     or cheer_item->'clapCount' is distinct from '2'::jsonb
     or cheer_item->'viewerClapped' is distinct from 'true'::jsonb then
    raise exception 'unified cheer counters missing or blocked/removed activity leaked: %',cheer_item;
  end if;
  page := public.read_unified_creator_feed(
    p_app_user_id=>null,p_slug=>'unified-feed-qa',p_source=>'fans',p_limit=>20,p_locale=>'ko'
  );
  select entry->'item' into cheer_item from jsonb_array_elements(page->'entries') entry
    where entry#>>'{item,id}'=cheer::text;
  if cheer_item->'replyCount' is distinct from '2'::jsonb
     or cheer_item->'clapCount' is distinct from '3'::jsonb
     or cheer_item->'viewerClapped' is distinct from 'false'::jsonb then
    raise exception 'unified cheer guest counters or viewer reaction incorrect: %',cheer_item;
  end if;
  -- Newer text, members-only and blocked rows must not consume a media page.
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at) values
    (text_post,creator,author,'new text only','public',extensions.gen_random_uuid(),'text','2026-10-05T00:00:00Z','2026-10-05T00:00:00Z'),
    (video_post,creator,author,'older video','public',extensions.gen_random_uuid(),'video','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
  insert into public.content_assets(app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,post_id,position)
    select app_user_id,celebrity_id,'media-feed/'||id,100,100,100,repeat('a',64),clock_timestamp(),id,0
    from public.fan_posts where id in(public_post,private_post,blocked_post);
  insert into public.mobile_media_assets(app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,request_id,request_hash,width,height,duration_seconds,attached_type,attached_id,access_scope)
    values(author,'video','wave_post','video/mp4',100,100,'media-feed/video','media-feed/video-thumb','ready',extensions.gen_random_uuid(),repeat('b',64),100,100,10,'fan_post',video_post,'fan_post');

  page := public.read_unified_creator_feed(p_media_only=>true,p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_limit=>1);
  if jsonb_array_length(page->'entries')<>1 or page#>>'{entries,0,item,id}'<>public_post::text or page->>'hasMore'<>'true' then
    raise exception 'media visibility/filter must precede limit: %',page;
  end if;
  next_page := public.read_unified_creator_feed(p_media_only=>true,p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_limit=>1,
    p_before_rank=>0,p_before_at=>(page#>>'{entries,0,item,createdAt}')::timestamptz,p_before_kind=>'fan_post',p_before_id=>public_post);
  if jsonb_array_length(next_page->'entries')<>1 or next_page#>>'{entries,0,item,id}'<>video_post::text
     or next_page#>'{entries,0,item,video}'='null'::jsonb or next_page->>'hasMore'<>'false' then
    raise exception 'media image/video cursor failed: %',next_page;
  end if;
  page := public.read_unified_creator_feed(p_media_only=>true,p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'official');
  if jsonb_array_length(page->'entries')<>0 then raise exception 'official source leaked into media-only fan posts'; end if;
  page := public.read_unified_creator_feed(p_media_only=>false,p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'fans');
  if page is distinct from public.read_unified_creator_feed(p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'fans') then
    raise exception 'ordinary RPC overload changed existing feed';
  end if;
  page := public.read_unified_creator_feed(p_media_only=>true,p_app_user_id=>null,p_slug=>'unified-feed-qa',p_source=>'fans');
  if page::text like '%'||private_post::text||'%' or page::text like '%'||text_post::text||'%' or page::text like '%'||cheer::text||'%' then
    raise exception 'media guest private/text/cheer leak: %',page;
  end if;
end $$;
rollback;
