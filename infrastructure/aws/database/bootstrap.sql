-- Real target prerequisites only. Restore the reviewed pg_dump schema, ownership,
-- RLS, policies, grants and SECURITY DEFINER routines separately; never replay
-- the repository's Supabase test shims on RDS.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
do $roles$
begin
  if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if exists(select from pg_roles where rolname in('anon','authenticated','service_role') and (rolcanlogin or rolsuper)) then
    raise exception 'Unexpected application role attributes';
  end if;
  if not exists(select from pg_roles where rolname='service_role' and rolbypassrls) then
    raise exception 'service_role BYPASSRLS requires a supported, explicitly provisioned role';
  end if;
end
$roles$;
grant usage on schema extensions to service_role;
commit;
