-- Target only, after real metadata import and before opening any writer.
begin;
do $target$
begin
  if exists(select from pg_namespace where nspname in('auth','cron','net','vault')) then
    raise exception 'Metadata sealing is target-only';
  end if;
end
$target$;
revoke all on storage.buckets,storage.objects from public,anon,authenticated,service_role;
create function storage.byus_reject_metadata_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Legacy storage metadata is sealed' using errcode='55000';
end $$;
revoke all on function storage.byus_reject_metadata_mutation() from public,anon,authenticated,service_role;
create trigger byus_metadata_read_only before insert or update or delete or truncate on storage.buckets for each statement execute function storage.byus_reject_metadata_mutation();
create trigger byus_metadata_read_only before insert or update or delete or truncate on storage.objects for each statement execute function storage.byus_reject_metadata_mutation();
alter table storage.buckets enable always trigger byus_metadata_read_only;
alter table storage.objects enable always trigger byus_metadata_read_only;
-- Preserve the existing SECURITY DEFINER readers without granting app roles raw access.
do $owners$
declare owner_name text;
begin
 for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
   execute format('grant usage on schema storage to %I',owner_name);
   execute format('grant select on storage.buckets,storage.objects to %I',owner_name);
 end loop;
end
$owners$;
commit;
