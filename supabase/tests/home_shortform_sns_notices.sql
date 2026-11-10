-- 20261222150000: TikTok notices become home Shorts. Transaction-only fixtures; every write rolls back.
begin;
do $$
declare c uuid; n1 uuid := 'b1000000-0000-4000-8000-000000000001'; n2 uuid := 'b1000000-0000-4000-8000-000000000002';
  n3 uuid := 'b1000000-0000-4000-8000-000000000003'; u uuid := 'b1000000-0000-4000-8000-0000000000a1';
  href1 text := 'https://www.tiktok.com/@fixture.one/video/7000000000000000001'; r jsonb; v text;
  doc jsonb;
begin
  select id into c from public.celebrities where public.home_gallery_creator_public(id) limit 1;
  if c is null then raise exception 'test requires a public creator'; end if;
  doc := jsonb_build_object('type','doc','content', jsonb_build_array(
    jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text','원문 캡션 #fyp'))),
    jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text',href1,
      'marks', jsonb_build_array(jsonb_build_object('type','link','attrs', jsonb_build_object('href',href1))))))));
  insert into public.celebrity_notices(id, celebrity_id, slug, post_type, visibility) values
    (n1, c, 'tiktok-7000000000000000001', 'artist_post', 'public'),
    (n2, c, 'tiktok-7000000000000000002', 'artist_post', 'members'),
    (n3, c, 'tiktok-fixture-two-links', 'artist_post', 'public');
  insert into public.celebrity_notice_localizations(notice_id, locale, title, body_json) values
    (n1,'ko','원문 캡션 #fyp',doc),(n1,'en','원문 캡션 #fyp',doc),
    (n2,'ko','회원 글',replace(doc::text,'7000000000000000001','7000000000000000002')::jsonb),(n2,'en','회원 글',doc),
    (n3,'ko','두 영상',jsonb_set(doc,'{content}',(doc->'content') || jsonb_build_array(jsonb_build_object('type','paragraph','content',
      jsonb_build_array(jsonb_build_object('type','text','text','x','marks',jsonb_build_array(jsonb_build_object('type','link','attrs',
        jsonb_build_object('href','https://www.tiktok.com/@fixture.one/video/7000000000000000003'))))))))),(n3,'en','두 영상',doc);
  if exists (select 1 from public.home_shortform where source_notice_id in (n1,n2,n3)) then raise exception 'draft notice became a short'; end if;
  update public.celebrity_notices set publication_status='published', published_at=now() + interval '1 day' where id in (n1,n2,n3);

  select video_id into v from public.home_shortform where source_notice_id = n1;
  if v is distinct from '7000000000000000001' then raise exception 'published TikTok notice was not synced: %', v; end if;
  if exists (select 1 from public.home_shortform where source_notice_id in (n2,n3)) then raise exception 'members-only or multi-link notice became a short'; end if;

  r := public.read_public_home_shortform('ko', 12);
  if not exists (select 1 from jsonb_array_elements(r) i where i->>'videoId' = v and i->>'platform' = 'tiktok'
      and i->>'title' = '원문 캡션 #fyp' and i->>'href' = href1) then raise exception 'home read lacks the TikTok short: %', r; end if;
  r := public.read_public_home_shortform_page('ko', 0, 12);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'videoId' = v) then raise exception 'page read lacks the TikTok short'; end if;

  update public.celebrity_notice_localizations set title = '원문 캡션 고침' where notice_id = n1 and locale = 'ko';
  if (select title from public.home_shortform where source_notice_id = n1) <> '원문 캡션 고침' then raise exception 'title edit not synced'; end if;

  insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:fixture:tt-short', 'tt-short@example.invalid');
  r := public.set_shortform_reaction(v, u, 'like');
  if r->>'reaction' <> 'like' then raise exception 'TikTok short reaction failed'; end if;

  update public.celebrity_notices set visibility = 'members' where id = n1;
  if exists (select 1 from jsonb_array_elements(public.read_public_home_shortform('ko', 12)) i where i->>'videoId' = v) then
    raise exception 'short stayed public after its notice became members-only'; end if;

  begin
    insert into public.home_shortform(celebrity_id, video_id, title, href, published_at, platform, source_notice_id)
      values (c, '7000000000000000009', 'x', 'https://www.tiktok.com/@a/video/7000000000000000008', now(), 'tiktok', n3);
    raise exception 'expected shape check';
  exception when check_violation then null; end;
  if has_function_privilege('service_role', 'public.sync_home_shortform_notice(uuid)', 'execute') then raise exception 'sync is callable'; end if;
end $$;
rollback;
