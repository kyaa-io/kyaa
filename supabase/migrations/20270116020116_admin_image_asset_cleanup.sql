-- Discover inbound foreign keys, including composite keys, in the live schema.
create function public.image_asset_fk_uses(p_asset public.public_image_assets)
returns text[] language plpgsql stable set search_path='' as $$
declare fk record; used boolean; uses text[] := '{}';
begin
  for fk in
    select c.conrelid::regclass as relation,
      string_agg(format('child.%I = ($1).%I', a.attname, b.attname), ' and ' order by k.i) as predicate,
      string_agg(a.attname, ', ' order by k.i) as columns
    from pg_constraint c
    cross join lateral generate_subscripts(c.conkey,1) k(i)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[k.i]
    join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[k.i]
    where c.contype='f' and c.confrelid='public.public_image_assets'::regclass
    group by c.oid,c.conrelid
  loop
    execute format('select exists(select from %s child where %s)',fk.relation,fk.predicate)
      into used using p_asset;
    if used then uses := array_append(uses,format('%s.%s',fk.relation,fk.columns)); end if;
  end loop;
  return uses;
end $$;

create function public.admin_delete_image_asset(p_actor uuid,p_allowlist uuid,p_correlation uuid,p_id uuid,p_sources jsonb)
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
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
    values(p_actor,p_allowlist,'public_image.asset.deleted','public_image_asset',p_id::text,p_correlation,jsonb_build_object('sha256',asset.content_sha256));
  return jsonb_build_object('status',200,'bucket',asset.storage_bucket,'path',asset.storage_path,'generation',generation);
end $$;

revoke all on function public.image_asset_fk_uses(public.public_image_assets),public.admin_delete_image_asset(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_delete_image_asset(uuid,uuid,uuid,uuid,jsonb) to service_role;

create function public.admin_unused_image_assets(p_actor uuid,p_allowlist uuid,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_admin(p_actor,p_allowlist,false);
  return (select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]'::jsonb) from (
    select a.id,a.url,a.byte_size,a.content_sha256,a.created_at,admin.email as creator
    from public.public_image_assets a join public.admin_allowlist admin on admin.id=a.created_by_admin_allowlist_id
    where cardinality(public.image_asset_fk_uses(a))=0
    order by a.created_at desc,a.id desc limit 50 offset greatest(0,p_offset)
  ) page);
end $$;
revoke all on function public.admin_unused_image_assets(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_unused_image_assets(uuid,uuid,integer) to service_role;
