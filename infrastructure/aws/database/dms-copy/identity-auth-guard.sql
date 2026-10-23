create schema if not exists _byus_migration;
revoke all on schema _byus_migration from public;
create table if not exists _byus_migration.auth_fence(singleton boolean primary key check(singleton),run_id text not null,fenced boolean not null);
revoke all on _byus_migration.auth_fence from public;
create or replace function _byus_migration.auth_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare is_fenced boolean;
begin
 select fenced into strict is_fenced from _byus_migration.auth_fence where singleton for share;
 if is_fenced then raise exception 'Source authentication is fenced' using errcode='55000'; end if;
 return null;
end $$;
revoke all on function _byus_migration.auth_guard() from public;
