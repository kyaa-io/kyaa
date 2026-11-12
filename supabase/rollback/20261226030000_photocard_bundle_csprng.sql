begin;
create or replace function public.claim_cheer_photocard_bundle(p_app_user_id uuid,p_collection_id uuid,p_bundle_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare collection public.cheer_photocard_collections%rowtype; entitlement public.cheer_photocard_entitlements%rowtype; selected uuid; state jsonb;
begin
 select * into collection from public.cheer_photocard_collections where id=p_collection_id;
 if not found then raise exception 'PHOTOCARD_NOT_FOUND'; end if;
 select e.* into entitlement from public.cheer_photocard_entitlements e join public.app_users u on u.id=e.app_user_id and u.status='active'
 where e.campaign_id=collection.campaign_id and e.app_user_id=p_app_user_id for update of e;
 if not found then raise exception 'PHOTOCARD_NOT_FOUND'; end if;
 if collection.distribution_mode='all' then raise exception 'PHOTOCARD_NOT_READY'; end if;
 if (collection.distribution_mode='member_pair' and (p_bundle_id is null or not exists(select 1 from public.cheer_photocard_bundles where id=p_bundle_id and collection_id=collection.id)))
 or (collection.distribution_mode='random_three' and p_bundle_id is not null) then raise exception 'PHOTOCARD_INVALID_SELECTION'; end if;
 if entitlement.selected_bundle_id is not null then
  if collection.distribution_mode='member_pair' and entitlement.selected_bundle_id<>p_bundle_id then raise exception 'PHOTOCARD_ALREADY_CLAIMED'; end if;
  return public.read_cheer_photocard_claim(p_app_user_id,p_collection_id);
 end if;
 state:=public.read_cheer_photocard_claim(p_app_user_id,p_collection_id);
 if state is null then raise exception 'PHOTOCARD_NOT_FOUND'; end if;
 if not (state->>'ready')::boolean then raise exception 'PHOTOCARD_NOT_READY'; end if;
 if collection.distribution_mode='member_pair' then selected:=p_bundle_id;
 else select id into selected from public.cheer_photocard_bundles where collection_id=collection.id order by pg_catalog.random() limit 1; end if;
 update public.cheer_photocard_entitlements set selected_bundle_id=selected where id=entitlement.id;
 return public.read_cheer_photocard_claim(p_app_user_id,p_collection_id);
end $$;
commit;
