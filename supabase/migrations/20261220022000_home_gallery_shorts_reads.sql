-- Home gallery and Shorts reads (R8-DATA N2, narrowed on 2026-11-09 20:19 to ship today). Read-only: no new table, no admin write.
-- Photos come from two existing sources only, with their own text (nothing here writes or generates a title or description):
--   official_sns: image nodes of published public creator notices that have the collected official SNS shape (plan §4.0-1:
--                 ko = en, last paragraph is exactly its own HTTPS source link on an official platform host, 1-2 sized images whose alt is
--                 the original title). The alt shown is the notice's own image alt.
--   cms_upload:   CMS-uploaded image-role photos (creator landscape/portrait, LIVE landscape) with the alt the admin wrote.
-- Shorts come from YouTube links on published LIVE records; the cover is the YouTube thumbnail of that video (7th-round decision).
-- Deferred to the next bundle (plan §4.0-2/-3): registered collection evidence, account matching and admin curation. Until then the
-- official photos rely on the shape check alone.
-- Order: this migration first, then the web. Rollback: supabase/rollback/20261220022000_home_gallery_shorts_reads.sql (drops the
-- functions and only policies named home_n2_owner_%).
begin;
set local lock_timeout = '5s';

-- §6.1 creator public condition (same text as the public lists).
create function public.home_gallery_creator_public(p_celebrity_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.celebrities c
    where c.id = p_celebrity_id and c.status = 'published' and c.archived_at is null
      and not exists (select 1 from public.group_pages hp where hp.celebrity_id = c.id and hp.status = 'hidden')
      and not exists (select 1 from public.group_pages lp where lp.celebrity_id = c.id and lp.kind = 'fan' and not lp.listed));
$$;

-- §4.0-1 collected official SNS notice shape. Returns the source URL, otherwise null.
create function public.home_gallery_source_shape(p_notice_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare ko public.celebrity_notice_localizations; en public.celebrity_notice_localizations; last jsonb; node jsonb; href text; images integer; ok boolean;
begin
  select * into ko from public.celebrity_notice_localizations where notice_id = p_notice_id and locale = 'ko';
  if not found then return null; end if;
  select * into en from public.celebrity_notice_localizations where notice_id = p_notice_id and locale = 'en';
  if not found or ko.title <> en.title or ko.body_json <> en.body_json then return null; end if;
  if jsonb_typeof(ko.body_json->'content') <> 'array' or jsonb_array_length(ko.body_json->'content') = 0 then return null; end if;
  last := ko.body_json->'content'->-1;
  if last->>'type' is distinct from 'paragraph' or jsonb_typeof(last->'content') is distinct from 'array'
     or jsonb_array_length(last->'content') <> 1 then return null; end if;
  node := last->'content'->0;
  href := node->>'text';
  if node->>'type' is distinct from 'text' or href is null
     or href !~ '^https://(www\.)?(instagram\.com|youtube\.com|tiktok\.com|chzzk\.naver\.com)/[^[:space:][:cntrl:]]*$'
     -- lax: a text node without marks (or with a non-array marks value) is simply not a link, never an error for the whole read.
     or jsonb_typeof(node->'marks') is distinct from 'array'
     or not jsonb_path_exists(node, 'lax $.marks[*] ? (@.type == "link" && @.attrs.href == $h)', jsonb_build_object('h', href)) then
    return null;
  end if;
  select count(*), coalesce(bool_and(i.value->'attrs'->>'alt' = ko.title
           and jsonb_typeof(i.value->'attrs'->'width') = 'number' and (i.value->'attrs'->>'width')::numeric > 0
           and jsonb_typeof(i.value->'attrs'->'height') = 'number' and (i.value->'attrs'->>'height')::numeric > 0), false)
    into images, ok
    from jsonb_path_query(ko.body_json, 'strict $.** ? (@.type == "image")') i(value);
  if images not between 1 and 2 or not ok then return null; end if;
  return href;
end $$;

create function public.home_creator_json(p_celebrity_id uuid, p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug', c.slug, 'name', coalesce(
    (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id and l.locale = p_locale),
    (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id and l.locale = 'ko')))
  from public.celebrities c where c.id = p_celebrity_id;
$$;

-- Newest first across both sources; ratio 0.4-2.5 (width/height) so the home columns never get an extreme strip.
create function public.read_public_home_gallery_photos(p_locale public.content_locale, p_offset integer default 0, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'invalid home gallery page' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x.item order by x.at desc, x.id), '[]'::jsonb) into v_rows from (
    select * from (
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
          and i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'
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
    ) u order by u.at desc, u.id offset p_offset limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit);
