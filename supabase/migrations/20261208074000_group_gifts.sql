begin;
-- Gift approval is private inventory. Only a linked raffle publishes its frozen display snapshot.
create table public.group_gift_applications(
 id uuid primary key default extensions.gen_random_uuid(),
 page_id uuid not null references public.group_pages(id),
 submitted_by uuid not null references public.app_users(id),
 name text not null check(length(btrim(name)) between 1 and 100),
 image_asset_id uuid not null references public.mobile_media_assets(id),
 quantity integer not null check(quantity between 1 and 100000),
 provider_name text not null check(length(btrim(provider_name)) between 1 and 120),
 fulfillment_method public.benefit_fulfillment_method not null,
 fulfillment_description text not null check(length(btrim(fulfillment_description)) between 1 and 1000),
 conditions text not null default '' check(length(conditions)<=2000),
 status text not null default 'submitted' check(status in('submitted','reviewing','approved','rejected','changes_requested')),
 revision integer not null default 1 check(revision>0),
 reason text not null default '' check(length(reason)<=1000),
 reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index group_gift_page_status on public.group_gift_applications(page_id,status,id);
create table public.group_gift_history(
 application_id uuid not null references public.group_gift_applications(id),revision integer not null,
 actor_id uuid not null references public.app_users(id),admin_id uuid,
 status text not null,reason text not null,snapshot jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(application_id,revision)
);
alter table public.group_gift_applications enable row level security;
alter table public.group_gift_applications force row level security;
alter table public.group_gift_history enable row level security;
alter table public.group_gift_history force row level security;
revoke all on public.group_gift_applications,public.group_gift_history from public,anon,authenticated,service_role;
alter table public.group_raffles add column gift_application_id uuid references public.group_gift_applications(id);
alter table public.group_raffles add column gift_image_asset_id uuid references public.mobile_media_assets(id);
alter table public.group_raffles add column gift_snapshot jsonb;
alter table public.group_raffles add constraint group_raffle_gift_snapshot_complete check((gift_application_id is null and gift_image_asset_id is null and gift_snapshot is null)or(gift_application_id is not null and gift_image_asset_id is not null and gift_snapshot is not null));
create index group_raffle_gift_stock on public.group_raffles(gift_application_id)where cancelled_at is null;
create function public.group_gift_immutable_snapshot()returns trigger language plpgsql security definer set search_path=''as $$begin
 if old.gift_application_id is not null and (new.gift_application_id,new.gift_image_asset_id,new.gift_snapshot,new.title,new.summary,new.image_url,new.fulfillment_method,new.winner_quantity,new.page_id)is distinct from(old.gift_application_id,old.gift_image_asset_id,old.gift_snapshot,old.title,old.summary,old.image_url,old.fulfillment_method,old.winner_quantity,old.page_id)then raise exception 'GROUP_GIFT_CONFLICT';end if;
 return new;
end $$;
create trigger group_gift_immutable_snapshot before update on public.group_raffles for each row execute function public.group_gift_immutable_snapshot();
create function public.group_gift_immutable_history()returns trigger language plpgsql security definer set search_path=''as $$begin raise exception 'GROUP_GIFT_CONFLICT';end $$;
create trigger group_gift_immutable_history before update or delete on public.group_gift_history for each row execute function public.group_gift_immutable_history();

-- Extend the current constraint; preserve activity/qualification additions from earlier migrations.
do $$declare c record;begin
 select oid,conname,pg_get_expr(conbin,conrelid)body into c from pg_constraint where conrelid='public.group_image_references'::regclass and contype='c'and pg_get_constraintdef(oid)like '%target_type%';
 if c.oid is null then raise exception 'GROUP_GIFT_MEDIA_CONSTRAINT_MISSING';end if;
 execute format('alter table public.group_image_references drop constraint %I',c.conname);
 execute format('alter table public.group_image_references add constraint %I check((%s)or target_type=''gift_application'')',c.conname,c.body);
 if to_regprocedure('public.group_attach_image_before_gifts(uuid,text,uuid,uuid)')is not null or to_regprocedure('public.authorize_group_image_read_before_gifts(uuid,uuid,text)')is not null then raise exception 'GROUP_GIFT_MEDIA_WRAPPER_EXISTS';end if;
 if not exists(select 1 from pg_proc where oid='public.group_attach_image(uuid,text,uuid,uuid)'::regprocedure and prosecdef and proconfig @> array['search_path=""'])or not exists(select 1 from pg_proc where oid='public.authorize_group_image_read(uuid,uuid,text)'::regprocedure and prosecdef and proconfig @> array['search_path=""'])then raise exception 'GROUP_GIFT_MEDIA_CONTRACT_CHANGED';end if;
end $$;
do $$declare definition text;begin definition:=pg_get_functiondef('public.group_attach_image(uuid,text,uuid,uuid)'::regprocedure);execute replace(definition,'FUNCTION public.group_attach_image(','FUNCTION public.group_attach_image_before_gifts(');end $$;
create or replace function public.group_attach_image(p_actor uuid,p_type text,p_target uuid,p_asset uuid)returns void language plpgsql security definer set search_path=''as $$
declare g public.group_gift_applications;a public.mobile_media_assets;old_asset uuid;
begin
 if p_type<>'gift_application'then perform public.group_attach_image_before_gifts(p_actor,p_type,p_target,p_asset);return;end if;
 perform public.fan_web_lock_active_user(p_actor);
 select *into g from public.group_gift_applications where id=p_target for update;
 if not found or not exists(select 1 from public.group_memberships where page_id=g.page_id and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUP_GIFT_FORBIDDEN';end if;
 select asset_id into old_asset from public.group_image_references where target_type=p_type and target_id=p_target for update;
 select *into a from public.mobile_media_assets where id=p_asset for update;
 if not found or a.kind<>'image'or a.purpose<>'group_image'or a.state<>'ready'or a.storage_deleted_at is not null or not(a.app_user_id=p_actor or old_asset=a.id)or(a.attached_id is not null and old_asset is distinct from a.id)then raise exception 'GROUP_GIFT_INVALID';end if;
 if old_asset is not null and old_asset is distinct from p_asset then
  delete from public.group_image_references where target_type=p_type and target_id=p_target;
  -- Never delete an asset captured by a published raffle snapshot, including cancelled raffles.
  if not exists(select 1 from public.group_raffles where gift_image_asset_id=old_asset)then
   update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes'),updated_at=now()where id=old_asset;
  end if;
 end if;
 insert into public.group_image_references values(p_type,p_target,p_asset)on conflict(target_type,target_id)do update set asset_id=excluded.asset_id;
 update public.mobile_media_assets set attached_type='group_image',attached_id=p_target,attached_version=g.revision,access_scope='group_image',position=0,updated_at=now()where id=p_asset;
end $$;
do $$declare definition text;begin definition:=pg_get_functiondef('public.authorize_group_image_read(uuid,uuid,text)'::regprocedure);execute replace(definition,'FUNCTION public.authorize_group_image_read(','FUNCTION public.authorize_group_image_read_before_gifts(');end $$;
create or replace function public.authorize_group_image_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.mobile_media_assets;g public.group_gift_applications;admin uuid;
begin
 if p_variant not in('original','thumbnail')then return null;end if;
 -- Delegation preserves all pre-existing application/activity/private-page rules verbatim.
 if not exists(select 1 from public.group_image_references where asset_id=p_asset_id and target_type='gift_application')and not exists(select 1 from public.group_raffles where gift_image_asset_id=p_asset_id)then return public.authorize_group_image_read_before_gifts(p_app_user_id,p_asset_id,p_variant);end if;
 if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id);end if;
 select *into a from public.mobile_media_assets where id=p_asset_id and kind='image'and purpose='group_image'and state='ready'and storage_deleted_at is null;
 if not found then return null;end if;
 select ga.*into g from public.group_gift_applications ga join public.group_image_references ir on ir.target_id=ga.id and ir.target_type='gift_application'where ir.asset_id=p_asset_id;
 if g.id is null then select ga.*into g from public.group_gift_applications ga join public.group_raffles r on r.gift_application_id=ga.id where r.gift_image_asset_id=p_asset_id limit 1;end if;
 if not(exists(select 1 from public.group_memberships where page_id=g.page_id and app_user_id=p_app_user_id and role in('owner','manager'))or exists(select 1 from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active)or exists(select 1 from public.group_raffles r join public.group_pages p on p.id=r.page_id where r.gift_image_asset_id=p_asset_id and p.status='published'and public.group_scope_visible(p_app_user_id,p.id)))then return null;end if;
 if p_app_user_id is not null and not exists(select 1 from public.group_raffles r join public.group_pages p on p.id=r.page_id where r.gift_image_asset_id=p_asset_id and p.status='published'and public.group_scope_visible(p_app_user_id,p.id))then
  select aa.id into admin from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active limit 1;
  if admin is not null then insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_app_user_id,admin,'groups.gift.image.read','group_gift_application',g.id::text,extensions.gen_random_uuid(),jsonb_build_object('assetId',a.id));end if;
 end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then coalesce(a.thumbnail_path,a.storage_path)else a.storage_path end,'contentType',case when p_variant='thumbnail'and a.thumbnail_path is not null then 'image/webp'else a.content_type end);
