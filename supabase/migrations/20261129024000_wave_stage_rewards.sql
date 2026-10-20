-- Stage prizes and private, entry-based photocard delivery.
alter table public.live_benefit_campaign_items add column draw_enabled boolean not null default true, add column stage_prize_kind text check(stage_prize_kind in ('coffee_chat','hotel_coffee'));

create table public.cheer_photocard_collections(
 id uuid primary key default extensions.gen_random_uuid(),
 campaign_id uuid not null unique references public.live_benefit_campaigns(id),
 title_ko text not null default '응원 참여 포토카드', title_en text not null default 'Cheer participation photocard'
);
create table public.cheer_photocard_assets(
 id uuid primary key default extensions.gen_random_uuid(),
 collection_id uuid not null references public.cheer_photocard_collections(id),
 storage_path text not null unique check(length(storage_path) between 1 and 500 and storage_path ~ '^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$' and storage_path !~ '(\.\.|//|/$)'),
 width integer not null check(width>0), height integer not null check(height>0),
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
 position integer not null check(position>=0), unique(collection_id,position)
);
create table public.cheer_photocard_entitlements(
 id uuid primary key default extensions.gen_random_uuid(),
 campaign_id uuid not null references public.live_benefit_campaigns(id),
 app_user_id uuid not null references public.app_users(id),
 created_at timestamptz not null default clock_timestamp(), unique(campaign_id,app_user_id)
);
alter table public.cheer_photocard_collections enable row level security;
alter table public.cheer_photocard_assets enable row level security;
alter table public.cheer_photocard_entitlements enable row level security;
revoke all on public.cheer_photocard_collections,public.cheer_photocard_assets,public.cheer_photocard_entitlements from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public) values('cheer-photocards','cheer-photocards',false) on conflict(id) do update set public=false;
create function public.grant_cheer_photocard_entitlement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.cheer_photocard_entitlements(campaign_id,app_user_id) select new.campaign_id,new.app_user_id where exists(select 1 from public.cheer_photocard_collections where campaign_id=new.campaign_id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.grant_cheer_photocard_entitlement() from public,anon,authenticated,service_role;
create trigger grant_cheer_photocard_entitlement after insert on public.benefit_cheer_entries for each row execute function public.grant_cheer_photocard_entitlement();
insert into public.cheer_photocard_collections(campaign_id) select id from public.live_benefit_campaigns where id in ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe') and entry_source='cheer' on conflict do nothing;
insert into public.cheer_photocard_entitlements(campaign_id,app_user_id,created_at) select campaign_id,app_user_id,entered_at from public.benefit_cheer_entries where campaign_id in (select campaign_id from public.cheer_photocard_collections) on conflict do nothing;

create function public.read_celebrity_cheer_event_rewards(p_slug text,p_app_user_id uuid default null,p_locale public.content_locale default 'ko') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; event jsonb; collection public.cheer_photocard_collections%rowtype;
begin
 result:=public.read_celebrity_cheer_event_live_state(p_slug,p_app_user_id,p_locale); event:=result->'event';
 if event is null or event='null'::jsonb then return result; end if;
 select * into collection from public.cheer_photocard_collections where campaign_id=(event->>'campaignId')::uuid;
 event:=jsonb_set(event,'{prizes}',coalesce((select jsonb_agg(prize||jsonb_build_object('kind',item.stage_prize_kind) order by item.priority)
 from jsonb_array_elements(event->'prizes') prize join public.live_benefit_campaign_items item on item.campaign_id=(event->>'campaignId')::uuid and item.benefit_id=(prize->>'benefitId')::uuid and item.draw_enabled),'[]'::jsonb));
 event:=event||jsonb_build_object('photocard',case when collection.id is null then null else jsonb_build_object(
 'collectionId',collection.id,'title',case when p_locale='ko' then collection.title_ko else collection.title_en end,
 'eligible',case when p_app_user_id is null then null else exists(select 1 from public.cheer_photocard_entitlements where campaign_id=collection.campaign_id and app_user_id=p_app_user_id) end,
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'width',width,'height',height) order by position,id) from public.cheer_photocard_assets where collection_id=collection.id and exists(select 1 from public.cheer_photocard_entitlements entitlement where entitlement.campaign_id=collection.campaign_id and entitlement.app_user_id=p_app_user_id)),'[]'::jsonb)) end);
 return jsonb_build_object('event',event);
end $$;
create function public.authorize_cheer_photocard_read(p_app_user_id uuid,p_asset_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storagePath',asset.storage_path,'contentType',asset.content_type,'watermarkCode',upper(substr(encode(extensions.digest(entitlement.id::text,'sha256'),'hex'),1,12)))
 from public.cheer_photocard_assets asset join public.cheer_photocard_collections collection on collection.id=asset.collection_id
 join public.cheer_photocard_entitlements entitlement on entitlement.campaign_id=collection.campaign_id and entitlement.app_user_id=p_app_user_id
 join public.app_users owner on owner.id=p_app_user_id and owner.status='active' where asset.id=p_asset_id;
$$;
revoke all on function public.read_celebrity_cheer_event_rewards(text,uuid,public.content_locale),public.authorize_cheer_photocard_read(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_celebrity_cheer_event_rewards(text,uuid,public.content_locale),public.authorize_cheer_photocard_read(uuid,uuid) to service_role;
