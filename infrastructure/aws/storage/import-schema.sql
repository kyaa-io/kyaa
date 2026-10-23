-- Target RDS only. Execute using a reviewed migration login with BYPASSRLS.
-- No application/service_role grants: provenance includes original owner and metadata.
begin;
create table if not exists public.s3_storage_migration_objects (
 source_project text not null check(source_project ~ '^[a-z0-9]{20}$'),
 bucket_id text not null,
 name text not null,
 source_id uuid not null,
 source_record jsonb not null,
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 etag text not null,
 deleted_at timestamptz,
 primary key(source_project,bucket_id,name),
 unique(bucket_id,name),
 foreign key(bucket_id,name) references public.s3_storage_objects(bucket_id,name)
);
alter table public.s3_storage_migration_objects enable row level security;
alter table public.s3_storage_migration_objects force row level security;
revoke all on public.s3_storage_migration_objects from public,anon,authenticated,service_role;
commit;
