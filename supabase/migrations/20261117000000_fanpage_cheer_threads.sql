-- Mobile cheer threads reuse the persisted lounge rows and reaction permissions.
create or replace function public.read_celebrity_cheers(
  p_slug text,p_app_user_id uuid default null,p_before timestamptz default null,
  p_before_id uuid default null,p_limit integer default 6,
  p_locale public.content_locale default 'ko'
) returns jsonb language sql stable security definer set search_path='' as $$
  with creator as (
    select c.id from public.celebrities c
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.slug=p_slug and c.status='published' and c.archived_at is null
  ), visible as materialized (
    select m.* from public.fan_lounge_messages m
    join creator c on c.id=m.celebrity_id
    join public.app_users u on u.id=m.app_user_id and u.status='active'
    where m.reply_to_id is null and m.removed_at is null
      and not public.fan_web_blocked(p_app_user_id,m.app_user_id)
  ), page as (
    select v.*,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) nickname,
      public.public_fan_avatar_url(v.app_user_id) avatar_url
    from visible v left join public.user_profiles p on p.app_user_id=v.app_user_id
    where p_before is null or (v.created_at,v.id)<(p_before,p_before_id)
    order by v.created_at desc,v.id desc limit least(greatest(p_limit,1),21)
  )
  select jsonb_build_object(
    'total',(select count(*) from visible),
    'comments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',page.id,'body',page.body,'nickname',page.nickname,'avatarUrl',page.avatar_url,
      'createdAt',page.created_at,'isOwner',coalesce(page.app_user_id=p_app_user_id,false),
      'replyCount',(select count(*) from public.fan_lounge_messages reply
        join public.app_users author on author.id=reply.app_user_id and author.status='active'
        where reply.reply_to_id=page.id and reply.removed_at is null
          and not public.fan_web_blocked(p_app_user_id,reply.app_user_id)),
      'clapCount',(select count(distinct reaction.app_user_id) from public.fan_lounge_message_reactions reaction
        join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
        where reaction.message_id=page.id and reaction.emoji='👏'
          and not public.fan_web_blocked(p_app_user_id,reaction.app_user_id)),
      'viewerClapped',exists(select 1 from public.fan_lounge_message_reactions mine
        where mine.message_id=page.id and mine.app_user_id=p_app_user_id and mine.emoji='👏')
    ) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)
  ) from creator;
$$;

create function public.read_celebrity_cheer_replies(
  p_parent_id uuid,p_app_user_id uuid default null,p_before timestamptz default null,
  p_before_id uuid default null,p_limit integer default 21,
  p_locale public.content_locale default 'ko'
) returns jsonb language sql stable security definer set search_path='' as $$
  with parent as (
    select m.id,m.celebrity_id from public.fan_lounge_messages m
    join public.celebrities c on c.id=m.celebrity_id and c.status='published' and c.archived_at is null
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    join public.app_users author on author.id=m.app_user_id and author.status='active'
    where m.id=p_parent_id and m.reply_to_id is null and m.removed_at is null
      and not public.fan_web_blocked(p_app_user_id,m.app_user_id)
  ), visible as materialized (
    select m.* from public.fan_lounge_messages m join parent p on p.id=m.reply_to_id
    join public.app_users author on author.id=m.app_user_id and author.status='active'
    where m.removed_at is null and not public.fan_web_blocked(p_app_user_id,m.app_user_id)
  ), page as (
    select v.*,coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) nickname,
      public.public_fan_avatar_url(v.app_user_id) avatar_url
    from visible v left join public.user_profiles profile on profile.app_user_id=v.app_user_id
    where p_before is null or (v.created_at,v.id)<(p_before,p_before_id)
    order by v.created_at desc,v.id desc limit least(greatest(p_limit,1),51)
  )
  select jsonb_build_object(
    'total',(select count(*) from visible),
    'replies',coalesce((select jsonb_agg(jsonb_build_object(
      'id',page.id,'body',page.body,'nickname',page.nickname,'avatarUrl',page.avatar_url,
      'createdAt',page.created_at,'isOwner',coalesce(page.app_user_id=p_app_user_id,false),
      'clapCount',(select count(distinct reaction.app_user_id) from public.fan_lounge_message_reactions reaction
        join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
        where reaction.message_id=page.id and reaction.emoji='👏'
          and not public.fan_web_blocked(p_app_user_id,reaction.app_user_id)),
      'viewerClapped',exists(select 1 from public.fan_lounge_message_reactions mine
        where mine.message_id=page.id and mine.app_user_id=p_app_user_id and mine.emoji='👏')
    ) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)
  ) from parent;
$$;

revoke all on function public.read_celebrity_cheer_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale)
  from public,anon,authenticated,service_role;
grant execute on function public.read_celebrity_cheer_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale)
  to service_role;
