-- Public popular-posts board for the guest home.
-- Read-only: one new service_role RPC, no table, column or data change.
-- Scope: public fan posts of published creators + public posts of published groups.
-- Excluded: members-only posts, removed/hidden posts, notices, unpublished or archived pages,
-- the check-in-gated kyaa wave page, inactive authors. No membership condition is ever evaluated.
-- p_include_groups=false (groups feature flag off) returns fan posts only, so page size and hasMore stay correct.
-- A fan post whose linked group page is hidden is excluded; creators without a group page keep their fan posts.
-- Order: likes desc, comments desc, newest, id. When every counter is zero this is newest-first.
-- Revert: drop function public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean);
begin;

create function public.read_public_popular_posts_page(p_app_user_id uuid default null,p_locale public.content_locale default 'ko',p_page integer default 1,p_include_groups boolean default true)
returns jsonb language sql stable security definer set search_path='' as $$
  with params as (select least(1000,greatest(1,coalesce(p_page,1))) page),
  fan as (
    select 'fan'::text source,p.id,c.slug page_ref,loc.name page_name,p.created_at,
      (select count(*) from public.fan_post_likes l where l.post_id=p.id) likes,
      (select count(*) from public.fan_post_comments m where m.post_id=p.id and m.deleted_at is null and m.hidden_at is null) comments
    from public.fan_posts p
    join public.celebrities c on c.id=p.celebrity_id and c.status='published' and c.archived_at is null and c.slug<>'kyaa-wave-fanpage'
    cross join lateral (select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale=p_locale) desc,(l.locale='ko') desc limit 1) loc
    where p.visibility='public' and p.deleted_at is null and p.hidden_at is null
      and not exists(select 1 from public.group_pages hp where hp.celebrity_id=c.id and hp.status='hidden')
      and exists(select 1 from public.app_users u where u.id=p.app_user_id and u.status='active')
      and (p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,p.app_user_id))
  ), grp as (
    select 'group'::text source,p.id,g.id::text page_ref,public.group_page_name(g.id,p_locale::text) page_name,p.created_at,
      (select count(*) from public.group_post_reactions r where r.post_id=p.id) likes,
      (select count(*) from public.group_comments m where m.post_id=p.id and m.removed_at is null) comments
    from public.group_posts p
    join public.group_pages g on g.id=p.page_id and g.status='published'
    left join public.celebrities c on c.id=g.celebrity_id
    where coalesce(p_include_groups,true) and p.visibility='public' and p.removed_at is null and p.category<>'notice'
      and (g.celebrity_id is null or (c.status='published' and c.archived_at is null))
      and c.slug is distinct from 'kyaa-wave-fanpage'
      and exists(select 1 from public.app_users u where u.id=p.author_id and u.status='active')
      and (p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,p.author_id))
  ), ranked as (
    select * from (select * from fan union all select * from grp) u
    order by likes desc,comments desc,created_at desc,id desc
    limit 11 offset ((select page from params)-1)*10
  ), shown as (
    select * from ranked order by likes desc,comments desc,created_at desc,id desc limit 10
  ), items as (
    select s.*,
      case when s.source='fan' then
        (select jsonb_build_object('title',left(btrim(p.body),100),'nickname',coalesce(nullif(btrim(pr.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
          'assets',coalesce((public.fan_web_post_json(null,p.id,p_locale)->'assets')->0,'null'::jsonb))
         from public.fan_posts p left join public.user_profiles pr on pr.app_user_id=p.app_user_id where p.id=s.id)
      else
        (select jsonb_build_object('title',p.title,'nickname',case when p.anonymous then '익명' else coalesce(nullif(btrim(pr.nickname),''),'팬') end,
          'viewCount',(select count(*) from public.group_post_views v where v.post_id=p.id),
          'assets',coalesce((select jsonb_build_object('id',a.id,'width',a.width,'height',a.height) from public.mobile_media_assets a
            where a.attached_type='group_post' and a.attached_id=p.id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null
            order by a.position,a.id limit 1),'null'::jsonb))
         from public.group_posts p left join public.user_profiles pr on pr.app_user_id=p.author_id where p.id=s.id)
      end detail
    from shown s
  )
  select jsonb_build_object('hasMore',(select count(*)>10 from ranked),'items',coalesce((
    select jsonb_agg(jsonb_build_object('source',source,'id',id,'pageRef',page_ref,'pageName',page_name,'title',detail->>'title',
      'nickname',detail->>'nickname','createdAt',created_at,'likeCount',likes,'commentCount',comments,
      'viewCount',case when source='group' then detail->'viewCount' else 'null'::jsonb end,
      'asset',case when jsonb_typeof(detail->'assets')='object' then detail->'assets' else null end)
      order by likes desc,comments desc,created_at desc,id desc) from items),'[]'::jsonb));
$$;

revoke all on function public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean) to service_role;

commit;
