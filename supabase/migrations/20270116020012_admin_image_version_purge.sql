alter table public.s3_storage_delete_outbox add column purge_asset uuid, add column purge_correlation uuid, add column purge_deleted text[] not null default array[]::text[];

create or replace function public.admin_delete_image_asset(p_actor uuid,p_allowlist uuid,p_correlation uuid,p_id uuid,p_sources jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare asset public.public_image_assets; uses text[]; generation bigint;
begin
  perform public.assert_active_admin(p_actor,p_allowlist,true);
  select * into asset from public.public_image_assets where id=p_id for update;
  if not found then return jsonb_build_object('status',404); end if;
  if jsonb_typeof(p_sources) is distinct from 'object' then raise exception 'MISSING_SOURCE_INDEX'; end if;
  uses := public.image_asset_fk_uses(asset)
    || array(select jsonb_array_elements_text(p_sources->asset.content_sha256))
    || array(select jsonb_array_elements_text(p_sources->asset.id::text));
  if cardinality(uses)>0 then return jsonb_build_object('status',409,'references',uses); end if;
  delete from public.public_image_assets where id=p_id;
  generation := public.queue_s3_storage_delete(asset.storage_bucket,asset.storage_path);
  update public.s3_storage_delete_outbox set purge_asset=p_id,purge_correlation=p_correlation where bucket_id=asset.storage_bucket and name=asset.storage_path;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
    values(p_actor,p_allowlist,'public_image.asset.deleted','public_image_asset',p_id::text,p_correlation,jsonb_build_object('sha256',asset.content_sha256));
  return jsonb_build_object('status',200,'bucket',asset.storage_bucket,'path',asset.storage_path,'generation',generation);
end $$;


create function public.finish_admin_image_purge(p_bucket text,p_path text,p_generation bigint,p_deleted text[],p_remaining integer)
returns void language plpgsql security definer set search_path='' as $$
declare job public.s3_storage_delete_outbox; ids text[];
begin
  select * into strict job from public.s3_storage_delete_outbox where bucket_id=p_bucket and name=p_path and generation=p_generation and purge_asset is not null for update;
  ids := job.purge_deleted || p_deleted;
  update public.s3_storage_delete_outbox set purge_deleted=ids where bucket_id=p_bucket and name=p_path;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
    select actor_app_user_id,actor_admin_allowlist_id,'public_image.asset.purge','public_image_asset',entity_id,correlation_id,
      jsonb_build_object('deletedVersionIds',ids,'remainingVersions',p_remaining,'result',
        case when p_remaining=0 then format('영구 삭제(버전 %s개)',cardinality(ids)) else '영구 삭제 대기' end)
    from public.audit_logs where entity_id=job.purge_asset::text and correlation_id=job.purge_correlation and action='public_image.asset.deleted';
  perform public.finish_s3_storage_delete(p_bucket,p_path,p_generation,coalesce(p_remaining=0,false));
end $$;
revoke all on function public.finish_admin_image_purge(text,text,bigint,text[],integer) from public,anon,authenticated;
grant execute on function public.finish_admin_image_purge(text,text,bigint,text[],integer) to service_role;

create or replace function public.claim_s3_storage_deletes(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'S3_INVALID_LIMIT'; end if;
  with candidates as(select bucket_id,name from public.s3_storage_delete_outbox where retry_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by retry_at for update skip locked limit p_limit),
  claimed as(update public.s3_storage_delete_outbox d set generation=d.generation+1,lease_until=clock_timestamp()+interval '5 minutes' from candidates c where d.bucket_id=c.bucket_id and d.name=c.name returning d.*)
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'generation',generation,'permanent',purge_asset is not null)),'[]') into result from claimed;
  update public.s3_storage_objects set state='delete_pending' where (bucket_id,name) in(select x->>'bucket',x->>'path' from jsonb_array_elements(result) x);
  return result;
end $$;

