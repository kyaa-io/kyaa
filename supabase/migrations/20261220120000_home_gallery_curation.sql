-- Home gallery curation (CEO feedback 2026-11-09): a photo can be hidden from the gallery, or ranked ahead of the newest-first order,
-- without touching the CMS source (notices, uploads and bindings stay as they are). One row per gallery photo id as the read returns it
-- ('<notice uuid>:<image position>' or '<owner type>:<owner uuid>:<role>'). No row = unchanged behaviour. Rows are written from SQL only;
-- there is no admin screen yet. An id that no longer exists is simply never matched.
-- Order: this migration first, then the web (the web needs no change to read it). Rollback: supabase/rollback/20261220120000_home_gallery_curation.sql.
begin;
set local lock_timeout = '5s';

create table public.home_gallery_curation (
  photo_id text primary key check (length(photo_id) between 1 and 200),
  hidden boolean not null default false,
  rank integer check (rank between 1 and 1000),
  reason text not null check (length(btrim(reason)) between 1 and 200),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (not (hidden and rank is not null))
);
alter table public.home_gallery_curation enable row level security;
alter table public.home_gallery_curation force row level security;
revoke all on public.home_gallery_curation from public, anon, authenticated, service_role;

create function public.home_gallery_curation_hidden(p_photo_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.hidden from public.home_gallery_curation c where c.photo_id = p_photo_id), false);
$$;
-- Ranked photos first (1 = first); everything else keeps the newest-first order behind them.
create function public.home_gallery_curation_rank(p_photo_id text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select c.rank from public.home_gallery_curation c where c.photo_id = p_photo_id), 2147483647);
$$;
revoke all on function public.home_gallery_curation_hidden(text), public.home_gallery_curation_rank(text) from public, anon, authenticated, service_role;

-- SECURITY DEFINER helpers run as their own pg_proc.proowner (the migration role
-- at creation), not the public read's owner. Provision that actual role even when
-- it owns the table: FORCE RLS makes table ownership alone insufficient.
do $access$
declare
  r record; reader oid; reader_name text; gaps text[] := '{}';
  helpers regprocedure[] := array['public.home_gallery_curation_hidden(text)', 'public.home_gallery_curation_rank(text)']::regprocedure[];
begin
  select p.proowner, o.rolname into reader, reader_name from pg_catalog.pg_proc p
    join pg_catalog.pg_roles o on o.oid = p.proowner
    where p.oid = 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
  if reader_name in ('anon', 'authenticated', 'service_role', 'public') then
    raise exception 'HOME_GALLERY_CURATION_OWNER_GAP: unexpected read owner %', reader_name;
  end if;
  execute format('grant execute on function public.home_gallery_curation_hidden(text), public.home_gallery_curation_rank(text) to %I', reader_name);
  for r in select distinct o.oid, o.rolname from pg_catalog.pg_proc p
    join pg_catalog.pg_roles o on o.oid = p.proowner where p.oid = any(helpers)
  loop
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then
      raise exception 'HOME_GALLERY_CURATION_OWNER_GAP: unexpected helper owner %', r.rolname;
    end if;
    execute format('grant select on public.home_gallery_curation to %I', r.rolname);
    if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.home_gallery_curation'::regclass
      and polname = format('home_curation_owner_%s_r', r.rolname)) then
      execute format('create policy %I on public.home_gallery_curation for select to %I using (true)',
        format('home_curation_owner_%s_r', r.rolname), r.rolname);
    end if;
  end loop;
  -- checks: fail closed rather than silently ignoring curation under FORCE RLS.
  for r in select distinct o.oid, o.rolname from pg_catalog.pg_proc p
    join pg_catalog.pg_roles o on o.oid = p.proowner where p.oid = any(helpers)
  loop
    if not pg_catalog.has_table_privilege(r.oid, 'public.home_gallery_curation', 'select') then
      gaps := gaps || format('%s lacks select on home_gallery_curation', r.rolname);
    end if;
    if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.home_gallery_curation'::regclass
      and polname = format('home_curation_owner_%s_r', r.rolname) and polcmd = 'r'
      and r.oid = any(polroles) and pg_catalog.pg_get_expr(polqual, polrelid) = 'true') then
      gaps := gaps || format('%s lacks curation select policy', r.rolname);
    end if;
  end loop;
  if not pg_catalog.has_function_privilege(reader, helpers[1], 'execute')
     or not pg_catalog.has_function_privilege(reader, helpers[2], 'execute') then
    gaps := gaps || format('%s lacks helper execute', reader_name);
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid = 'public.home_gallery_curation'::regclass) then
    gaps := gaps || 'home_gallery_curation must FORCE RLS';
  end if;
  if cardinality(gaps) > 0 then raise exception 'HOME_GALLERY_CURATION_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

-- Patch only the two places that order and select photos; every other part of the read (including a later relative-URL predicate) stays.
do $patch$
declare
  target regprocedure := 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
  definition text;
  old_agg text := $old$order by x.at desc, x.id), '[]'::jsonb) into v_rows$old$;
  new_agg text := $new$order by public.home_gallery_curation_rank(x.id), x.at desc, x.id), '[]'::jsonb) into v_rows$new$;
  old_page text := $old$) u order by u.at desc, u.id offset p_offset limit p_limit + 1) x;$old$;
  new_page text := $new$) u where not public.home_gallery_curation_hidden(u.id)
      order by public.home_gallery_curation_rank(u.id), u.at desc, u.id offset p_offset limit p_limit + 1) x;$new$;
begin
  definition := pg_catalog.pg_get_functiondef(target);
  if (length(definition) - length(replace(definition, old_agg, ''))) / length(old_agg) <> 1
     or (length(definition) - length(replace(definition, old_page, ''))) / length(old_page) <> 1 then
    raise exception 'HOME_GALLERY_CURATION_SHAPE: expected exactly one ordering anchor and one page anchor';
  end if;
  execute replace(replace(definition, old_agg, new_agg), old_page, new_page);
end
$patch$;
notify pgrst, 'reload schema';
commit;
