-- Pair with 20261222001000_video_thumbnails.sql; register before S3 upload.
begin;
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
  if p_bucket='mobile-media' and not exists(select 1 from public.mobile_media_assets where (p_path in(storage_path,thumbnail_path) or (purpose='wave_album' and kind='image' and p_path=regexp_replace(storage_path,'[^/]+$','display.webp'))) and state in('uploading','pending','processing') and cleanup_requested_at is null and storage_deleted_at is null)
    and not (p_content_type='image/webp' and p_size<=8388608 and exists(
      select 1 from (
        select notice_id,storage_path,thumbnail_path,byte_size,sha256,false as backfill from public.sns_ingest_media
        union all select notice_id,storage_path,thumbnail_path,byte_size,sha256,true as backfill from public.video_thumbnails
      ) m join public.celebrity_notices n on n.id=m.notice_id
      where n.archived_at is null and ((n.publication_status='draft' and n.ever_published_at is null)
        or (m.backfill and public.fan_web_content_visible(null,'notice',n.id)))
        and ((p_path=m.storage_path and p_size=m.byte_size and p_sha256=m.sha256) or (p_path=m.thumbnail_path and p_sha256 is not null))
    )) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
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

commit;
