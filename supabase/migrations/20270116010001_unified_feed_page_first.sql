-- The creator board read built the full JSON (counts, author, reactions) of every visible notice,
-- fan post and cheer before keeping one page, so its cost grew with the page's whole history
-- (prod 11/23: fans lane of changha, elina and yuna 4.6-5.5 s; pages with few posts 0.5 s).
-- Choose the page from the same visibility checks and order first, then build JSON only for its rows.
-- Same arguments, same rows, same order, same JSON. The search and media variants are unchanged.
begin;
set local lock_timeout='5s';

create or replace function public.read_unified_creator_feed(
  p_app_user_id uuid,
  p_slug text,
  p_source text default 'all',
  p_news text default null,
  p_before_rank integer default null,
  p_before_at timestamptz default null,
  p_before_kind text default null,
  p_before_id uuid default null,
  p_limit integer default 20,
  p_locale public.content_locale default 'ko'
) returns jsonb language sql stable security definer set search_path='' as $$
  with creator as (
    select c.id
    from public.celebrities c
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.slug=p_slug and c.status='published' and c.archived_at is null
      and p_source in ('all','official','fans')
      and (p_news is null or p_news in ('notice','artist_post','chzzk'))
  ), visible as materialized (
    select case when n.post_type='notice' then 1 else 0 end pin_rank,
      n.display_published_at occurred_at,'notice'::text item_kind,n.id
    from public.celebrity_notices n
    join creator c on c.id=n.celebrity_id
    join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
    where p_source in ('all','official')
      and (p_news is null or p_news=n.post_type)
      and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
    union all
    select 0,p.created_at,'fan_post',p.id
    from public.fan_posts p join creator c on c.id=p.celebrity_id
    where p_source in ('all','fans')
      and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,p_locale) is not null
    union all
    select 0,m.created_at,'cheer',m.id
    from public.fan_lounge_messages m
    join creator c on c.id=m.celebrity_id
    where p_source in ('all','fans') and m.reply_to_id is null
      and public.fan_web_content_target(p_app_user_id,'cheer',m.id,p_locale) is not null
  ), candidates as materialized (
    select * from visible
    where p_before_at is null
      or (pin_rank,occurred_at,item_kind,id)<(p_before_rank,p_before_at,p_before_kind,p_before_id)
    order by pin_rank desc,occurred_at desc,item_kind desc,id desc
    limit least(greatest(p_limit,1),51)+1
  ), page as (
    select * from candidates
    order by pin_rank desc,occurred_at desc,item_kind desc,id desc
    limit least(greatest(p_limit,1),51)
  ), hydrated as (
    select page.pin_rank,page.occurred_at,page.item_kind,page.id,case page.item_kind
      when 'notice' then (select jsonb_build_object(
        'kind','notice','id',n.id,'slug',n.slug,'title',l.title,'body',l.body_json,
        'pinned',n.pinned,'noticeKind',n.notice_kind,'postType',n.post_type,
        'visibility',n.visibility,'revision',n.revision,'publishedAt',n.display_published_at,
        'viewCount',(select count(*) from public.celebrity_notice_views v where v.notice_id=n.id),
        'likeCount',(select count(*) from public.celebrity_notice_likes r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.notice_id=n.id),
        'commentCount',(select count(*) from public.celebrity_notice_comments x
          where x.notice_id=n.id and public.fan_web_content_target(p_app_user_id,'notice_comment',x.id,p_locale) is not null)
      ) from public.celebrity_notices n
        join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
        where n.id=page.id)
      when 'fan_post' then public.fan_web_post_json(p_app_user_id,page.id,p_locale)||jsonb_build_object('kind','fan_post')
      else (select jsonb_build_object(
        'kind','cheer','id',m.id,'body',m.body,
        'nickname',coalesce(nullif(btrim(pr.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
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
      ) from public.fan_lounge_messages m
        left join public.user_profiles pr on pr.app_user_id=m.app_user_id
        where m.id=page.id)
    end item
    from page
  )
  select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('pinRank',pin_rank,'item',item)
      order by pin_rank desc,occurred_at desc,item_kind desc,id desc) from hydrated),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),51) from candidates)
  ) from creator;
$$;

revoke all on function public.read_unified_creator_feed(
  uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) from public,anon,authenticated,service_role;
grant execute on function public.read_unified_creator_feed(
  uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) to service_role;

notify pgrst, 'reload schema';
commit;
