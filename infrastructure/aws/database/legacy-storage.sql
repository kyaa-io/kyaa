-- Target only. These are real imported metadata projections, never a Storage API shim.
-- Apply before restoring the public schema; import the exact reviewed source rows,
-- then run seal-legacy-storage.sql. Empty tables do not satisfy the cutover manifest.
begin;
do $target$
begin
  if exists(select from pg_namespace where nspname in('auth','cron','net','vault'))
    or exists(select from pg_extension where extname in('pg_net','supabase_vault')) then
    raise exception 'Legacy metadata bootstrap is target-only; Supabase platform schemas detected';
  end if;
end
$target$;
create schema if not exists storage;
revoke all on schema storage from public,anon,authenticated,service_role;
create table storage.buckets(
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects(
  id uuid primary key,
  bucket_id text references storage.buckets(id),
  name text,
  metadata jsonb,
  user_metadata jsonb,
  unique(bucket_id,name)
);
revoke all on storage.buckets,storage.objects from public,anon,authenticated,service_role;
commit;
