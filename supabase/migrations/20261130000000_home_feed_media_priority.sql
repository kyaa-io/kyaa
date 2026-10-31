-- Prefer ready media while preserving public visibility, author blocks and WAVE exclusion.
create or replace function public.read_public_home_feed(p_app_user_id uuid default null,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
  with latest as materialized (
    select c.slug,localization.name,localization.locale,entry.*
    from public.celebrities c
    cross join lateral (
      select l.locale,l.name from public.celebrity_localizations l
      where l.celebrity_id=c.id
      order by (l.locale=p_locale) desc,(l.locale='ko') desc limit 1
    ) localization
    cross join lateral (
      select * from (
        (select p.id,p.created_at,'fan_post'::text kind,(exists(select 1 from public.content_assets a where a.post_id=p.id and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null) or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=p.id and a.kind in ('image','video') and a.state='ready' and a.storage_deleted_at is null)) has_media from public.fan_posts p
          where p.celebrity_id=c.id and p.visibility='public'
            and p.deleted_at is null and p.hidden_at is null
            and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,localization.locale) is not null
          order by has_media desc,p.created_at desc,p.id desc limit 3)
        union all
        (select m.id,m.created_at,'cheer'::text kind,false has_media from public.fan_lounge_messages m
          where m.celebrity_id=c.id and m.reply_to_id is null
            and m.removed_at is null
            and public.fan_web_content_target(p_app_user_id,'cheer',m.id,localization.locale) is not null
          order by m.created_at desc,m.id desc limit 3)
      ) candidates order by has_media desc,created_at desc,kind desc,id desc limit 3
    ) entry
    where c.status='published' and c.archived_at is null and c.slug<>'kyaa-wave-fanpage'
    order by entry.has_media desc,entry.created_at desc,entry.kind desc,entry.id desc limit 3
  ), items as (
    select slug,name,created_at,kind,id,has_media,
      case when kind='fan_post' then public.fan_web_post_json(p_app_user_id,id,locale)||jsonb_build_object('kind','fan_post')
      else (select jsonb_build_object(
        'kind','cheer','id',m.id,'body',m.body,
        'nickname',coalesce(nullif(btrim(pr.nickname),''),case when latest.locale='ko' then '팬' else 'Fan' end),
        'avatarUrl',public.public_fan_avatar_url(m.app_user_id),
        'createdAt',m.created_at,'isOwner',coalesce(m.app_user_id=p_app_user_id,false),
        'replyCount',(select count(*) from public.fan_lounge_messages reply
          join public.app_users author on author.id=reply.app_user_id and author.status='active'
          where reply.reply_to_id=m.id and reply.removed_at is null
            and not public.fan_web_blocked(p_app_user_id,reply.app_user_id)),
        'clapCount',(select count(distinct reaction.app_user_id) from public.fan_lounge_message_reactions reaction
          join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
          where reaction.message_id=m.id and reaction.emoji='👏'
            and not public.fan_web_blocked(p_app_user_id,reaction.app_user_id)),
        'viewerClapped',exists(select 1 from public.fan_lounge_message_reactions mine
          where mine.message_id=m.id and mine.app_user_id=p_app_user_id and mine.emoji='👏')
      ) from public.fan_lounge_messages m left join public.user_profiles pr on pr.app_user_id=m.app_user_id
        where m.id=latest.id) end item
    from latest
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'creatorSlug',slug,'creatorName',name,'item',item
  ) order by has_media desc,created_at desc,kind desc,id desc),'[]'::jsonb)) from items;
$$;

revoke all on function public.read_public_home_feed(uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_public_home_feed(uuid,public.content_locale) to service_role;
