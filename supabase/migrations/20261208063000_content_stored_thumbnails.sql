begin;
alter table public.content_assets add column thumbnail_generation bigint not null default 0;

-- One bounded parent lease protects legacy conversion from deletion and competing writers.
create function public.begin_content_thumbnail_upload(p_storage_path text) returns bigint
language plpgsql security definer set search_path='' as $$
declare a public.content_assets%rowtype;
begin
  select * into a from public.content_assets where storage_path=p_storage_path for update;
  if not found or a.uploaded_at is null or a.deleted_at is not null or a.cleanup_requested_at is not null
    or a.storage_deleted_at is not null
    or not exists(select 1 from public.app_users where id=a.app_user_id and status='active') then return null; end if;
  if a.upload_settled_at is null and a.upload_expires_at>clock_timestamp() then return -1; end if;
  update public.content_assets set thumbnail_generation=thumbnail_generation+1,upload_settled_at=null,
    upload_expires_at=clock_timestamp()+interval '5 minutes' where id=a.id returning thumbnail_generation into a.thumbnail_generation;
  return a.thumbnail_generation;
end $$;

create function public.settle_content_thumbnail_upload(p_storage_path text,p_generation bigint,p_succeeded boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.content_assets%rowtype;
begin
  select * into a from public.content_assets where storage_path=p_storage_path for update;
  if not found then return false; end if;
  if a.deleted_at is not null or a.cleanup_requested_at is not null or a.storage_deleted_at is not null
    or not exists(select 1 from public.app_users where id=a.app_user_id and status='active') then
    -- A late PUT after completed cleanup must reopen both the parent queue and the S3 outbox.
    perform public.queue_s3_storage_delete('fan-content-assets',regexp_replace(a.storage_path,'\.webp$','.thumbnail-240-v1.webp'));
    update public.s3_storage_delete_outbox set lease_until=null,retry_at=case
      when a.upload_settled_at is null and a.upload_expires_at>clock_timestamp() then a.upload_expires_at else clock_timestamp() end
      where bucket_id='fan-content-assets' and name=regexp_replace(a.storage_path,'\.webp$','.thumbnail-240-v1.webp');
    update public.content_assets set upload_settled_at=case
      when upload_settled_at is null and upload_expires_at>clock_timestamp() then null else clock_timestamp() end,storage_deleted_at=null,
      cleanup_requested_at=coalesce(cleanup_requested_at,clock_timestamp()),cleanup_retry_at=clock_timestamp(),cleanup_generation=cleanup_generation+1 where id=a.id;
    return false;
  end if;
  -- An old worker may never settle a newer live lease, or delete its shared variant path.
  if a.thumbnail_generation<>p_generation then return false; end if;
  update public.content_assets set upload_settled_at=case
    when p_succeeded or upload_expires_at<=clock_timestamp() then clock_timestamp() else null end where id=a.id;
  return p_succeeded;
end $$;
-- A failed/aborted original PUT can still be in flight remotely; abandonment must retain its durable write horizon.
create or replace function public.abandon_content_asset_upload(p_app_user_id uuid,p_asset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||p_app_user_id::text,0));
  update public.content_assets set upload_settled_at=case
    when upload_settled_at is null and upload_expires_at>clock_timestamp() then null else clock_timestamp() end,
    cleanup_requested_at=clock_timestamp(),cleanup_retry_at=clock_timestamp(),storage_deleted_at=null,
    deleted_at=coalesce(deleted_at,clock_timestamp()),cleanup_generation=cleanup_generation+1
    where id=p_asset_id and app_user_id=p_app_user_id and post_id is null and notice_id is null;
end $$;

