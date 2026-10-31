begin;
do $$
declare
  viewer uuid := 'fa300000-0000-4000-8000-000000000001';
  author uuid := 'fa300000-0000-4000-8000-000000000002';
  blocked_author uuid := 'fa300000-0000-4000-8000-000000000003';
  reverse_blocker uuid := 'fa300000-0000-4000-8000-000000000004';
  disabled_author uuid := 'fa300000-0000-4000-8000-000000000005';
  creator uuid := 'fa300000-0000-4000-8000-000000000010';
  hidden_creator uuid := 'fa300000-0000-4000-8000-000000000011';
  archived_creator uuid := 'fa300000-0000-4000-8000-000000000012';
  admin_id uuid := 'fa300000-0000-4000-8000-000000000013';
  newest uuid := 'fa300000-0000-4000-8000-000000000020';
  older uuid := 'fa300000-0000-4000-8000-000000000021';
  cheer uuid := 'fa300000-0000-4000-8000-000000000022';
  page jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (viewer,'did:privy:home-viewer','home-viewer@example.test'),
    (author,'did:privy:home-author','home-author@example.test'),
    (blocked_author,'did:privy:home-blocked','home-blocked@example.test'),
    (reverse_blocker,'did:privy:home-reverse','home-reverse@example.test'),
    (disabled_author,'did:privy:home-disabled','home-disabled@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (creator,'home-feed-qa','published','/images/creator.webp',now(),'{creator}','creator'),
    (hidden_creator,'home-hidden-qa','published','/images/creator.webp',now(),'{creator}','creator'),
    (archived_creator,'home-archived-qa','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','홈 피드','소개','사진'),
    (hidden_creator,'ko','비공개','소개','사진'),
    (archived_creator,'ko','보관','소개','사진');
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at) values
    (newest,creator,author,'원문 그대로 / Original body','public',extensions.gen_random_uuid(),'new','2026-10-19T12:00:00Z','2026-10-19T12:00:00Z'),
    (older,creator,author,'older public','public',extensions.gen_random_uuid(),'old','2026-10-19T10:00:00Z','2026-10-19T10:00:00Z');
  insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at,deleted_at,hidden_at) values
    (creator,author,'members never on home','members',extensions.gen_random_uuid(),'member','2026-10-20T00:00:00Z',now(),null,null),
    (creator,blocked_author,'viewer blocked author','public',extensions.gen_random_uuid(),'block','2026-10-20T01:00:00Z',now(),null,null),
    (creator,reverse_blocker,'author blocked viewer','public',extensions.gen_random_uuid(),'reverse','2026-10-20T02:00:00Z',now(),null,null),
    (creator,disabled_author,'disabled author','public',extensions.gen_random_uuid(),'disabled','2026-10-20T03:00:00Z',now(),null,null),
    (creator,author,'deleted post','public',extensions.gen_random_uuid(),'deleted','2026-10-20T04:00:00Z',now(),now(),null),
    (creator,author,'hidden post','public',extensions.gen_random_uuid(),'hidden','2026-10-20T05:00:00Z',now(),null,now()),
    (hidden_creator,author,'unpublished creator post','public',extensions.gen_random_uuid(),'draft','2026-10-20T06:00:00Z',now(),null,null),
    (archived_creator,author,'archived creator post','public',extensions.gen_random_uuid(),'archive','2026-10-20T07:00:00Z',now(),null,null);
  insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key,created_at) values
    (cheer,creator,author,'Original cheer',extensions.gen_random_uuid(),'2026-10-19T11:00:00Z');
  insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key,created_at,removed_at) values
    (creator,blocked_author,'blocked cheer',extensions.gen_random_uuid(),'2026-10-20T08:00:00Z',null),
    (creator,reverse_blocker,'reverse blocked cheer',extensions.gen_random_uuid(),'2026-10-20T09:00:00Z',null),
    (creator,author,'removed cheer',extensions.gen_random_uuid(),'2026-10-20T10:00:00Z',now()),
    (creator,disabled_author,'disabled cheer',extensions.gen_random_uuid(),'2026-10-20T11:00:00Z',null);
  update public.app_users set status='disabled' where id=disabled_author;
  update public.celebrities set status='draft' where id=hidden_creator;
  insert into public.admin_allowlist(id,email,role) values(admin_id,'home-author@example.test','operator');
  -- Install the archive-shaped fixture under the local OS database owner, as in fan_lounge_behavior.sql.
  perform pg_catalog.set_config('session_replication_role','replica',true);
  update public.celebrities set archived_at=now(),archived_by_admin_allowlist_id=admin_id,
    archive_reason='홈 피드 보관 상태 검증을 위한 사유' where id=archived_creator;
  perform pg_catalog.set_config('session_replication_role','origin',true);
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values (viewer,blocked_author),(reverse_blocker,viewer);

  page := public.read_public_home_feed(viewer,'en');
  if jsonb_array_length(page->'items')<>3
    or page#>>'{items,0,item,id}'<>newest::text
    or page#>>'{items,1,item,id}'<>cheer::text
    or page#>>'{items,2,item,id}'<>older::text
    or page#>>'{items,0,creatorName}'<>'홈 피드'
    or page#>>'{items,0,item,body}'<>'원문 그대로 / Original body'
    or page#>>'{items,1,item,replyCount}'<>'0' then
    raise exception 'home public visibility before limit, original body, order or locale fallback failed: %',page;
  end if;
  page := public.read_public_home_feed(null,'ko');
  if jsonb_array_length(page->'items')<>3
    or page::text like '%members never on home%'
    or page::text like '%disabled%'
    or page::text like '%removed%'
    or page::text like '%unpublished%'
    or page::text like '%archived%' then
    raise exception 'home guest privacy or limit failed: %',page;
  end if;
  page := public.read_public_home_feed(author,'ko');
  if page::text like '%members never on home%' then raise exception 'owner member-only post leaked to home'; end if;
  update public.celebrities set status='published' where id=hidden_creator;
  page := public.read_public_home_feed(viewer,'ko');
  if page#>>'{items,0,creatorSlug}'<>'home-hidden-qa'
    or page#>>'{items,1,item,id}'<>newest::text
    or page#>>'{items,2,item,id}'<>cheer::text then
    raise exception 'global home feed failed to include a newly published creator: %',page;
  end if;
  insert into public.content_assets(app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,post_id,position)
    values(author,creator,'home-feed-test/older.webp',100,400,300,repeat('a',64),now(),older,0);
  page := public.read_public_home_feed(viewer,'ko');
  if page#>>'{items,0,item,id}'<>older::text then raise exception 'older public media must precede newer text'; end if;
  update public.content_assets set cleanup_requested_at=now() where post_id=older;
  page := public.read_public_home_feed(viewer,'ko');
  if page#>>'{items,0,item,id}'=older::text then raise exception 'unavailable media must not gain priority'; end if;
  if has_function_privilege('anon','public.read_public_home_feed(uuid,public.content_locale)','execute')
    or has_function_privilege('authenticated','public.read_public_home_feed(uuid,public.content_locale)','execute') then
    raise exception 'home RPC caller can impersonate another viewer';
  end if;
end $$;
rollback;