end $$;

-- YouTube videos of published LIVE records by public creators, newest first, one card per video.
create function public.read_public_home_shorts(p_locale public.content_locale, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 12 then raise exception 'invalid home shorts page' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(x.item order by x.starts_at desc, x.video_id) from (
    select * from (
      select distinct on (v.video_id) v.video_id, l.starts_at, jsonb_build_object(
          'id', l.id, 'videoId', v.video_id,
          'title', coalesce((select t.title from public.live_event_localizations t where t.live_event_id = l.id and t.locale = p_locale),
                            (select t.title from public.live_event_localizations t where t.live_event_id = l.id and t.locale = 'ko')),
          'creator', public.home_creator_json(l.celebrity_id, p_locale),
          'href', 'https://www.youtube.com/watch?v=' || v.video_id,
          'liveHref', '/live/' || l.slug) item
        from public.live_events l
        cross join lateral (select substring(u.url from '^https://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|shorts/|live/|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$') video_id
          from (values (l.youtube_url), (case when l.replay_provider = 'youtube' and l.replay_published then l.replay_url end)) u(url)
          where u.url is not null) v
        where v.video_id is not null and l.publication_status = 'published' and l.archived_at is null
          and l.celebrity_id is not null and public.home_gallery_creator_public(l.celebrity_id)
        order by v.video_id, l.starts_at desc
    ) d order by d.starts_at desc, d.video_id limit p_limit) x), '[]'::jsonb);
end $$;

revoke all on function public.home_gallery_creator_public(uuid), public.home_gallery_source_shape(uuid),
  public.home_creator_json(uuid,public.content_locale),
  public.read_public_home_gallery_photos(public.content_locale,integer,integer), public.read_public_home_shorts(public.content_locale,integer)
from public, anon, authenticated, service_role;
grant execute on function public.read_public_home_gallery_photos(public.content_locale,integer,integer), public.read_public_home_shorts(public.content_locale,integer)
to service_role;

-- Function owner access (plan §6.2) for bundle N2: every existing table these definer functions read needs select and, where row
-- security applies to the owner, a home_n2_owner_<role>_r policy. Other policies never count. Re-run verbatim by
-- supabase/tests/home_gallery_shorts.sh against a nologin nobypassrls owner.
do $access$
declare
  r record; t text; c pg_catalog.pg_class; gaps text[] := '{}'; h regprocedure;
  fns regprocedure[] := array['public.home_gallery_creator_public(uuid)', 'public.home_gallery_source_shape(uuid)',
    'public.home_creator_json(uuid,public.content_locale)', 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)',
    'public.read_public_home_shorts(public.content_locale,integer)']::regprocedure[];
  read_tables text[] := array['group_pages', 'celebrities', 'celebrity_localizations', 'celebrity_notices', 'celebrity_notice_localizations',
    'public_image_role_bindings', 'public_image_assets', 'live_events', 'live_event_localizations'];
begin
  for r in
    select distinct o.oid role_oid, o.rolname::text rolname, o.rolsuper, o.rolbypassrls
      from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner where f.oid = any (fns)
  loop
    continue when r.rolsuper;
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then
      gaps := gaps || format('%s may not own home gallery functions', r.rolname); continue;
    end if;
    foreach t in array read_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> r.role_oid and not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then
        execute format('grant select on table public.%I to %I', t, r.rolname);
      end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polname = format('home_n2_owner_%s_r', r.rolname)) then
        execute format('create policy %I on public.%I for select to %I using (true)', format('home_n2_owner_%s_r', r.rolname), t, r.rolname);
      end if;
    end loop;
    foreach h in array fns loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then execute format('grant execute on function %s to %I', h, r.rolname); end if;
    end loop;
  end loop;

  -- checks: fail the migration instead of hiding a gap
  for r in
    select distinct o.oid role_oid, o.rolname::text rolname, o.rolbypassrls
      from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
     where f.oid = any (fns) and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
  loop
    foreach t in array read_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', r.rolname, t); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and r.role_oid = any (p.polroles)
                           and p.polcmd in ('r', '*') and p.polname = format('home_n2_owner_%s_r', r.rolname)) then
        gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
      end if;
    end loop;
    foreach h in array fns loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then gaps := gaps || format('%s cannot execute %s', r.rolname, h); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'HOME_CONTENT_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
