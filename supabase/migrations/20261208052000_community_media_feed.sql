-- Required first argument keeps the existing RPC signature and old callers intact.
create function public.read_unified_creator_feed(
  p_media_only boolean,
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
    select c.id from public.celebrities c
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.slug=p_slug and c.status='published' and c.archived_at is null
      and p_source in ('all','official','fans')
      and (p_news is null or p_news in ('notice','artist_post','chzzk'))
  ), visible as materialized (
    select p.id,p.created_at,
      public.fan_web_post_json(p_app_user_id,p.id,p_locale)||jsonb_build_object('kind','fan_post') item
    from public.fan_posts p join creator c on c.id=p.celebrity_id
    where p_media_only and p_source in ('all','fans')
      and public.fan_web_content_target(p_app_user_id,'fan_post',p.id,p_locale) is not null
  ), candidates as materialized (
    select * from visible
    where (jsonb_array_length(item->'assets')>0 or item->'video'<>'null'::jsonb)
      and (p_before_at is null
        or (0,created_at,'fan_post'::text,id)<(p_before_rank,p_before_at,p_before_kind,p_before_id))
    order by created_at desc,id desc
    limit least(greatest(p_limit,1),51)+1
  ), page as (
    select * from candidates order by created_at desc,id desc
    limit least(greatest(p_limit,1),51)
  )
  select case when not p_media_only then public.read_unified_creator_feed(
    p_app_user_id,p_slug,p_source,p_news,p_before_rank,p_before_at,p_before_kind,p_before_id,p_limit,p_locale
  ) else (select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('pinRank',0,'item',item)
      order by created_at desc,id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),51) from candidates)
  ) from creator) end;
$$;

revoke all on function public.read_unified_creator_feed(
  boolean,uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) from public,anon,authenticated,service_role;
grant execute on function public.read_unified_creator_feed(
  boolean,uuid,text,text,text,integer,timestamptz,text,uuid,integer,public.content_locale
) to service_role;
notify pgrst, 'reload schema';
