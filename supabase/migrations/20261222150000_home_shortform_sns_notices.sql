-- Home Shorts also read the creators' own TikTok videos that were published as source-only CMS notices
-- (docs/operations/source-only-content.md). A notice qualifies when it is public, published, not archived, its slug
-- starts with "tiktok-" and its ko body links exactly one TikTok video. The short's title is the notice's own ko title
-- (the original caption excerpt); nothing is written here that the notice does not already hold.
-- Rows are kept in home_shortform so Shorts comments and reactions keep their foreign key.
begin;
set local lock_timeout = '5s';

alter table public.home_shortform
  add column platform text not null default 'youtube',
  add column source_notice_id uuid unique references public.celebrity_notices(id) on delete cascade;
alter table public.home_shortform drop constraint home_shortform_video_id_check, drop constraint home_shortform_check;
alter table public.home_shortform add constraint home_shortform_source_shape check (
  (platform = 'youtube' and source_notice_id is null and video_id ~ '^[A-Za-z0-9_-]{11}$'
    and href = 'https://www.youtube.com/watch?v=' || video_id)
  or (platform = 'tiktok' and source_notice_id is not null and video_id ~ '^[0-9]{15,25}$'
    and href ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._]{1,64}/video/[0-9]{15,25}$'
    and split_part(href, '/video/', 2) = video_id));

create function public.home_shortform_notice_link(p_notice_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select min(h) from (
    select distinct h #>> '{}' as h
    from public.celebrity_notices n
    join public.celebrity_notice_localizations l on l.notice_id = n.id and l.locale = 'ko'
    cross join lateral jsonb_path_query(l.body_json, 'strict $.**.href') h
    where n.id = p_notice_id and n.slug like 'tiktok-%'
  ) links
  where h ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._]{1,64}/video/[0-9]{15,25}$'
  having count(*) = 1;
$$;

create function public.sync_home_shortform_notice(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_href text; v_title text; v_celebrity uuid; v_published timestamptz;
begin
  select public.home_shortform_notice_link(n.id), btrim(l.title), n.celebrity_id, n.published_at
    into v_href, v_title, v_celebrity, v_published
    from public.celebrity_notices n
    join public.celebrity_notice_localizations l on l.notice_id = n.id and l.locale = 'ko'
    where n.id = p_notice_id and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public';
  if v_href is null or coalesce(v_title, '') = '' then return; end if;
  insert into public.home_shortform(celebrity_id, video_id, title, href, published_at, platform, source_notice_id)
    values (v_celebrity, split_part(v_href, '/video/', 2), left(v_title, 300), v_href, v_published, 'tiktok', p_notice_id)
  on conflict (source_notice_id) do update set title = excluded.title, published_at = excluded.published_at
    where public.home_shortform.video_id = excluded.video_id;
exception when unique_violation then
  -- The same TikTok video already belongs to another notice; the first notice keeps it.
  return;
end $$;

create function public.home_shortform_notice_sync_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'celebrity_notices' then perform public.sync_home_shortform_notice(new.id);
  else perform public.sync_home_shortform_notice((to_jsonb(new) ->> 'notice_id')::uuid); end if;
  return null;
end $$;

create trigger home_shortform_notice_sync after insert or update of publication_status, archived_at, visibility, published_at
  on public.celebrity_notices for each row execute function public.home_shortform_notice_sync_trigger();
create trigger home_shortform_notice_localization_sync after insert or update of title, body_json
  on public.celebrity_notice_localizations for each row when (new.locale = 'ko') execute function public.home_shortform_notice_sync_trigger();

revoke all on function public.home_shortform_notice_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_home_shortform_notice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.home_shortform_notice_sync_trigger() from public, anon, authenticated, service_role;

-- A short from a notice is shown only while its notice is still public.
create or replace function public.home_shortform_visible(p_source_notice_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_source_notice_id is null or exists (select 1 from public.celebrity_notices n where n.id = p_source_notice_id
    and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public');
$$;
revoke all on function public.home_shortform_visible(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_public_home_shortform(p_locale public.content_locale, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 12 then raise exception 'invalid home shorts page' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(x.item order by x.published_at desc, x.video_id) from (
    select s.published_at, s.video_id, jsonb_build_object('id', s.id, 'platform', s.platform, 'videoId', s.video_id,
      'title', s.title, 'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) item
    from public.home_shortform s where public.home_gallery_creator_public(s.celebrity_id) and public.home_shortform_visible(s.source_notice_id)
    order by s.published_at desc, s.video_id limit p_limit
  ) x), '[]'::jsonb);
end $$;

create or replace function public.read_public_home_shortform_page(p_locale public.content_locale, p_offset integer default 0, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 12 then
    raise exception 'invalid home shorts page' using errcode = '22023';
  end if;
  return (select jsonb_build_object('items', coalesce(jsonb_agg(x.item order by x.published_at desc, x.video_id) filter (where x.row_no <= p_limit), '[]'::jsonb), 'hasMore', count(*) > p_limit)
    from (select s.published_at, s.video_id, row_number() over (order by s.published_at desc, s.video_id) as row_no,
      jsonb_build_object('id', s.id, 'platform', s.platform, 'videoId', s.video_id, 'title', s.title,
        'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) as item
      from (select * from public.home_shortform where public.home_gallery_creator_public(celebrity_id) and public.home_shortform_visible(source_notice_id)
        order by published_at desc, video_id offset p_offset limit p_limit + 1) s) x);
end $$;

do $$
declare owner_name text;
begin
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.read_public_home_shortform(public.content_locale,integer)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role','public') then raise exception 'invalid shortform function owner'; end if;
  execute format('grant select on public.celebrity_notices, public.celebrity_notice_localizations to %I', owner_name);
  execute format('grant insert, update on public.home_shortform to %I', owner_name);
  execute format('create policy %I on public.home_shortform for insert to %I with check (platform = %L and source_notice_id is not null)', 'home_shortform_notice_insert', owner_name, 'tiktok');
  execute format('create policy %I on public.home_shortform for update to %I using (source_notice_id is not null) with check (source_notice_id is not null)', 'home_shortform_notice_update', owner_name);
end $$;

-- Backfill the notices already published.
select public.sync_home_shortform_notice(n.id) from public.celebrity_notices n
  where n.slug like 'tiktok-%' and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public';

commit;

notify pgrst, 'reload schema';
