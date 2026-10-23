-- Keep existing participation rights; a claim only fixes their private bundle.
alter table public.cheer_photocard_collections add column distribution_mode text not null default 'all' check(distribution_mode in ('all','member_pair','random_three'));
create table public.cheer_photocard_bundles(
 id uuid primary key default extensions.gen_random_uuid(),
 collection_id uuid not null references public.cheer_photocard_collections(id),
 title text not null check(length(btrim(title)) between 1 and 120),
 position integer not null check(position>=0),
 unique(collection_id,position), unique(id,collection_id)
);
alter table public.cheer_photocard_bundles enable row level security;
revoke all on public.cheer_photocard_bundles from public,anon,authenticated,service_role;
alter table public.cheer_photocard_assets add column bundle_id uuid,
 add constraint cheer_photocard_asset_bundle_collection_fk foreign key(bundle_id,collection_id) references public.cheer_photocard_bundles(id,collection_id);
alter table public.cheer_photocard_entitlements add column selected_bundle_id uuid references public.cheer_photocard_bundles(id);
update public.cheer_photocard_collections set distribution_mode=case campaign_id when 'c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid then 'member_pair' else 'random_three' end
 where campaign_id in ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe','aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb');

create function public.read_cheer_photocard_claim(p_app_user_id uuid,p_collection_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare collection public.cheer_photocard_collections%rowtype; selected uuid; ready boolean; expected integer;
begin
 select * into collection from public.cheer_photocard_collections where id=p_collection_id;
 if not found then return null; end if;
 select e.selected_bundle_id into selected
 from public.cheer_photocard_collections c join public.cheer_photocard_entitlements e on e.campaign_id=c.campaign_id and e.app_user_id=p_app_user_id
 join public.app_users u on u.id=e.app_user_id and u.status='active'
 join public.live_benefit_campaigns campaign on campaign.id=c.campaign_id
 where c.id=p_collection_id and (e.selected_bundle_id is not null or (campaign.status='published' and campaign.cancelled_at is null));
 if not found then return null; end if;
 expected:=case collection.distribution_mode when 'member_pair' then 2 when 'random_three' then 3 else 0 end;
 ready:=collection.distribution_mode='all' or (
 (select count(*)=4 from public.cheer_photocard_bundles where collection_id=collection.id)
 and not exists(select 1 from public.cheer_photocard_bundles b left join public.cheer_photocard_assets a on a.bundle_id=b.id and a.collection_id=b.collection_id where b.collection_id=collection.id group by b.id having count(a.id)<>expected)
 and not exists(select 1 from public.cheer_photocard_assets where collection_id=collection.id and bundle_id is null));
 return jsonb_build_object('mode',collection.distribution_mode,'ready',ready,'selectedBundleId',selected,
 'options',case when ready and collection.distribution_mode='member_pair' then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by position,id),'[]'::jsonb) from public.cheer_photocard_bundles where collection_id=collection.id) else '[]'::jsonb end,
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'width',width,'height',height) order by position,id),'[]'::jsonb) from public.cheer_photocard_assets where collection_id=collection.id and (collection.distribution_mode='all' or bundle_id=selected)));
end $$;

create function public.claim_cheer_photocard_bundle(p_app_user_id uuid,p_collection_id uuid,p_bundle_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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

create or replace function public.read_celebrity_cheer_event_rewards(p_slug text,p_app_user_id uuid default null,p_locale public.content_locale default 'ko') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; event jsonb; collection public.cheer_photocard_collections%rowtype;
begin
 result:=public.read_celebrity_cheer_event_live_state(p_slug,p_app_user_id,p_locale); event:=result->'event';
 if event is null or event='null'::jsonb then return result; end if;
 select * into collection from public.cheer_photocard_collections where campaign_id=(event->>'campaignId')::uuid;
 event:=jsonb_set(event,'{prizes}',coalesce((select jsonb_agg(prize||jsonb_build_object('kind',item.stage_prize_kind) order by item.priority)
 from jsonb_array_elements(event->'prizes') prize join public.live_benefit_campaign_items item on item.campaign_id=(event->>'campaignId')::uuid and item.benefit_id=(prize->>'benefitId')::uuid and item.draw_enabled),'[]'::jsonb));
 event:=event||jsonb_build_object('photocard',case when collection.id is null then null else jsonb_build_object(
 'collectionId',collection.id,'title',case when p_locale='ko' then collection.title_ko else collection.title_en end,
 'eligible',case when p_app_user_id is null then null else exists(select 1 from public.cheer_photocard_entitlements e join public.app_users u on u.id=e.app_user_id and u.status='active' where e.campaign_id=collection.campaign_id and e.app_user_id=p_app_user_id) end,
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'width',a.width,'height',a.height) order by a.position,a.id) from public.cheer_photocard_assets a
 join public.cheer_photocard_entitlements e on e.campaign_id=collection.campaign_id and e.app_user_id=p_app_user_id
 join public.app_users u on u.id=e.app_user_id and u.status='active'
 where a.collection_id=collection.id and (collection.distribution_mode='all' or a.bundle_id=e.selected_bundle_id)),'[]'::jsonb)) end);
 return jsonb_build_object('event',event);
end $$;
create or replace function public.authorize_cheer_photocard_read(p_app_user_id uuid,p_asset_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storagePath',asset.storage_path,'contentType',asset.content_type,'watermarkCode',upper(substr(encode(extensions.digest(entitlement.id::text,'sha256'),'hex'),1,12)))
 from public.cheer_photocard_assets asset join public.cheer_photocard_collections collection on collection.id=asset.collection_id
 join public.cheer_photocard_entitlements entitlement on entitlement.campaign_id=collection.campaign_id and entitlement.app_user_id=p_app_user_id
 join public.app_users owner on owner.id=p_app_user_id and owner.status='active'
 where asset.id=p_asset_id and (collection.distribution_mode='all' or asset.bundle_id=entitlement.selected_bundle_id);
$$;
revoke all on function public.read_cheer_photocard_claim(uuid,uuid),public.claim_cheer_photocard_bundle(uuid,uuid,uuid),public.read_celebrity_cheer_event_rewards(text,uuid,public.content_locale),public.authorize_cheer_photocard_read(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_cheer_photocard_claim(uuid,uuid),public.claim_cheer_photocard_bundle(uuid,uuid,uuid),public.read_celebrity_cheer_event_rewards(text,uuid,public.content_locale),public.authorize_cheer_photocard_read(uuid,uuid) to service_role;
