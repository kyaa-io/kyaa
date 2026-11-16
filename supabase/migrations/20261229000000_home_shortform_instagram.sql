-- Instagram videos (reels) of the creators' official accounts join the home Shorts, like the TikTok videos of 20261222150000.
-- The SNS collector saves an Instagram post as a source-only notice (slug "instagram-<16 hex>") and, for a video post, registers the
-- video's cover in video_thumbnails. A notice qualifies when it is public, published, not archived, collected from the registered
-- official Instagram account (sns_ingest_posts) and has such a cover. The short's title is the notice's own ko title (the original
-- caption excerpt) and its time is the post's source time; nothing is written that the notice does not already hold.
-- Instagram has no in-app player here: the card opens the original post (home_shortform.href).
begin;
set local lock_timeout = '5s';

alter table public.home_shortform drop constraint home_shortform_source_shape;
alter table public.home_shortform add constraint home_shortform_source_shape check (
  (platform = 'youtube' and source_notice_id is null and video_id ~ '^[A-Za-z0-9_-]{11}$'
    and href = 'https://www.youtube.com/watch?v=' || video_id)
  or (platform = 'tiktok' and source_notice_id is not null and video_id ~ '^[0-9]{15,25}$'
    and href ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._]{1,64}/video/[0-9]{15,25}$'
    and split_part(href, '/video/', 2) = video_id)
  or (platform = 'instagram' and source_notice_id is not null and video_id ~ '^[A-Za-z0-9_-]{11}$'
    and href ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}/(p|reel)/[A-Za-z0-9_-]{11}/$'
    and split_part(href, '/', 6) = video_id));

create function public.home_shortform_instagram_link(p_notice_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.source_url
  from public.sns_ingest_posts p
  join public.celebrity_notices n on n.id = p.notice_id and n.slug like 'instagram-%'
  where p.notice_id = p_notice_id and p.platform = 'instagram'
    and p.source_url ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}/(p|reel)/[A-Za-z0-9_-]{11}/$'
    and exists (select 1 from public.video_thumbnails t where t.notice_id = p.notice_id);
$$;

create or replace function public.sync_home_shortform_notice(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_href text; v_title text; v_celebrity uuid; v_published timestamptz; v_platform text;
begin
  select case when n.slug like 'instagram-%' then public.home_shortform_instagram_link(n.id) else public.home_shortform_notice_link(n.id) end,
    case when n.slug like 'instagram-%' then 'instagram' else 'tiktok' end,
    btrim(l.title), n.celebrity_id, coalesce((select p.source_published_at from public.sns_ingest_posts p where p.notice_id = n.id), n.published_at)
    into v_href, v_platform, v_title, v_celebrity, v_published
    from public.celebrity_notices n
    join public.celebrity_notice_localizations l on l.notice_id = n.id and l.locale = 'ko'
    where n.id = p_notice_id and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public';
  if v_href is null or coalesce(v_title, '') = '' then return; end if;
  insert into public.home_shortform(celebrity_id, video_id, title, href, published_at, platform, source_notice_id)
    values (v_celebrity, case when v_platform = 'instagram' then split_part(v_href, '/', 6) else split_part(v_href, '/video/', 2) end,
      left(v_title, 300), v_href, v_published, v_platform, p_notice_id)
  on conflict (source_notice_id) do update set title = excluded.title, published_at = excluded.published_at
    where public.home_shortform.video_id = excluded.video_id;
exception when unique_violation then
  -- The same video already belongs to another notice; the first notice keeps it.
  return;
end $$;

-- A cover registered after the notice was published (the backfill of older videos) makes the notice a short too.
create trigger home_shortform_video_thumbnail_sync after insert on public.video_thumbnails
  for each row execute function public.home_shortform_notice_sync_trigger();

revoke all on function public.home_shortform_instagram_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_home_shortform_notice(uuid) from public, anon, authenticated, service_role;

do $$
declare owner_name text;
begin
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.home_shortform_instagram_link(uuid)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role','public') then raise exception 'invalid shortform function owner'; end if;
  execute format('grant select on public.sns_ingest_posts, public.video_thumbnails to %I', owner_name);
  execute format('create policy %I on public.sns_ingest_posts for select to %I using (true)', 'home_shortform_instagram_post_read', owner_name);
  execute format('create policy %I on public.video_thumbnails for select to %I using (true)', 'home_shortform_instagram_cover_read', owner_name);
  execute format('create policy %I on public.home_shortform for insert to %I with check (platform = %L and source_notice_id is not null)', 'home_shortform_instagram_insert', owner_name, 'instagram');
end $$;

-- Backfill the video notices already published.
select public.sync_home_shortform_notice(n.id) from public.celebrity_notices n
  where n.slug like 'instagram-%' and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public';

commit;

notify pgrst, 'reload schema';