create or replace function public.reserve_s3_storage_object(p_bucket text,p_path text,p_content_type text,p_size bigint,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare b storage.buckets%rowtype; old public.s3_storage_objects%rowtype; a public.content_assets%rowtype; variant boolean:=false;
begin
  select * into b from storage.buckets where id=p_bucket;
  if not found or p_size is null or p_size<1 or p_size>coalesce(b.file_size_limit,52428800)
    or p_content_type is null or (b.allowed_mime_types is not null and not p_content_type=any(b.allowed_mime_types))
    or (p_sha256 is not null and p_sha256!~'^[0-9a-f]{64}$') then raise exception 'S3_INVALID_UPLOAD'; end if;
  if p_bucket in('fan-avatars','certification-proofs') and not exists(select 1 from public.fan_private_uploads where bucket=p_bucket and object_path=p_path and expires_at>clock_timestamp()) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  if p_bucket='fan-content-assets' then
    select * into a from public.content_assets where p_path=storage_path
      or p_path=regexp_replace(storage_path,'\.webp$','.thumbnail-240-v1.webp') for update;
    if not found or a.deleted_at is not null or a.cleanup_requested_at is not null or a.storage_deleted_at is not null
      or a.upload_settled_at is not null or a.upload_expires_at<=clock_timestamp()
      or not exists(select 1 from public.app_users where id=a.app_user_id and status='active') then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
    variant:=p_path=regexp_replace(a.storage_path,'\.webp$','.thumbnail-240-v1.webp');
    if (not variant and (a.storage_path<>p_path or a.byte_size<>p_size or a.mime_type<>p_content_type or a.sha256 is distinct from p_sha256))
      or (variant and (p_content_type<>'image/webp' or p_sha256 is null)) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
    -- The caller's total PUT deadline is 60s; retain the parent lease through any in-flight write, even if it dies before settle.
    update public.content_assets set upload_expires_at=greatest(upload_expires_at,clock_timestamp()+interval '5 minutes') where id=a.id;
  end if;
  if p_bucket='mobile-media' and not exists(select 1 from public.mobile_media_assets where (p_path in(storage_path,thumbnail_path) or (purpose='wave_album' and kind='image' and p_path=regexp_replace(storage_path,'[^/]+$','display.webp'))) and state in('uploading','pending','processing') and cleanup_requested_at is null and storage_deleted_at is null) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  select * into old from public.s3_storage_objects where bucket_id=p_bucket and name=p_path for update;
  -- Only a live variant lease may recover a completed failed conversion; an active delete cannot be revived.
  if found and variant and old.state='deleted' and not exists(select 1 from public.s3_storage_delete_outbox where bucket_id=p_bucket and name=p_path) then
    update public.s3_storage_objects set state='uploading',metadata=jsonb_build_object('mimetype',p_content_type,'size',p_size),
      user_metadata=jsonb_build_object('sha256',p_sha256),updated_at=clock_timestamp() where bucket_id=p_bucket and name=p_path;
    select * into old from public.s3_storage_objects where bucket_id=p_bucket and name=p_path;
  end if;
  if found and (old.state in('delete_pending','deleted') or old.metadata->>'mimetype'<>p_content_type or (old.metadata->>'size')::bigint<>p_size or (p_sha256 is not null and old.user_metadata->>'sha256' is distinct from p_sha256)) then raise exception 'S3_OBJECT_CONFLICT'; end if;
  insert into public.s3_storage_objects(bucket_id,name,metadata,user_metadata) values(p_bucket,p_path,jsonb_build_object('mimetype',p_content_type,'size',p_size),case when p_sha256 is null then '{}'::jsonb else jsonb_build_object('sha256',p_sha256) end) on conflict do nothing;
  -- An upload that loses its application transaction is still collected durably.
  if old.state is distinct from 'ready' then
    insert into public.s3_storage_delete_outbox(bucket_id,name,retry_at) values(p_bucket,p_path,clock_timestamp()+interval '2 hours 5 minutes') on conflict do nothing;
  end if;
end $$;

revoke all on function public.begin_content_thumbnail_upload(text),public.settle_content_thumbnail_upload(text,bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function public.begin_content_thumbnail_upload(text),public.settle_content_thumbnail_upload(text,bigint,boolean) to service_role;
commit;
