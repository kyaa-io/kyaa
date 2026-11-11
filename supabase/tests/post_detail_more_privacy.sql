-- Disposable latest-chain database only. Fixtures roll back.
-- The '이 페이지의 다른 글' rail on a post detail reads the page's popular ranking (week) and its fan feed (source fans),
-- so a members-only post must stay out of both for a guest and for a signed-in non-member, and stay in them for a passport holder.
begin;
do $$
declare
  creator uuid := 'fb100000-0000-4000-8000-000000000001';
  author uuid := 'fb100000-0000-4000-8000-000000000002';
  member uuid := 'fb100000-0000-4000-8000-000000000003';
  outsider uuid := 'fb100000-0000-4000-8000-000000000004';
  public_post uuid := 'fb100000-0000-4000-8000-000000000005';
  members_post uuid := 'fb100000-0000-4000-8000-000000000006';
  page jsonb;
  ids text[];
  expected text[];
  viewer uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (author,'did:privy:rel-author','rel-author@example.test'),
    (member,'did:privy:rel-member','rel-member@example.test'),
    (outsider,'did:privy:rel-outsider','rel-outsider@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'related-privacy-qa','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(creator,'ko','관련 글 시험','소개','사진');
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at) values
    (public_post,creator,author,'public related post','public',extensions.gen_random_uuid(),'public',now()-interval '2 hours',now()-interval '2 hours'),
    (members_post,creator,author,'members related post','members',extensions.gen_random_uuid(),'members',now()-interval '1 hour',now()-interval '1 hour');
  -- The passport row only has to satisfy the member check; its issuing chain is not under test.
  set local session_replication_role = replica;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at)
    values(extensions.gen_random_uuid(),member,creator,extensions.gen_random_uuid(),extensions.gen_random_uuid(),now());
  set local session_replication_role = origin;
  if not public.fan_web_is_member(member,creator) then raise exception 'fixture member is not a member'; end if;

  foreach viewer in array array[null,outsider,member] loop
    expected := case when viewer = member then array[members_post::text,public_post::text] else array[public_post::text] end;
    page := public.read_unified_creator_feed(p_app_user_id=>viewer,p_slug=>'related-privacy-qa',p_source=>'fans',p_limit=>12,p_locale=>'ko');
    select array_agg(e#>>'{item,id}' order by e#>>'{item,id}' desc) into ids from jsonb_array_elements(page->'entries') e;
    if ids is distinct from expected then raise exception 'latest rail for % must hold %: %',coalesce(viewer::text,'guest'),expected,page; end if;
    page := public.read_fan_post_period_ranking(p_app_user_id=>viewer,p_slug=>'related-privacy-qa',p_period=>'week',p_locale=>'ko');
    select array_agg(e->>'id' order by e->>'id' desc) into ids from jsonb_array_elements(page->'items') e;
    if ids is distinct from expected then raise exception 'popular rail for % must hold %: %',coalesce(viewer::text,'guest'),expected,page; end if;
  end loop;
end $$;
rollback;
