-- Home gallery: continue reading after the last photo seen instead of by position.
-- read_public_home_gallery_photos pages by OFFSET, so a photo hidden, unpublished or added in front of the reader moves every later photo one
-- place and the next page skips (or repeats) one. This read takes the sort key of the last photo the reader got (curation rank, time, id: the
-- same order as the old read) and returns the photos after that key, so a change in front of it cannot move what follows. Hidden and
-- unpublished photos are still decided on every request. A changed curation rank or time of photos already read is not tracked.
-- p_offset is kept for the first page (0), the home pool (parallel pages by position) and a cursor an open browser tab got before this change.
-- The photo source rules below are the ones of read_public_home_gallery_photos as of 20261220120000 (rank/hide) and 20261220100000 (relative URL);
-- supabase/tests/home_gallery_cursor.sh compares the two reads page by page so a later change to only one of them fails there.
-- Order: this migration first, then the web. Rollback: supabase/rollback/20261230000000_home_gallery_keyset_read.sql (the old read stays and keeps working).
begin;
set local lock_timeout = '5s';

create function public.read_public_home_gallery_page(
  p_locale public.content_locale, p_limit integer default 12,
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
        select n.published_at at, n.id::text || ':' || i.ord id, jsonb_build_object(
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
        (select distinct on (a.id) b.updated_at at, b.owner_type || ':' || b.owner_id || ':' || b.role id, jsonb_strip_nulls(jsonb_build_object(
            'id', b.owner_type || ':' || b.owner_id || ':' || b.role, 'source', 'cms_upload',
            'image', jsonb_build_object('url', a.url, 'width', a.width, 'height', a.height),
            'alt', case when p_locale = 'ko' then b.alt_ko else b.alt_en end,
            'creator', public.home_creator_json(coalesce(b.celebrity_id, le.celebrity_id), p_locale),
            'sourceHref', case when le.id is not null then '/live/' || le.slug end)) item
          from public.public_image_role_bindings b
          join public.public_image_assets a on a.id = b.asset_id
          left join public.live_events le on le.id = b.live_event_id
          where ((b.owner_type = 'celebrity' and b.role in ('landscape', 'portrait'))
                 or (b.owner_type = 'live' and b.role = 'landscape' and le.publication_status = 'published' and le.archived_at is null))
            and public.home_gallery_creator_public(coalesce(b.celebrity_id, le.celebrity_id))
            and a.width * 10 >= a.height * 4 and a.width * 10 <= a.height * 25
          order by a.id, b.updated_at desc)
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

revoke all on function public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer) to service_role;

-- The new read runs as whoever runs this migration. It reads the same tables and helpers as the old read, whose owner already holds the
-- table grants and policies (20261220022000, 20261220120000), so it must be the same role; otherwise stop instead of serving a gallery
-- that silently shows less under row security.
do $owner$
begin
  if (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer)'::regprocedure)
     is distinct from
     (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure) then
    raise exception 'HOME_GALLERY_CURSOR_OWNER_GAP: the new read must have the same owner as read_public_home_gallery_photos';
  end if;
end
$owner$;

notify pgrst, 'reload schema';
commit;
