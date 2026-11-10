-- Rolls back 20261222150000_home_shortform_sns_notices. Web first (it must accept YouTube shorts only again), then this file.
-- Comments and reactions on TikTok shorts are removed with their rows.
begin;
set local lock_timeout = '5s';

drop trigger if exists home_shortform_notice_sync on public.celebrity_notices;
drop trigger if exists home_shortform_notice_localization_sync on public.celebrity_notice_localizations;
drop function if exists public.home_shortform_notice_sync_trigger();
drop function if exists public.sync_home_shortform_notice(uuid);
drop function if exists public.home_shortform_notice_link(uuid);
drop policy if exists home_shortform_notice_insert on public.home_shortform;
drop policy if exists home_shortform_notice_update on public.home_shortform;

delete from public.shortform_comments c using public.home_shortform s where s.video_id = c.video_id and s.platform <> 'youtube';
delete from public.shortform_reactions r using public.home_shortform s where s.video_id = r.video_id and s.platform <> 'youtube';
delete from public.home_shortform where platform <> 'youtube';

create or replace function public.read_public_home_shortform(p_locale public.content_locale, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 12 then raise exception 'invalid home shorts page' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(x.item order by x.published_at desc, x.video_id) from (
    select s.published_at, s.video_id, jsonb_build_object('id', s.id, 'videoId', s.video_id,
      'title', s.title, 'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) item
    from public.home_shortform s where public.home_gallery_creator_public(s.celebrity_id)
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
      jsonb_build_object('id', s.id, 'videoId', s.video_id, 'title', s.title,
        'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) as item
      from (select * from public.home_shortform where public.home_gallery_creator_public(celebrity_id)
        order by published_at desc, video_id offset p_offset limit p_limit + 1) s) x);
end $$;
drop function if exists public.home_shortform_visible(uuid);

alter table public.home_shortform drop constraint home_shortform_source_shape;
alter table public.home_shortform drop column source_notice_id, drop column platform;
alter table public.home_shortform add constraint home_shortform_video_id_check check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  add constraint home_shortform_check check (href = 'https://www.youtube.com/watch?v=' || video_id);

commit;

notify pgrst, 'reload schema';
