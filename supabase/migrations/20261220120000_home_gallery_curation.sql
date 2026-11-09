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
  owner_name text;
begin
  definition := pg_catalog.pg_get_functiondef(target);
  if (length(definition) - length(replace(definition, old_agg, ''))) / length(old_agg) <> 1
     or (length(definition) - length(replace(definition, old_page, ''))) / length(old_page) <> 1 then
    raise exception 'HOME_GALLERY_CURATION_SHAPE: expected exactly one ordering anchor and one page anchor';
  end if;
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner where p.oid = target;
  if owner_name in ('anon', 'authenticated', 'service_role', 'public') then raise exception 'Unexpected definer owner %', owner_name; end if;
  -- The read's owner may differ from this migration's role: it needs the helpers and the table.
  execute format('grant select on table public.home_gallery_curation to %I', owner_name);
  execute format('grant execute on function public.home_gallery_curation_hidden(text), public.home_gallery_curation_rank(text) to %I', owner_name);
  execute replace(replace(definition, old_agg, new_agg), old_page, new_page);
end
$patch$;
notify pgrst, 'reload schema';
commit;
