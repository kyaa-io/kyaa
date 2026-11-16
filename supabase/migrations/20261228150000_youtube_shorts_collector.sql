begin;
set local lock_timeout = '5s';
alter table public.home_shortform add column collected_at timestamptz, add column unavailable_at timestamptz;
create function public.save_collected_youtube_shorts(p_celebrity uuid,p_source_url text,p_video_id text,p_title text,p_published_at timestamptz,p_checked_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_checked_at is null or p_published_at is null then raise exception 'invalid collected short'; end if;
  perform 1 from public.celebrities where id=p_celebrity and archived_at is null for update;
  if not found or not exists (select 1 from public.celebrity_social_links where celebrity_id=p_celebrity and platform='youtube' and active and url=p_source_url) then return false; end if;
  insert into public.home_shortform(celebrity_id,video_id,title,href,published_at,platform,collected_at)
  values(p_celebrity,p_video_id,left(p_title,300),'https://www.youtube.com/watch?v='||p_video_id,p_published_at,'youtube',p_checked_at)
  on conflict(video_id) do update set title=excluded.title,collected_at=excluded.collected_at,unavailable_at=null
  where public.home_shortform.collected_at is not null and public.home_shortform.platform='youtube'
    and public.home_shortform.celebrity_id=excluded.celebrity_id and public.home_shortform.collected_at<=excluded.collected_at;
  return found;
end $$;
create function public.read_collected_youtube_shorts_due(p_before timestamptz)
returns table(video_id text,celebrity_id uuid) language sql stable security definer set search_path='' as $$
select video_id,celebrity_id from public.home_shortform where platform='youtube' and collected_at < p_before;
$$;
create function public.check_collected_youtube_short(p_video_id text,p_unavailable boolean,p_checked_at timestamptz)
returns void language sql security definer set search_path='' as $$
update public.home_shortform set collected_at=p_checked_at,unavailable_at=case when p_unavailable then coalesce(unavailable_at,p_checked_at) else null end
where video_id=p_video_id and platform='youtube' and collected_at is not null and collected_at<=p_checked_at;
$$;
revoke all on function public.save_collected_youtube_shorts(uuid,text,text,text,timestamptz,timestamptz), public.read_collected_youtube_shorts_due(timestamptz), public.check_collected_youtube_short(text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.save_collected_youtube_shorts(uuid,text,text,text,timestamptz,timestamptz), public.read_collected_youtube_shorts_due(timestamptz), public.check_collected_youtube_short(text,boolean,timestamptz) to service_role;
do $$
declare owner_name text;
begin
select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner where p.oid='public.save_collected_youtube_shorts(uuid,text,text,text,timestamptz,timestamptz)'::regprocedure;
if owner_name in ('anon','authenticated','service_role','public') then raise exception 'invalid owner'; end if;
execute format('grant select,insert,update on public.home_shortform to %I',owner_name);
execute format('create policy home_shortform_collector_write on public.home_shortform for all to %I using (platform = %L and collected_at is not null) with check (platform = %L and collected_at is not null)',owner_name,'youtube','youtube');
end $$;
create or replace function public.read_public_home_shortform(p_locale public.content_locale, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 12 then raise exception 'invalid home shorts page' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(x.item order by x.published_at desc, x.video_id) from (
    select s.published_at, s.video_id, jsonb_build_object('id', s.id, 'platform', s.platform, 'videoId', s.video_id,
      'title', s.title, 'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) item
    from public.home_shortform s where public.home_gallery_creator_public(s.celebrity_id) and s.unavailable_at is null and public.home_shortform_visible(s.source_notice_id)
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
      from (select * from public.home_shortform where public.home_gallery_creator_public(celebrity_id) and unavailable_at is null and public.home_shortform_visible(source_notice_id)
        order by published_at desc, video_id offset p_offset limit p_limit + 1) s) x);
end $$;

create or replace function public.read_shortform_participation(p_video_id text,p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id text;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  select video_id into v_id from public.home_shortform where video_id=p_video_id and unavailable_at is null and public.home_gallery_creator_public(celebrity_id);
  if not found then return null; end if;
  return jsonb_build_object(
    'reaction',(select reaction from public.shortform_reactions where video_id=v_id and app_user_id=p_app_user_id),
    'likeCount',(select count(*) from public.shortform_reactions r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.video_id=v_id and r.reaction='like'),
    'dislikeCount',(select count(*) from public.shortform_reactions r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.video_id=v_id and r.reaction='dislike'),
    'commentCount',(select count(*) from public.shortform_comments c join public.app_users u on u.id=c.app_user_id and u.status='active'
      where c.video_id=v_id and c.deleted_at is null and not public.fan_web_blocked(p_app_user_id,c.app_user_id)));
end $$;
create or replace function public.read_shortform_comments(p_video_id text,p_app_user_id uuid,p_locale text,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id text; v_result jsonb;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  if p_locale is null or p_locale not in ('ko','en') or (p_before is null)<>(p_before_id is null) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  select video_id into v_id from public.home_shortform where video_id=p_video_id and unavailable_at is null and public.home_gallery_creator_public(celebrity_id);
  if not found then return null; end if;
  with candidates as materialized (
    select c.* from public.shortform_comments c join public.app_users u on u.id=c.app_user_id and u.status='active'
    where c.video_id=v_id and c.deleted_at is null and not public.fan_web_blocked(p_app_user_id,c.app_user_id)
      and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
    order by c.created_at desc,c.id desc limit 21
  ), page as (select * from candidates order by created_at desc,id desc limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'body',c.body,'revision',c.revision,'createdAt',c.created_at,'isOwner',coalesce(c.app_user_id=p_app_user_id,false),
    'author',jsonb_build_object('nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(c.app_user_id))) order by c.created_at desc,c.id desc)
    from page c left join public.user_profiles p on p.app_user_id=c.app_user_id),'[]'::jsonb),
    'hasMore',(select count(*)>20 from candidates)) into v_result;
  return v_result;
end $$;
commit;
notify pgrst, 'reload schema';
