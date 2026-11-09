-- Gallery read only; no CMS/source mutation. Apply before the web schema change.
-- Rollback: supabase/rollback/20261220100000_home_gallery_relative_url.sql
begin;
set local lock_timeout = '5s';
-- Anonymous access only: this endpoint also serves members-only and private uploads.
-- Keep the route's existing visibility, active owner, upload and cleanup checks in one place.
create function public.home_gallery_public_content_asset(p_src text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_src is null or p_src !~ '^/api/content-assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.read_content_asset(null::uuid, substring(p_src from 21)::uuid) is not null;
end $$;
revoke all on function public.home_gallery_public_content_asset(text) from public, anon, authenticated, service_role;

do $patch$
declare
  target regprocedure := 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
  definition text;
  old_predicate text := $old$i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'$old$;
  new_predicate text := $new$(i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'
            or public.home_gallery_public_content_asset(i.value->'attrs'->>'src'))$new$;
  owner_name text;
begin
  definition := pg_catalog.pg_get_functiondef(target);
  if (length(definition) - length(replace(definition, old_predicate, ''))) / length(old_predicate) <> 1 then
    raise exception 'HOME_GALLERY_RELATIVE_URL_SHAPE: expected exactly one HTTPS predicate';
  end if;
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner where p.oid = target;
  execute format('grant execute on function public.home_gallery_public_content_asset(text) to %I', owner_name);
  execute replace(definition, old_predicate, new_predicate);
end
$patch$;
notify pgrst, 'reload schema';
commit;
