-- Post photos share one curation rank, timestamp and ID cursor across sources.
begin;
set local lock_timeout = '5s';

create function public.read_public_gallery_post_photos(
  p_locale public.content_locale, p_include_groups boolean, p_limit integer default 12,
  p_after_rank integer default null, p_after_at timestamptz default null, p_after_id text default null, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset not between 0 and 10000
     or (p_after_id is null) <> (p_after_rank is null) or (p_after_id is null) <> (p_after_at is null)
     or (p_after_id is not null and (p_offset <> 0 or p_after_rank < 1 or length(p_after_id) not between 1 and 200)) then
    raise exception 'invalid home gallery page' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item, 'rank', x.sort_rank, 'at', x.at, 'id', x.id) order by x.sort_rank, x.at desc, x.id), '[]'::jsonb) into v_rows from (
    select k.* from (
      select u.at, u.id, u.item, public.home_gallery_curation_rank(u.id) sort_rank from (
        select n.display_published_at at, n.id::text || ':' || i.ord id, jsonb_build_object(
            'id', n.id::text || ':' || i.ord, 'source', 'official_sns',
            'image', jsonb_build_object('url', i.value->'attrs'->>'src', 'width', (i.value->'attrs'->>'width')::numeric::integer, 'height', (i.value->'attrs'->>'height')::numeric::integer),
            'alt', i.value->'attrs'->>'alt', 'creator', public.home_creator_json(n.celebrity_id, p_locale),
            'sourceHref', '/c/' || c.slug || '/notices/' || n.slug) item
          from public.celebrity_notices n
          join public.celebrities c on c.id = n.celebrity_id
          join public.celebrity_notice_localizations ko on ko.notice_id = n.id and ko.locale = 'ko'
          cross join lateral jsonb_path_query(ko.body_json, 'strict $.** ? (@.type == "image")') with ordinality i(value, ord)
          where n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public'
            and public.home_gallery_creator_public(n.celebrity_id)
            and public.home_gallery_source_shape(n.id) is not null
            and (i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'
              or public.home_gallery_public_content_asset(i.value->'attrs'->>'src'))
            and case when jsonb_typeof(i.value->'attrs'->'width') = 'number' and jsonb_typeof(i.value->'attrs'->'height') = 'number'
                     then (i.value->'attrs'->>'width')::numeric * 10 between (i.value->'attrs'->>'height')::numeric * 4 and (i.value->'attrs'->>'height')::numeric * 25
                     else false end
        union all
        select p.created_at, 'fan:' || p.id || ':' || a.id, jsonb_build_object(
          'id', 'fan:' || p.id || ':' || a.id, 'source', 'fan_post',
          'image', jsonb_build_object('url', '/api/content-assets/' || a.id, 'width', a.width, 'height', a.height),
          'alt', case when p_locale = 'ko' then '팬 게시물 사진' else 'Fan post photo' end,
          'creator', public.home_creator_json(c.id, p_locale),
          'sourceHref', '/c/' || c.slug || '/community/' || p.id)
        from public.content_assets a
        join public.fan_posts p on p.id = a.post_id
        join public.celebrities c on c.id = p.celebrity_id
        where p.visibility = 'public' and p.deleted_at is null and p.hidden_at is null
          and p.category <> 'proof' and c.slug <> 'kyaa-wave-fanpage'
          and public.home_gallery_creator_public(c.id)
          and a.mime_type = 'image/webp' and a.uploaded_at is not null
          and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null
          and public.home_gallery_public_content_asset('/api/content-assets/' || a.id)
          and not exists (select 1 from public.content_reports r where r.target_type = 'fan_post' and r.target_id = p.id)
        union all
        select p.created_at, 'group:' || p.id || ':' || a.id, jsonb_build_object(
          'id', 'group:' || p.id || ':' || a.id, 'source', 'group_post',
          'image', jsonb_build_object('url', '/api/groups/media/' || a.id, 'width', a.width, 'height', a.height),
          'alt', case when p_locale = 'ko' then '팬페이지 게시물 사진' else 'Fan page post photo' end,
          'creator', jsonb_build_object('slug', coalesce(c.slug, g.id::text), 'name', public.group_page_name(g.id, p_locale::text)),
          'sourceHref', '/pages/groups/' || g.id || '?tab=board&post=' || p.id)
        from public.mobile_media_assets a
        join public.group_posts p on p.id = a.attached_id and a.attached_type = 'group_post'
        join public.group_pages g on g.id = p.page_id
        left join public.celebrities c on c.id = g.celebrity_id
        where p_include_groups and g.kind = 'fan' and g.listed and g.status = 'published'
          and c.slug is distinct from 'kyaa-wave-fanpage'
          and p.category <> 'notice' and p.visibility = 'public' and p.removed_at is null
          and exists (select 1 from public.app_users u where u.id = p.author_id and u.status = 'active')
          and a.kind = 'image' and a.width > 0 and a.height > 0 and a.state = 'ready'
          and a.cleanup_requested_at is null and a.storage_deleted_at is null
          and public.authorize_group_media_read(null, a.id, 'original') is not null
          and not exists (select 1 from public.group_reports r where r.target_type = 'post' and r.target_id = p.id)
      ) u where not public.home_gallery_curation_hidden(u.id)
    ) k
    where p_after_id is null
       or k.sort_rank > p_after_rank
       or (k.sort_rank = p_after_rank and (k.at < p_after_at or (k.at = p_after_at and k.id > p_after_id)))
    order by k.sort_rank, k.at desc, k.id offset p_offset limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value->'item' order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit,
    'last', (select jsonb_build_object('rank', e.value->'rank', 'at', e.value->'at', 'id', e.value->'id')
               from jsonb_array_elements(v_rows) with ordinality e where e.ordinality = least(p_limit, jsonb_array_length(v_rows))));
end $$;

revoke all on function public.read_public_gallery_post_photos(public.content_locale,boolean,integer,integer,timestamptz,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.read_public_gallery_post_photos(public.content_locale,boolean,integer,integer,timestamptz,text,integer) to service_role;

-- Match the original gallery reader's owner. Its existing grants cover official posts;
-- these policies let that same internal role see attached photos and every moderation report under FORCE RLS.
do $access$
declare
  owner_name name := current_user;
  tbl text;
begin
  if owner_name in ('anon', 'authenticated', 'service_role') or
     owner_name <> pg_get_userbyid((select proowner from pg_proc where oid =
       'public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer)'::regprocedure)) then
    raise exception 'Gallery owner mismatch';
  end if;
  foreach tbl in array array['fan_posts','content_assets','content_reports','group_posts','mobile_media_assets','group_reports','app_users'] loop
    execute format('grant select on public.%I to %I', tbl, owner_name);
    execute format('create policy gallery_post_reader on public.%I for select to %I using (true)', tbl, owner_name);
  end loop;
  execute format('grant execute on function public.authorize_group_media_read(uuid,uuid,text), public.group_page_name(uuid,text) to %I',owner_name);
end
$access$;

notify pgrst, 'reload schema';
commit;
