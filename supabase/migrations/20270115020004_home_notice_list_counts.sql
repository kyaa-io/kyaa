begin;
create table public.home_notice_views (
  notice_id uuid not null references public.home_notices(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  primary key (notice_id, app_user_id)
);
alter table public.home_notice_views enable row level security;
alter table public.home_notice_views force row level security;
revoke all on public.home_notice_views from public, anon, authenticated, service_role;
create table public.celebrity_notice_views (
  notice_id uuid not null references public.celebrity_notices(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  primary key (notice_id, app_user_id)
);
alter table public.celebrity_notice_views enable row level security;
alter table public.celebrity_notice_views force row level security;
revoke all on public.celebrity_notice_views from public, anon, authenticated, service_role;
create or replace function public.read_public_home_notices(
  p_locale public.content_locale,
  p_before_pinned boolean default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid home notice page' using errcode = '22023'; end if;
  if (p_before_pinned is null) <> (p_before is null) or (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid home notice cursor' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x.item order by x.pinned desc, x.published_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select n.pinned, n.published_at, n.id, jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
      'publishedAt', n.published_at, 'title', l.title,
      'viewCount', (select count(*) from public.home_notice_views v where v.notice_id = n.id),
      'likeCount', (select count(*) from public.home_notice_reactions r join public.app_users u on u.id = r.app_user_id and u.status = 'active' where r.notice_id = n.id and r.reaction = 'like'),
      'commentCount', (select count(*) from public.home_notice_comments c join public.app_users u on u.id = c.app_user_id and u.status = 'active' where c.notice_id = n.id and c.deleted_at is null)) || coalesce(public.home_notice_link_json(n.linked_group_page_id), '{}'::jsonb) item
    from public.home_notices n
    join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
    where n.publication_status = 'published' and n.archived_at is null
      and (p_before is null or (n.pinned, n.published_at, n.id) < (p_before_pinned, p_before, p_before_id))
    order by n.pinned desc, n.published_at desc, n.id desc
    limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit);
end $$;
create or replace function public.read_home_notice_participation(p_slug text,p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  select id into v_id from public.home_notices where slug=p_slug and publication_status='published' and archived_at is null;
  if not found then return null; end if;
 if p_app_user_id is not null then
   insert into public.home_notice_views(notice_id, app_user_id) values (v_id, p_app_user_id) on conflict do nothing;
 end if;
  return jsonb_build_object(
    'reaction',(select reaction from public.home_notice_reactions where notice_id=v_id and app_user_id=p_app_user_id),
    'likeCount',(select count(*) from public.home_notice_reactions r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.notice_id=v_id and r.reaction='like'),
    'dislikeCount',null,
    'commentCount',(select count(*) from public.home_notice_comments c join public.app_users u on u.id=c.app_user_id and u.status='active'
      where c.notice_id=v_id and c.deleted_at is null and not public.fan_web_blocked(p_app_user_id,c.app_user_id)));
end $$;
create or replace function public.read_celebrity_notice_reaction(p_app_user_id uuid,p_slug text,p_notice_slug text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare n jsonb; v_id uuid;
begin
 n:=public.read_fan_notice(p_app_user_id,p_slug,p_notice_slug,p_locale);
 if n is null then return null; end if;
 v_id:=(n->>'id')::uuid;
 if p_app_user_id is not null then
   insert into public.celebrity_notice_views(notice_id, app_user_id) values (v_id, p_app_user_id) on conflict do nothing;
 end if;
 return jsonb_build_object('likeCount',n->'likeCount','reaction',case when (n->>'liked')::boolean then 'like' when exists(select 1 from public.celebrity_notice_dislikes where notice_id=v_id and app_user_id=p_app_user_id) then 'dislike' else null end,'dislikeCount',null);
end $$;
-- Put every kyaa notice before other board rows; order notices by publication time.
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
      n.published_at occurred_at,'notice'::text item_kind,n.id,
      jsonb_build_object(
        'kind','notice','id',n.id,'slug',n.slug,'title',l.title,'body',l.body_json,
        'pinned',n.pinned,'noticeKind',n.notice_kind,'postType',n.post_type,
        'visibility',n.visibility,'revision',n.revision,'publishedAt',n.published_at,
        'viewCount',(select count(*) from public.celebrity_notice_views v where v.notice_id=n.id),
        'likeCount',(select count(*) from public.celebrity_notice_likes r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.notice_id=n.id),
        'commentCount',(select count(*) from public.celebrity_notice_comments x
          where x.notice_id=n.id and public.fan_web_content_target(p_app_user_id,'notice_comment',x.id,p_locale) is not null)
      ) item
    from public.celebrity_notices n
    join creator c on c.id=n.celebrity_id
    join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
    where p_source in ('all','official')
      and (p_news is null or p_news=n.post_type)
      and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
    union all
    select 0,p.created_at,'fan_post',p.id,
      public.fan_web_post_json(p_app_user_id,p.id,p_locale)||jsonb_build_object('kind','fan_post')
    from public.fan_posts p join creator c on c.id=p.celebrity_id
    where p_source in ('all','fans')
      and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,p_locale) is not null
    union all
    select 0,m.created_at,'cheer',m.id,
      jsonb_build_object(
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
      )
    from public.fan_lounge_messages m
    join creator c on c.id=m.celebrity_id
    left join public.user_profiles pr on pr.app_user_id=m.app_user_id
    left join public.app_user_avatars a on a.app_user_id=m.app_user_id
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
  )
  select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('pinRank',pin_rank,'item',item)
      order by pin_rank desc,occurred_at desc,item_kind desc,id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),51) from candidates)
  ) from creator;