end $$;

create function public.group_gift_json(p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',g.id,'pageId',g.page_id,'pageName',p.name,'name',g.name,'imageAssetId',g.image_asset_id,'imageUrl','/api/groups/images/'||g.image_asset_id::text,'quantity',g.quantity,'providerName',g.provider_name,'fulfillmentMethod',g.fulfillment_method,'fulfillmentDescription',g.fulfillment_description,'conditions',g.conditions,'status',g.status,'revision',g.revision,'reason',g.reason,'createdAt',g.created_at,'updatedAt',g.updated_at,'reviewedAt',g.reviewed_at,'reservedQuantity',s.used,'availableQuantity',greatest(0,g.quantity-s.used))from public.group_gift_applications g join public.group_pages p on p.id=g.page_id cross join lateral(select coalesce(sum(winner_quantity),0)::integer used from public.group_raffles where gift_application_id=g.id and cancelled_at is null)s where g.id=p_id
$$;
create function public.group_gifts_dispatch(p_operation text,p_actor uuid,p_page_id uuid default null,p_id uuid default null,p_input jsonb default '{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare g public.group_gift_applications;receipt public.group_action_receipts;k uuid;payload jsonb;result jsonb;ids uuid[];lim integer;page uuid;v_status text;used integer;is_admin boolean:=p_admin_id is not null;
begin
 perform public.fan_web_lock_active_user(p_actor);
 if is_admin then perform public.assert_active_admin(p_actor,p_admin_id,p_operation='review');end if;
 if p_operation not in('list','detail','admin-list','admin-detail','submit','revise','review')or(p_operation in('admin-list','admin-detail','review')and not is_admin)then raise exception 'GROUP_GIFT_FORBIDDEN';end if;
 if p_operation in('detail','admin-detail','revise','review')then
  select page_id into page from public.group_gift_applications where id=p_id;
  if page is null or(p_page_id is not null and page<>p_page_id)then raise exception 'GROUP_GIFT_NOT_FOUND';end if;
 else page:=p_page_id;end if;
 -- Serialize manager writes against ownership/role changes, then recheck current authority.
 if p_operation in('submit','revise','review')then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-page:'||page::text,0));end if;
 if not is_admin and not exists(select 1 from public.group_memberships where page_id=page and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUP_GIFT_FORBIDDEN';end if;
 if p_operation='review'and not is_admin then raise exception 'GROUP_GIFT_FORBIDDEN';end if;
 if p_operation in('list','admin-list')then
  lim:=least(100,greatest(1,coalesce((p_input->>'limit')::integer,30)));v_status:=p_input->>'status';
  if v_status is not null and v_status not in('submitted','reviewing','approved','rejected','changes_requested')then raise exception 'GROUP_GIFT_INVALID';end if;
  select array_agg(x.id order by x.id)into ids from(select id from public.group_gift_applications where(is_admin or page_id=page)and(v_status is null or status=v_status)and(p_input->>'cursor'is null or id>(p_input->>'cursor')::uuid)order by id limit lim+1)x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(public.group_gift_json(i)order by i)from unnest(ids[1:lim])i),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]else null end);
 end if;
 if p_operation in('detail','admin-detail')then return jsonb_build_object('application',public.group_gift_json(p_id),'history',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'status',status,'reason',reason,'createdAt',created_at)order by revision desc)from public.group_gift_history where application_id=p_id),'[]'::jsonb));end if;
 if exists(select 1 from public.group_wallet_release where write_fenced)then raise exception 'GROUP_WALLET_WRITE_FENCED';end if;
 k:=(p_input->>'requestId')::uuid;if k is null then raise exception 'GROUP_GIFT_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-request:'||p_actor::text||':'||k::text,0));
 payload:=jsonb_build_object('page',p_page_id,'id',p_id,'inputHash',encode(extensions.digest(p_input::text,'sha256'),'hex'));
 select *into receipt from public.group_action_receipts where actor_id=p_actor and request_id=k;
 if found then if receipt.operation<>'gift:'||p_operation or receipt.payload<>payload then raise exception 'GROUP_GIFT_CONFLICT';end if;return receipt.response;end if;
 if p_operation='submit'then
  if not exists(select 1 from public.group_pages where id=page and status='published')then raise exception 'GROUP_GIFT_NOT_FOUND';end if;
  insert into public.group_gift_applications(page_id,submitted_by,name,image_asset_id,quantity,provider_name,fulfillment_method,fulfillment_description,conditions)values(page,p_actor,btrim(p_input->>'name'),(p_input->>'imageAssetId')::uuid,(p_input->>'quantity')::integer,btrim(p_input->>'providerName'),(p_input->>'fulfillmentMethod')::public.benefit_fulfillment_method,btrim(p_input->>'fulfillmentDescription'),coalesce(p_input->>'conditions',''))returning *into g;
  perform public.group_attach_image(p_actor,'gift_application',g.id,g.image_asset_id);
 else
  select *into g from public.group_gift_applications where id=p_id for update;
  if not found then raise exception 'GROUP_GIFT_NOT_FOUND';end if;
  if(p_input->>'expectedRevision')::integer is distinct from g.revision then raise exception 'GROUP_GIFT_CONFLICT';end if;
  if p_operation='revise'then
   if g.status not in('changes_requested','rejected')then raise exception 'GROUP_GIFT_CONFLICT';end if;
   select coalesce(sum(winner_quantity),0)into used from public.group_raffles where gift_application_id=g.id and cancelled_at is null;
   if(p_input->>'quantity')::integer<used then raise exception 'GROUP_GIFT_STOCK';end if;
   update public.group_gift_applications set name=btrim(p_input->>'name'),image_asset_id=(p_input->>'imageAssetId')::uuid,quantity=(p_input->>'quantity')::integer,provider_name=btrim(p_input->>'providerName'),fulfillment_method=(p_input->>'fulfillmentMethod')::public.benefit_fulfillment_method,fulfillment_description=btrim(p_input->>'fulfillmentDescription'),conditions=coalesce(p_input->>'conditions',''),status='submitted',reason='',reviewed_at=null,revision=revision+1,updated_at=clock_timestamp()where id=g.id returning *into g;
   perform public.group_attach_image(p_actor,'gift_application',g.id,g.image_asset_id);
  else
   v_status:=p_input->>'decision';
   if v_status not in('reviewing','approved','rejected','changes_requested')or v_status=g.status or(v_status='approved'and g.status not in('submitted','reviewing'))or(v_status='reviewing'and g.status<>'submitted')or(v_status in('rejected','changes_requested')and length(btrim(coalesce(p_input->>'reason','')))=0)then raise exception 'GROUP_GIFT_INVALID';end if;
   update public.group_gift_applications set status=v_status,reason=coalesce(p_input->>'reason',''),reviewed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()where id=g.id returning *into g;
  end if;
 end if;
 insert into public.group_gift_history(application_id,revision,actor_id,admin_id,status,reason,snapshot)values(g.id,g.revision,p_actor,p_admin_id,g.status,g.reason,to_jsonb(g));
 result:=jsonb_build_object('id',g.id,'status',g.status,'revision',g.revision);
 insert into public.group_action_receipts(actor_id,request_id,operation,payload,response)values(p_actor,k,'gift:'||p_operation,payload,result);
 return result;
