-- Resolve the stored owner; URL/query creator hints cannot authorize ID-based content.
create function public.is_kyaa_wave_resource(p_kind text,p_resource_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare creator_id uuid; resource_id uuid;
begin
 if p_kind='live_event' then
  select celebrity_id into creator_id from public.live_events where slug=p_resource_id;
 else
  begin resource_id:=p_resource_id::uuid; exception when invalid_text_representation then return false; end;
  case p_kind
   when 'fan_post' then select celebrity_id into creator_id from public.fan_posts where id=resource_id;
   when 'fan_post_comment' then select p.celebrity_id into creator_id from public.fan_post_comments x join public.fan_posts p on p.id=x.post_id where x.id=resource_id;
   when 'notice' then select celebrity_id into creator_id from public.celebrity_notices where id=resource_id;
   when 'notice_comment' then select n.celebrity_id into creator_id from public.celebrity_notice_comments x join public.celebrity_notices n on n.id=x.notice_id where x.id=resource_id;
   when 'content_asset' then select celebrity_id into creator_id from public.content_assets where id=resource_id;
   when 'cheer' then select celebrity_id into creator_id from public.fan_lounge_messages where id=resource_id;
   when 'fan_clip' then select celebrity_id into creator_id from public.fan_clips where id=resource_id;
   when 'fan_clip_comment' then select p.celebrity_id into creator_id from public.fan_clip_comments x join public.fan_clips p on p.id=x.clip_id where x.id=resource_id;
   when 'benefit' then select celebrity_id into creator_id from public.benefits where id=resource_id;
   when 'live_mission' then select e.celebrity_id into creator_id from public.live_surveys m join public.live_events e on e.id=m.live_event_id where m.id=resource_id;
   when 'quiz_attempt' then select celebrity_id into creator_id from public.quiz_attempts where id=resource_id;
   when 'live_submission' then select e.celebrity_id into creator_id from public.live_fan_submissions x join public.live_events e on e.id=x.live_event_id where x.id=resource_id;
   when 'media' then
    select coalesce(p.celebrity_id,n.celebrity_id,clip.celebrity_id) into creator_id from public.mobile_media_assets a
    left join public.fan_posts p on a.attached_type='fan_post' and p.id=a.attached_id
    left join public.celebrity_notices n on a.attached_type='notice' and n.id=a.attached_id
    left join public.fan_clips clip on a.attached_type='fan_clip' and clip.id=a.attached_id
    where a.id=resource_id;
   else return false;
  end case;
 end if;
 return exists(select 1 from public.celebrities where id=creator_id and slug='kyaa-wave-fanpage');
end;
$$;
revoke all on function public.is_kyaa_wave_resource(text,text) from public,anon,authenticated,service_role;
grant execute on function public.is_kyaa_wave_resource(text,text) to service_role;

-- Wave content belongs inside the checked-in fanpage, before home-feed limits.
-- Filter public and viewer-visible candidates before limiting; member-only rows never enter the home feed.
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
        (select p.id,p.created_at,'fan_post'::text kind from public.fan_posts p
          where p.celebrity_id=c.id and p.visibility='public'
            and p.deleted_at is null and p.hidden_at is null
            and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,localization.locale) is not null
          order by p.created_at desc,p.id desc limit 3)
        union all
        (select m.id,m.created_at,'cheer'::text kind from public.fan_lounge_messages m
          where m.celebrity_id=c.id and m.reply_to_id is null
            and m.removed_at is null
            and public.fan_web_content_target(p_app_user_id,'cheer',m.id,localization.locale) is not null
          order by m.created_at desc,m.id desc limit 3)
      ) candidates order by created_at desc,kind desc,id desc limit 3
    ) entry
    where c.status='published' and c.archived_at is null and c.slug<>'kyaa-wave-fanpage'
    order by entry.created_at desc,entry.kind desc,entry.id desc limit 3
  ), items as (
    select slug,name,created_at,kind,id,
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
  ) order by created_at desc,kind desc,id desc),'[]'::jsonb)) from items;
$$;

revoke all on function public.read_public_home_feed(uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_public_home_feed(uuid,public.content_locale) to service_role;