$$;

revoke all on function public.read_unified_creator_feed(
  uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) from public,anon,authenticated,service_role;
grant execute on function public.read_unified_creator_feed(
  uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) to service_role;

-- Put every kyaa notice before other board rows; order notices by publication time.
create or replace function public.read_unified_creator_feed(
  p_search text,
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
      n.published_at occurred_at,'notice'::text item_kind,n.id,
      jsonb_build_object(
        'kind','notice','id',n.id,'slug',n.slug,'title',l.title,'body',l.body_json,
        'pinned',n.pinned,'noticeKind',n.notice_kind,'postType',n.post_type,
        'visibility',n.visibility,'revision',n.revision,'publishedAt',n.published_at,
        'viewCount',(select count(*) from public.celebrity_notice_views v where v.notice_id=n.id),
        'likeCount',(select count(*) from public.celebrity_notice_likes r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.notice_id=n.id),
        'commentCount',(select count(*) from public.celebrity_notice_comments x
          where x.notice_id=n.id and public.fan_web_content_target(p_app_user_id,'notice_comment',x.id,p_locale) is not null)
      ) item
    from public.celebrity_notices n
    join creator c on c.id=n.celebrity_id
    join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
    where p_source in ('all','official')
      and (p_news is null or p_news=n.post_type)
      and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
    union all
    select 0,p.created_at,'fan_post',p.id,
      public.fan_web_post_json(p_app_user_id,p.id,p_locale)||jsonb_build_object('kind','fan_post')
    from public.fan_posts p join creator c on c.id=p.celebrity_id
    where p_source in ('all','fans')
      and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,p_locale) is not null
    union all
    select 0,m.created_at,'cheer',m.id,
      jsonb_build_object(
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
      )
    from public.fan_lounge_messages m
    join creator c on c.id=m.celebrity_id
    left join public.user_profiles pr on pr.app_user_id=m.app_user_id
    left join public.app_user_avatars a on a.app_user_id=m.app_user_id
    where p_source in ('all','fans') and m.reply_to_id is null
      and public.fan_web_content_target(p_app_user_id,'cheer',m.id,p_locale) is not null
  ), candidates as materialized (
    select * from visible
    where length(p_search) between 1 and 100
      and case item_kind
        when 'notice' then strpos(lower(item->>'title'), lower(p_search)) > 0
          or strpos(lower(jsonb_path_query_array(item->'body', '$.**.text')::text), lower(p_search)) > 0
        else strpos(lower(item->>'body'), lower(p_search)) > 0
      end
      and (p_before_at is null
        or (pin_rank,occurred_at,item_kind,id)<(p_before_rank,p_before_at,p_before_kind,p_before_id))
    order by pin_rank desc,occurred_at desc,item_kind desc,id desc
    limit least(greatest(p_limit,1),51)+1
  ), page as (
    select * from candidates
    order by pin_rank desc,occurred_at desc,item_kind desc,id desc
    limit least(greatest(p_limit,1),51)
  )
  select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('pinRank',pin_rank,'item',item)
      order by pin_rank desc,occurred_at desc,item_kind desc,id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),51) from candidates)
  ) from creator;
$$;

revoke all on function public.read_unified_creator_feed(
  text,uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) from public,anon,authenticated,service_role;
grant execute on function public.read_unified_creator_feed(
  text,uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) to service_role;

notify pgrst, 'reload schema';
-- CREATE OR REPLACE preserves each RPC's original owner. Grant table access to
-- those definers explicitly on installations where FORCE RLS applies to them.
do $access$
declare edge record; relation text; privilege text;
begin
  for edge in
    select distinct p.proname, r.rolname, r.rolsuper, r.rolbypassrls
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.pronamespace='public'::regnamespace and p.proname in
      ('read_public_home_notices','read_home_notice_participation','read_unified_creator_feed','read_celebrity_notice_reaction')
  loop
    if edge.rolname in ('anon','authenticated','service_role') then raise exception 'Unsafe notice RPC owner'; end if;
    if edge.rolsuper then continue; end if;
    foreach relation in array case edge.proname
      when 'read_public_home_notices' then array['home_notice_views','home_notice_comments','home_notice_reactions','app_users']
      when 'read_home_notice_participation' then array['home_notice_views']
      when 'read_unified_creator_feed' then array['celebrity_notice_views','celebrity_notice_likes','app_users']
      else array['celebrity_notice_views'] end
    loop
      foreach privilege in array case when edge.proname in ('read_home_notice_participation','read_celebrity_notice_reaction')
        then array['select','insert'] else array['select'] end
      loop
        execute format('grant %s on public.%I to %I',privilege,relation,edge.rolname);
        if not edge.rolbypassrls and not exists(select 1 from pg_policies where schemaname='public' and tablename=relation
          and policyname='notice_counts_'||privilege||'_'||edge.rolname) then
          execute format('create policy %I on public.%I for %s to %I %s',
            'notice_counts_'||privilege||'_'||edge.rolname,relation,privilege,edge.rolname,
            case when privilege='insert' then 'with check (true)' else 'using (true)' end);
        end if;
      end loop;
    end loop;
  end loop;
end $access$;
commit;
