-- 20261229000000: Instagram video notices become home Shorts. Transaction-only fixtures; every write rolls back.
begin;
do $$
declare c uuid; run uuid := 'b2000000-0000-4000-8000-0000000000f1';
  n_video uuid := 'b2000000-0000-4000-8000-000000000001'; n_photo uuid := 'b2000000-0000-4000-8000-000000000002';
  n_members uuid := 'b2000000-0000-4000-8000-000000000003'; n_late uuid := 'b2000000-0000-4000-8000-000000000004';
  href_video text := 'https://www.instagram.com/fixture.one/p/AbCdEfGhIjK/';
  href_late text := 'https://www.instagram.com/fixture.one/p/LmNoPqRsTuV/';
  r jsonb; shorts_before integer;
begin
  c := 'b2000000-0000-4000-8000-0000000000ce';
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role)
    values (c, 'ig-short-' || left(c::text, 8), 'published', '/fixture.webp', now(), '{creator}', 'creator');
  insert into public.sns_ingest_runs(id, celebrity_id, platform, account_url, correlation_id)
    values (run, c, 'instagram', 'https://www.instagram.com/fixture.one/', run);
  insert into public.celebrity_notices(id, celebrity_id, slug, post_type, visibility) values
    (n_video, c, 'instagram-00000000000000a1', 'artist_post', 'public'),
    (n_photo, c, 'instagram-00000000000000a2', 'artist_post', 'public'),
    (n_members, c, 'instagram-00000000000000a3', 'artist_post', 'members'),
    (n_late, c, 'instagram-00000000000000a4', 'artist_post', 'public');
  insert into public.sns_ingest_posts(notice_id, celebrity_id, platform, slug, source_url, source_published_at, created_run_id, last_run_id) values
    (n_video, c, 'instagram', 'instagram-00000000000000a1', href_video, '2026-11-10T01:02:03Z', run, run),
    (n_photo, c, 'instagram', 'instagram-00000000000000a2', 'https://www.instagram.com/fixture.one/p/PhOtOpHoToX/', '2026-11-10T01:02:04Z', run, run),
    (n_members, c, 'instagram', 'instagram-00000000000000a3', 'https://www.instagram.com/fixture.one/p/MeMbErSoNlY/', '2026-11-10T01:02:05Z', run, run),
    (n_late, c, 'instagram', 'instagram-00000000000000a4', href_late, '2026-11-11T01:02:03Z', run, run);
  insert into public.celebrity_notice_localizations(notice_id, locale, title, body_json)
    select n, l, '원문 캡션 #reels', '{"type":"doc","content":[]}'::jsonb from unnest(array[n_video, n_photo, n_members, n_late]) n, unnest(array['ko','en']::public.content_locale[]) l;
  -- Only the video post has a stored video cover.
  insert into public.video_thumbnails(id, notice_id, storage_path, thumbnail_path, width, height, byte_size, sha256, source_host, source_url) values
    ('b2000000-0000-4000-8000-0000000000c1', n_video, 'sns-ingest/b2000000-0000-4000-8000-000000000001/b2000000-0000-4000-8000-0000000000c1.webp',
     'sns-ingest/b2000000-0000-4000-8000-000000000001/b2000000-0000-4000-8000-0000000000c1-thumbnail.webp', 640, 1138, 1000, repeat('a', 64), 'scontent.cdninstagram.com', href_video),
    ('b2000000-0000-4000-8000-0000000000c3', n_members, 'sns-ingest/b2000000-0000-4000-8000-000000000003/b2000000-0000-4000-8000-0000000000c3.webp',
     'sns-ingest/b2000000-0000-4000-8000-000000000003/b2000000-0000-4000-8000-0000000000c3-thumbnail.webp', 640, 1138, 1000, repeat('b', 64), 'scontent.cdninstagram.com', 'https://www.instagram.com/fixture.one/p/MeMbErSoNlY/');
  if exists (select 1 from public.home_shortform where source_notice_id in (n_video, n_photo, n_members, n_late)) then raise exception 'draft notice became a short'; end if;
  update public.celebrity_notices set publication_status='published', published_at=now() + interval '1 day' where id in (n_video, n_photo, n_members, n_late);

  if (select video_id from public.home_shortform where source_notice_id = n_video) is distinct from 'AbCdEfGhIjK' then raise exception 'published Instagram video was not synced'; end if;
  if exists (select 1 from public.home_shortform where source_notice_id in (n_photo, n_members)) then raise exception 'photo post or members-only video became a short'; end if;
  if (select published_at from public.home_shortform where source_notice_id = n_video) is distinct from '2026-11-10T01:02:03Z'::timestamptz then raise exception 'short must use the source time'; end if;

  r := public.read_public_home_shortform_page('ko', 0, 12);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'videoId' = 'AbCdEfGhIjK' and i->>'platform' = 'instagram'
      and i->>'title' = '원문 캡션 #reels' and i->>'href' = href_video) then raise exception 'page read lacks the Instagram short: %', r; end if;

  -- A cover registered after publication (the backfill of an older video) makes it a short too.
  insert into public.video_thumbnails(id, notice_id, storage_path, thumbnail_path, width, height, byte_size, sha256, source_host, source_url) values
    ('b2000000-0000-4000-8000-0000000000c4', n_late, 'sns-ingest/b2000000-0000-4000-8000-000000000004/b2000000-0000-4000-8000-0000000000c4.webp',
     'sns-ingest/b2000000-0000-4000-8000-000000000004/b2000000-0000-4000-8000-0000000000c4-thumbnail.webp', 640, 1138, 1000, repeat('c', 64), 'scontent.cdninstagram.com', href_late);
  if (select video_id from public.home_shortform where source_notice_id = n_late) is distinct from 'LmNoPqRsTuV' then raise exception 'late cover did not make a short'; end if;
  if (public.read_public_video_thumbnails(array[href_video]) ->> href_video) is not null then raise exception 'a cover without stored objects must not be public'; end if;

  update public.celebrity_notice_localizations set title = '원문 캡션 고침' where notice_id = n_video and locale = 'ko';
  if (select title from public.home_shortform where source_notice_id = n_video) <> '원문 캡션 고침' then raise exception 'title edit not synced'; end if;

  update public.celebrity_notices set visibility = 'members' where id = n_video;
  if exists (select 1 from jsonb_array_elements(public.read_public_home_shortform('ko', 12)) i where i->>'videoId' = 'AbCdEfGhIjK') then
    raise exception 'short stayed public after its notice became members-only'; end if;

  begin
    insert into public.home_shortform(celebrity_id, video_id, title, href, published_at, platform, source_notice_id)
      values (c, 'ZzZzZzZzZzZ', 'x', 'https://www.instagram.com/fixture.one/p/AbCdEfGhIjK/', now(), 'instagram', n_photo);
    raise exception 'expected shape check';
  exception when check_violation then null; end;
  if has_function_privilege('service_role', 'public.home_shortform_instagram_link(uuid)', 'execute') then raise exception 'link reader is callable'; end if;
end $$;
rollback;
