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

  page := public.read_unified_creator_feed(p_search=>'fan post',p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'fans',p_limit=>1,p_locale=>'ko');
  if jsonb_array_length(page->'entries') <> 1 or page#>>'{entries,0,item,id}' <> public_post::text or (page->>'hasMore')::boolean then
    raise exception 'search must filter authorized results before pagination: %',page;
  end if;
  page := public.read_unified_creator_feed(p_search=>'private',p_app_user_id=>null,p_slug=>'unified-feed-qa',p_source=>'fans',p_locale=>'ko');
  if jsonb_array_length(page->'entries') <> 0 then raise exception 'private search leaked: %',page; end if;
  page := public.read_unified_creator_feed(p_search=>'Welcome',p_app_user_id=>viewer,p_slug=>'unified-feed-qa',p_source=>'official',p_locale=>'en');
  if page#>>'{entries,0,item,id}' <> welcome::text then raise exception 'locale notice search failed: %',page; end if;
end $$;
rollback;
