begin;

-- Physical S3 keys always include the logical bucket, preserving private namespaces.
create table public.s3_storage_objects (
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb not null,
  user_metadata jsonb not null default '{}',
  state text not null default 'uploading' check(state in('uploading','ready','delete_pending','deleted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(bucket_id,name),
  check(bucket_id in('cms-assets','fan-avatars','certification-proofs','fan-content-assets','mobile-media','cheer-photocards')),
  check(name<>'' and name!~'(^|/)(\.|\.\.|)(/|$)' and name!~'[[:cntrl:]\\]')
);
create table public.s3_storage_delete_outbox (
  bucket_id text not null,
  name text not null,
  generation bigint not null default 0,
  retry_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  primary key(bucket_id,name),
  foreign key(bucket_id,name) references public.s3_storage_objects(bucket_id,name)
);
alter table public.s3_storage_objects enable row level security;
alter table public.s3_storage_objects force row level security;
alter table public.s3_storage_delete_outbox enable row level security;
alter table public.s3_storage_delete_outbox force row level security;
revoke all on public.s3_storage_objects,public.s3_storage_delete_outbox from public,anon,authenticated,service_role;

create function public.reserve_s3_storage_object(p_bucket text,p_path text,p_content_type text,p_size bigint,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare b storage.buckets%rowtype; old public.s3_storage_objects%rowtype;
begin
  select * into b from storage.buckets where id=p_bucket;
  if not found or p_size is null or p_size<1 or p_size>coalesce(b.file_size_limit,52428800)
    or p_content_type is null or (b.allowed_mime_types is not null and not p_content_type=any(b.allowed_mime_types))
    or (p_sha256 is not null and p_sha256!~'^[0-9a-f]{64}$') then raise exception 'S3_INVALID_UPLOAD'; end if;
  if p_bucket in('fan-avatars','certification-proofs') and not exists(select 1 from public.fan_private_uploads where bucket=p_bucket and object_path=p_path and expires_at>clock_timestamp()) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  if p_bucket='fan-content-assets' and not exists(select 1 from public.content_assets where storage_path=p_path and deleted_at is null and cleanup_requested_at is null and storage_deleted_at is null and byte_size=p_size and mime_type=p_content_type and sha256=p_sha256) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  if p_bucket='mobile-media' and not exists(select 1 from public.mobile_media_assets where (p_path in(storage_path,thumbnail_path) or (purpose='wave_album' and kind='image' and p_path=regexp_replace(storage_path,'[^/]+$','display.webp'))) and state in('uploading','pending','processing') and cleanup_requested_at is null and storage_deleted_at is null) then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  select * into old from public.s3_storage_objects where bucket_id=p_bucket and name=p_path for update;
  if found and (old.state in('delete_pending','deleted') or old.metadata->>'mimetype'<>p_content_type or (old.metadata->>'size')::bigint<>p_size or (p_sha256 is not null and old.user_metadata->>'sha256' is distinct from p_sha256)) then raise exception 'S3_OBJECT_CONFLICT'; end if;
  insert into public.s3_storage_objects(bucket_id,name,metadata,user_metadata) values(p_bucket,p_path,jsonb_build_object('mimetype',p_content_type,'size',p_size),case when p_sha256 is null then '{}'::jsonb else jsonb_build_object('sha256',p_sha256) end) on conflict do nothing;
  -- An upload that loses its application transaction is still collected durably.
  if old.state is distinct from 'ready' then
    insert into public.s3_storage_delete_outbox(bucket_id,name,retry_at) values(p_bucket,p_path,clock_timestamp()+interval '2 hours 5 minutes') on conflict do nothing;
  end if;
end $$;

create function public.confirm_s3_storage_object(p_bucket text,p_path text,p_content_type text,p_size bigint,p_sha256 text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_sha256 is not null and p_sha256!~'^[0-9a-f]{64}$' then raise exception 'S3_INVALID_HASH'; end if;
  update public.s3_storage_objects set state='ready',updated_at=clock_timestamp(),user_metadata=case when p_sha256 is null then user_metadata else jsonb_build_object('sha256',p_sha256) end
  where bucket_id=p_bucket and name=p_path and state in('uploading','ready') and metadata->>'mimetype'=p_content_type and (metadata->>'size')::bigint=p_size and (p_sha256 is null or user_metadata->>'sha256' is null or user_metadata->>'sha256'=p_sha256);
  if not found then raise exception 'S3_OBJECT_CONFLICT'; end if;
  delete from public.s3_storage_delete_outbox where bucket_id=p_bucket and name=p_path and lease_until is null;
  return true;
end $$;

create function public.reserve_s3_mobile_upload(p_path text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.mobile_media_assets%rowtype;
begin
  select * into a from public.mobile_media_assets where storage_path=p_path and state='uploading' and upload_expires_at>clock_timestamp() and cleanup_requested_at is null and storage_deleted_at is null for update;
  if not found then raise exception 'S3_UPLOAD_NOT_RESERVED'; end if;
  perform public.fan_web_lock_active_user(a.app_user_id);
  perform public.reserve_s3_storage_object('mobile-media',p_path,a.content_type,a.expected_byte_size,null);
  return jsonb_build_object('contentType',a.content_type,'byteSize',a.expected_byte_size);
end $$;

create function public.queue_s3_storage_delete(p_bucket text,p_path text) returns bigint language plpgsql security definer set search_path='' as $$
declare token bigint;
begin
  insert into public.s3_storage_objects(bucket_id,name,metadata,state) values(p_bucket,p_path,'{}','delete_pending') on conflict(bucket_id,name) do update set state='delete_pending',updated_at=clock_timestamp();
  insert into public.s3_storage_delete_outbox(bucket_id,name,generation,lease_until) values(p_bucket,p_path,1,clock_timestamp()+interval '5 minutes')
  on conflict(bucket_id,name) do update set generation=s3_storage_delete_outbox.generation+1,lease_until=clock_timestamp()+interval '5 minutes' returning generation into token;
  return token;
end $$;

create function public.claim_s3_storage_deletes(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'S3_INVALID_LIMIT'; end if;
  with candidates as(select bucket_id,name from public.s3_storage_delete_outbox where retry_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by retry_at for update skip locked limit p_limit),
  claimed as(update public.s3_storage_delete_outbox d set generation=d.generation+1,lease_until=clock_timestamp()+interval '5 minutes' from candidates c where d.bucket_id=c.bucket_id and d.name=c.name returning d.*)
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'generation',generation)),'[]') into result from claimed;
  update public.s3_storage_objects set state='delete_pending' where (bucket_id,name) in(select x->>'bucket',x->>'path' from jsonb_array_elements(result) x);
  return result;
end $$;

create function public.finish_s3_storage_delete(p_bucket text,p_path text,p_generation bigint,p_succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.s3_storage_delete_outbox where bucket_id=p_bucket and name=p_path and generation=p_generation for update) then raise exception 'S3_STALE_DELETE_LEASE'; end if;
  if p_succeeded then
    update public.s3_storage_objects set state='deleted',updated_at=clock_timestamp() where bucket_id=p_bucket and name=p_path;
    delete from public.s3_storage_delete_outbox where bucket_id=p_bucket and name=p_path and generation=p_generation;
  else
    update public.s3_storage_delete_outbox set lease_until=null,retry_at=clock_timestamp()+interval '1 minute' where bucket_id=p_bucket and name=p_path and generation=p_generation;
  end if;
end $$;

create function public.get_s3_storage_object_state(p_bucket text,p_path text) returns text language sql stable security definer set search_path='' as $$ select state from public.s3_storage_objects where bucket_id=p_bucket and name=p_path $$;
revoke all on function public.get_s3_storage_object_state(text,text) from public,anon,authenticated;
grant execute on function public.get_s3_storage_object_state(text,text) to service_role;

-- Existing guarded functions keep every actor, ownership, hash and publication check.
create view public.asset_storage_objects with(security_invoker=true) as
 select bucket_id,name,metadata,coalesce(to_jsonb(s)->'user_metadata','{}'::jsonb) as user_metadata from storage.objects s where not exists(select 1 from public.s3_storage_objects a where a.bucket_id=s.bucket_id and a.name=s.name)
 union all select bucket_id,name,metadata,user_metadata from public.s3_storage_objects where state='ready';
revoke all on public.asset_storage_objects from public,anon,authenticated,service_role;
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('set_admin_live_preview_status','begin_owned_account_deletion') loop
   definition:=pg_catalog.pg_get_functiondef(f.oid);
   execute replace(definition,'storage.objects','public.asset_storage_objects');
 end loop;
end $$;

alter table public.public_image_assets drop constraint public_image_assets_storage;
alter table public.public_image_assets add constraint public_image_assets_storage check(
 storage_bucket='cms-assets' and storage_path='public-image-assets/'||content_sha256||'.webp'
 and (url ~ '^https://[^/?#]+/storage/v1/object/public/cms-assets/public-image-assets/[0-9a-f]{64}\.webp$'
   or url ~ '^https://[^/?#]+(/[^?#]*)?/cms-assets/public-image-assets/[0-9a-f]{64}\.webp$'));

revoke all on function public.reserve_s3_storage_object(text,text,text,bigint,text), public.confirm_s3_storage_object(text,text,text,bigint,text), public.reserve_s3_mobile_upload(text), public.queue_s3_storage_delete(text,text), public.claim_s3_storage_deletes(integer), public.finish_s3_storage_delete(text,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.reserve_s3_storage_object(text,text,text,bigint,text), public.confirm_s3_storage_object(text,text,text,bigint,text), public.reserve_s3_mobile_upload(text), public.queue_s3_storage_delete(text,text), public.claim_s3_storage_deletes(integer), public.finish_s3_storage_delete(text,text,bigint,boolean) to service_role;
commit;
