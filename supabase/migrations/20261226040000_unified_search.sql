-- Public search is bounded, viewer-specific, and uses trigram indexes for contains matching.
create extension if not exists pg_trgm with schema extensions;
create function public.notice_search_text(document jsonb) returns text language sql immutable set search_path='' as $$
 select coalesce(string_agg(value #>> '{}', ' '),'') from jsonb_path_query(document, 'strict $.**.text') as nodes(value)
$$;
alter table public.celebrity_notice_localizations add column search_body_text text generated always as (public.notice_search_text(body_json)) stored;
create index if not exists fan_posts_public_search on public.fan_posts using gin (body extensions.gin_trgm_ops) where visibility='public' and deleted_at is null and hidden_at is null;
create index if not exists group_posts_public_title_search on public.group_posts using gin (title extensions.gin_trgm_ops) where visibility='public' and removed_at is null;
create index if not exists group_posts_public_body_search on public.group_posts using gin (body extensions.gin_trgm_ops) where visibility='public' and removed_at is null;
create index if not exists celebrity_notice_title_search on public.celebrity_notice_localizations using gin (title extensions.gin_trgm_ops);
create index if not exists celebrity_notice_body_search on public.celebrity_notice_localizations using gin ((search_body_text) extensions.gin_trgm_ops);

create function public.search_literal_pattern(p_query text) returns text language sql immutable set search_path='' as $$
 select '%'||replace(replace(replace(p_query,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%'
$$;

create function public.search_public_posts(p_actor uuid,p_query text,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 with hits as (
  select 'fan'::text source,p.id,c.slug page_ref,coalesce(l.name,c.slug) page_name,
    left(p.body,160) title,p.created_at,coalesce(pr.nickname,'') nickname,null::text notice_slug
  from public.fan_posts p join public.celebrities c on c.id=p.celebrity_id
  left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
  join public.app_users u on u.id=p.app_user_id and u.status='active'
  left join public.user_profiles pr on pr.app_user_id=p.app_user_id
  where p.visibility='public' and p.deleted_at is null and p.hidden_at is null
    and c.status='published' and c.archived_at is null and p.body ilike public.search_literal_pattern(p_query)
    and not public.fan_web_blocked(p_actor,p.app_user_id)
  union all
  select 'group',p.id,g.id::text,g.name,p.title,p.created_at,
    case when p.anonymous or g.anonymous then '' else coalesce(pr.nickname,'') end,null::text
  from public.group_posts p join public.group_pages g on g.id=p.page_id
  join public.app_users u on u.id=p.author_id and u.status='active'
  left join public.user_profiles pr on pr.app_user_id=p.author_id
  where p.visibility='public' and p.removed_at is null and g.status='published'
    and public.group_scope_visible(p_actor,g.id)
    and (p.title ilike public.search_literal_pattern(p_query) or p.body ilike public.search_literal_pattern(p_query))
    and not public.fan_web_blocked(p_actor,p.author_id)
  union all
  select 'notice',n.id,c.slug,coalesce(cl.name,c.slug),nl.title,n.published_at,'',n.slug
  from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
  join public.celebrity_notice_localizations nl on nl.notice_id=n.id and nl.locale=p_locale
  left join public.celebrity_localizations cl on cl.celebrity_id=c.id and cl.locale=p_locale
  where n.publication_status='published' and n.archived_at is null and n.visibility='public'
    and c.status='published' and c.archived_at is null
    and (nl.title ilike public.search_literal_pattern(p_query) or nl.search_body_text ilike public.search_literal_pattern(p_query))
 ), limited as (select * from hits order by created_at desc,id desc limit 31)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('source',source,'id',id,'pageRef',page_ref,'pageName',page_name,'title',title,'createdAt',created_at,'nickname',nickname,'noticeSlug',notice_slug) order by created_at desc,id desc) from (select * from limited limit 30) x),'[]'::jsonb),'hasMore',(select count(*)>30 from limited))
 where length(btrim(p_query)) between 2 and 100
 $$;
revoke all on function public.search_public_posts(uuid,text,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.search_public_posts(uuid,text,public.content_locale) to service_role;
revoke all on function public.search_literal_pattern(text) from public,anon,authenticated,service_role;
grant execute on function public.search_literal_pattern(text) to service_role;
notify pgrst,'reload schema';
