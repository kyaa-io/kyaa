-- Fence cleanup against bounded validation writes, including a cancelled writer finishing late.
begin;
create function public.reconcile_mobile_media_upload_cleanup(p_asset_id uuid,p_asset_version integer,p_job_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.mobile_media_assets a set storage_deleted_at=null,cleanup_generation=cleanup_generation+1,
  cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp()+interval '5 minutes',coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes')
 where a.id=p_asset_id and a.state in('cancelled','rejected')
  and exists(select 1 from public.mobile_media_validation_jobs j where j.id=p_job_id and j.asset_id=a.id and j.asset_version=p_asset_version);
end $$;
revoke all on function public.reconcile_mobile_media_upload_cleanup(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_mobile_media_upload_cleanup(uuid,integer,uuid) to service_role;
create or replace function public.claim_mobile_media_cleanup(p_limit integer default 25)returns jsonb language plpgsql security definer set search_path=''as $$declare result jsonb;begin
 update public.mobile_media_assets a set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(a.storage_token_expires_at,a.upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()where a.storage_deleted_at is null and a.attached_id is null and(a.state not in('cancelled','rejected') or a.cleanup_requested_at is null) and((a.state='uploading'and a.upload_expires_at<=clock_timestamp())or exists(select 1 from public.app_users u where u.id=a.app_user_id and u.status<>'active'));
 with due as(select id from public.mobile_media_assets where storage_deleted_at is null and cleanup_requested_at<=clock_timestamp()-interval'5 minutes' and(cleanup_retry_at is null or cleanup_retry_at<=clock_timestamp())order by cleanup_retry_at nulls first,created_at for update skip locked limit least(greatest(p_limit,1),50)),claimed as(update public.mobile_media_assets a set cleanup_generation=cleanup_generation+1,cleanup_retry_at=clock_timestamp()+interval'5 minutes'from due where a.id=due.id returning a.id,a.storage_path,a.thumbnail_path,a.purpose,a.kind,a.cleanup_generation)select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('assetId',id,'storagePath',storage_path,'thumbnailPath',thumbnail_path,'displayPath',case when purpose='wave_album' and kind='image' then regexp_replace(storage_path,'[^/]+$','display.webp') else null end,'generation',cleanup_generation)),'[]'::jsonb))into result from claimed;return result;end $$;
commit;