end $$;

-- Preserve all wallet/entry/drawing/refund paths by delegating the existing function unchanged.
do $$begin
 if to_regprocedure('public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)')is not null or not exists(select 1 from pg_proc where oid='public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure and prosecdef and proconfig @> array['search_path=""'])then raise exception 'GROUP_GIFT_RAFFLE_CONTRACT_CHANGED';end if;
end $$;
do $$declare definition text;begin definition:=pg_get_functiondef('public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);execute replace(definition,'FUNCTION public.group_raffle_dispatch(','FUNCTION public.group_raffle_dispatch_before_gifts(');end $$;
create or replace function public.group_raffle_dispatch(p_operation text,p_actor uuid,p_page_id uuid,p_id uuid default null,p_input jsonb default '{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare g public.group_gift_applications;r public.group_action_receipts;k uuid;payload jsonb;result jsonb;new_id uuid;used integer;amount integer;snapshot jsonb;
begin
 if p_operation<>'create'or p_input->>'giftApplicationId'is null then return public.group_raffle_dispatch_before_gifts(p_operation,p_actor,p_page_id,p_id,p_input,p_admin_id);end if;
 if not public.group_wallet_enabled()then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 if p_admin_id is not null then perform public.assert_active_admin(p_actor,p_admin_id,true);end if;
 if not exists(select 1 from public.group_pages where id=p_page_id and status='published')or(p_admin_id is null and not public.group_scope_visible(p_actor,p_page_id))then raise exception 'GROUP_RAFFLE_NOT_FOUND';end if;
 perform public.group_wallet_lock(p_actor);
 if exists(select 1 from public.group_wallet_release where write_fenced)then raise exception 'GROUP_WALLET_WRITE_FENCED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-page:'||p_page_id::text,0));
 if p_admin_id is null and not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUP_RAFFLE_FORBIDDEN';end if;
 k:=(p_input->>'requestId')::uuid;if k is null then raise exception 'GROUP_RAFFLE_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-request:'||p_actor::text||':'||k::text,0));
 payload:=jsonb_build_object('page',p_page_id,'id',p_id,'inputHash',encode(extensions.digest(p_input::text,'sha256'),'hex'));
 select *into r from public.group_action_receipts where actor_id=p_actor and request_id=k;
 if found then if r.operation<>'raffle:create'or r.payload<>payload then raise exception 'GROUP_RAFFLE_CONFLICT';end if;return r.response;end if;
 select *into g from public.group_gift_applications where id=(p_input->>'giftApplicationId')::uuid and page_id=p_page_id for update;
 if not found then raise exception 'GROUP_GIFT_NOT_FOUND';end if;
 if g.status<>'approved'then raise exception 'GROUP_GIFT_CONFLICT';end if;
 select coalesce(sum(winner_quantity),0)into used from public.group_raffles where gift_application_id=g.id and cancelled_at is null;
 amount:=(p_input->>'winnerQuantity')::integer;
 if amount is null or amount<1 or amount>1000 then raise exception 'GROUP_RAFFLE_INVALID';end if;
 if amount>g.quantity-used then raise exception 'GROUP_GIFT_STOCK';end if;
 if not exists(select 1 from public.mobile_media_assets where id=g.image_asset_id and state='ready'and storage_deleted_at is null)then raise exception 'GROUP_GIFT_CONFLICT';end if;
 snapshot:=jsonb_build_object('name',g.name,'imageUrl','/api/groups/images/'||g.image_asset_id::text,'quantity',amount,'providerName',g.provider_name,'fulfillmentMethod',g.fulfillment_method,'fulfillmentDescription',g.fulfillment_description,'conditions',g.conditions,'revision',g.revision);
 insert into public.group_raffles(page_id,title,summary,image_url,winner_quantity,per_user_limit,closes_at,submission_days,fulfillment_method,created_by,gift_application_id,gift_image_asset_id,gift_snapshot)values(p_page_id,g.name,left(g.conditions,1000),snapshot->>'imageUrl',amount,(p_input->>'perUserLimit')::integer,(p_input->>'closesAt')::timestamptz,(p_input->>'submissionDays')::integer,g.fulfillment_method,p_actor,g.id,g.image_asset_id,snapshot)returning id into new_id;
 result:=jsonb_build_object('id',new_id);
 insert into public.group_action_receipts(actor_id,request_id,operation,payload,response)values(p_actor,k,'raffle:create',payload,result);
 return result;
end $$;
-- Add only approved public display values to the scoped raffle read model; preserve its OID.
do $$declare definition text;begin
 if to_regprocedure('public.group_raffle_list_before_gifts(uuid,uuid)')is not null then raise exception 'GROUP_GIFT_RAFFLE_LIST_WRAPPER_EXISTS';end if;
 definition:=pg_get_functiondef('public.group_raffle_list(uuid,uuid)'::regprocedure);execute replace(definition,'FUNCTION public.group_raffle_list(','FUNCTION public.group_raffle_list_before_gifts(');
end $$;
create or replace function public.group_raffle_list(p_page_id uuid,p_actor uuid default null)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('raffles',coalesce(jsonb_agg(item||jsonb_build_object('giftSnapshot',r.gift_snapshot)order by n),'[]'::jsonb))from jsonb_array_elements(public.group_raffle_list_before_gifts(p_page_id,p_actor)->'raffles')with ordinality x(item,n)join public.group_raffles r on r.id=(item->>'id')::uuid
$$;
revoke all on function public.group_raffle_list_before_gifts(uuid,uuid)from public,anon,authenticated,service_role;
revoke all on function public.group_attach_image_before_gifts(uuid,text,uuid,uuid),public.group_attach_image(uuid,text,uuid,uuid),public.authorize_group_image_read_before_gifts(uuid,uuid,text),public.authorize_group_image_read(uuid,uuid,text),public.group_gift_json(uuid),public.group_gifts_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid),public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.group_gift_immutable_snapshot(),public.group_gift_immutable_history()from public,anon,authenticated,service_role;
grant execute on function public.group_gifts_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.authorize_group_image_read(uuid,uuid,text)to service_role;
commit;
