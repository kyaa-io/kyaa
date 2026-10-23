-- Normal ROW guard: owner-controlled flag is reversible without DROP TRIGGER rights.
create schema if not exists _byus_migration;
revoke all on schema _byus_migration from public;
create table if not exists _byus_migration.storage_fence(singleton boolean primary key check(singleton),run_id text not null,fenced boolean not null);
revoke all on _byus_migration.storage_fence from public;
create or replace function _byus_migration.storage_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare is_fenced boolean;
begin
 select fenced into strict is_fenced from _byus_migration.storage_fence where singleton for share;
 if is_fenced then raise exception 'Source storage is fenced' using errcode='55000'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='TRUNCATE' then return null; end if;
 return new;
end $$;
revoke all on function _byus_migration.storage_guard() from public;
