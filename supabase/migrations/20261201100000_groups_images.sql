begin;
-- A single validated image has one durable target. Approval moves its reference
-- from the private application to the published page without copying storage.
create table public.group_image_references(
 target_type text not null check(target_type in('application','page','event','collection','mission')),
 target_id uuid not null,asset_id uuid not null unique references public.mobile_media_assets(id),
 primary key(target_type,target_id)
);
alter table public.group_image_references enable row level security;
alter table public.group_image_references force row level security;
revoke all on public.group_image_references from public,anon,authenticated,service_role;
do $$declare item text;definition text;f record;next_body text;begin
 foreach item in array array['purpose','attached_type','access_scope']loop
  select pg_get_constraintdef(oid)into definition from pg_constraint where conrelid='public.mobile_media_assets'::regclass and conname='mobile_media_assets_'||item||'_check';
  if definition is null then raise exception 'MEDIA_CONSTRAINT_MISSING';end if;
  execute format('alter table public.mobile_media_assets drop constraint %I','mobile_media_assets_'||item||'_check');
  execute format('alter table public.mobile_media_assets add constraint %I CHECK ((%s) OR %I = ''group_image'')','mobile_media_assets_'||item||'_check',substring(definition from 8 for length(definition)-8),item);
 end loop;
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'::regprocedure;
 next_body:=replace(replace(f.prosrc,'''wave_post'',''group_post''','''wave_post'',''group_post'',''group_image'''),'''fan_post'',''certification'',''support''','''fan_post'',''certification'',''support'',''group_image''');
 if next_body=f.prosrc then raise exception 'GROUP_IMAGE_MEDIA_PIPELINE_CHANGED';end if;
 execute replace(pg_get_functiondef(f.oid),f.prosrc,next_body);
end $$;

create function public.group_attach_image(p_actor uuid,p_type text,p_target uuid,p_asset uuid)returns void language plpgsql security definer set search_path=''as $$
declare old_asset uuid;a public.mobile_media_assets;page uuid;
begin
 perform public.fan_web_lock_active_user(p_actor);
 if p_type='application'then
  if not exists(select 1 from public.group_applications where id=p_target and applicant_id=p_actor and status in('submitted','changes_requested','reviewing'))then raise exception 'GROUPS_FORBIDDEN';end if;
 else
  page:=case p_type when'page'then p_target when'event'then(select page_id from public.group_events where id=p_target)when'collection'then(select page_id from public.group_collections where id=p_target)when'mission'then(select page_id from public.group_missions where id=p_target)end;
  if not exists(select 1 from public.group_memberships where page_id=page and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUPS_FORBIDDEN';end if;
 end if;
 select asset_id into old_asset from public.group_image_references where target_type=p_type and target_id=p_target for update;
 if p_asset is not null then
  select *into a from public.mobile_media_assets where id=p_asset for update;
  if not found or a.kind<>'image'or a.purpose<>'group_image'or a.state<>'ready'or a.storage_deleted_at is not null or not(a.app_user_id=p_actor or old_asset=a.id)or(a.attached_id is not null and old_asset is distinct from a.id)then raise exception 'GROUPS_INVALID_REQUEST';end if;
 end if;
 if old_asset is not null and old_asset is distinct from p_asset then
  delete from public.group_image_references where target_type=p_type and target_id=p_target;
  update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes'),updated_at=now()where id=old_asset;
 end if;
 if p_asset is not null then
  insert into public.group_image_references values(p_type,p_target,p_asset)on conflict(target_type,target_id)do update set asset_id=excluded.asset_id;
  update public.mobile_media_assets set attached_type='group_image',attached_id=p_target,attached_version=1,access_scope='group_image',position=0,updated_at=now()where id=p_asset;
 end if;
end $$;

create function public.group_release_deleted_image()returns trigger language plpgsql security definer set search_path=''as $$
declare image uuid;kind text;
begin
 kind:=case tg_table_name when'group_applications'then'application'when'group_pages'then'page'when'group_events'then'event'when'group_collections'then'collection'else'mission'end;
 delete from public.group_image_references where target_type=kind and target_id=old.id returning asset_id into image;
 if image is not null then update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes'),updated_at=now()where id=image;end if;
 return old;
end $$;
do $$declare t text;begin foreach t in array array['group_applications','group_pages','group_events','group_collections','group_missions']loop execute format('create trigger group_release_deleted_image after delete on public.%I for each row execute function public.group_release_deleted_image()',t);end loop;end $$;

create function public.group_publish_application_image()returns trigger language plpgsql security definer set search_path=''as $$
declare image uuid;prior uuid;
begin
 if new.status='approved'and old.status is distinct from 'approved'and new.page_id is not null then
  select asset_id into image from public.group_image_references where target_type='application'and target_id=new.id for update;
  if image is not null then
   select asset_id into prior from public.group_image_references where target_type='page'and target_id=new.page_id for update;
   if prior is not null then delete from public.group_image_references where target_type='page'and target_id=new.page_id;update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes')where id=prior;end if;
   update public.group_image_references set target_type='page',target_id=new.page_id where target_type='application'and target_id=new.id;
   update public.mobile_media_assets set attached_id=new.page_id where id=image;
   update public.group_pages set image_url='/api/groups/images/'||image::text where id=new.page_id;
  end if;
 end if;
 return new;
end $$;
create trigger group_publish_application_image after update on public.group_applications for each row execute function public.group_publish_application_image();

alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)rename to groups_dispatch_before_group_images;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;input jsonb:=p_input;prior_url text;target uuid;kind text;replay boolean:=false;
begin
 if p_operation in('apply','revise','settings')then
  kind:=case when p_operation='settings'then'page'else'application'end;
  target:=case when p_operation='settings'then p_page_id else p_item_id end;
  select exists(select 1 from public.group_action_receipts where actor_id=p_actor and request_id=(input->>'requestId')::uuid and operation=p_operation)into replay;
  if kind='page'then select image_url into prior_url from public.group_pages where id=target;else select image_url into prior_url from public.group_applications where id=target;end if;
  if input?'imageAssetId'then input:=input||jsonb_build_object('imageUrl',case when input->>'imageAssetId'is not null then '/api/groups/images/'||(input->>'imageAssetId')::uuid::text end);
  elsif input?'imageUrl'then if not replay and input->>'imageUrl'is distinct from prior_url then raise exception 'GROUPS_INVALID_REQUEST';end if;
  elsif replay then input:=input||jsonb_build_object('imageUrl',(select payload#>'{input,imageUrl}'from public.group_action_receipts where actor_id=p_actor and request_id=(input->>'requestId')::uuid));
  else input:=input||jsonb_build_object('imageUrl',prior_url);end if;
 end if;
 result:=public.groups_dispatch_before_group_images(p_operation,p_actor,p_page_id,p_item_id,input,p_admin_id);
 if p_operation in('apply','revise','settings')and input?'imageAssetId'and not replay then
  if p_operation='apply'then target:=(result->>'id')::uuid;end if;
  perform public.group_attach_image(p_actor,kind,target,(input->>'imageAssetId')::uuid);
  if kind='page'then update public.group_pages set image_url=input->>'imageUrl'where id=target;result:=public.group_page_json(target);update public.group_action_receipts set response=result where actor_id=p_actor and request_id=(input->>'requestId')::uuid and operation='settings';end if;
 end if;
 return result;
end $$;

alter function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)rename to group_activities_dispatch_before_group_images;
create function public.group_activities_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_sub_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;input jsonb:=p_input;prior_url text;kind text;target uuid:=p_item_id;replay boolean:=false;
begin
 if p_operation in('event-save','collection-save','mission-save')then
  if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor and role in('owner','manager'))then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  select exists(select 1 from public.group_activity_receipts where actor_id=p_actor and request_id=(input->>'requestId')::uuid and operation=p_operation)into replay;
  kind:=case p_operation when'event-save'then'event'when'collection-save'then'collection'else'mission'end;
  if kind='event'then select image_url into prior_url from public.group_events where id=target and page_id=p_page_id;elsif kind='collection'then select image_url into prior_url from public.group_collections where id=target and page_id=p_page_id;else select image_url into prior_url from public.group_missions where id=target and page_id=p_page_id;end if;
  if input?'imageAssetId'then input:=input||jsonb_build_object('imageUrl',case when input->>'imageAssetId'is not null then '/api/groups/images/'||(input->>'imageAssetId')::uuid::text end);
  elsif input?'imageUrl'then if not replay and input->>'imageUrl'is distinct from prior_url then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  elsif replay then input:=input||jsonb_build_object('imageUrl',(select payload#>'{input,imageUrl}'from public.group_activity_receipts where actor_id=p_actor and request_id=(input->>'requestId')::uuid));
  else input:=input||jsonb_build_object('imageUrl',prior_url);end if;
 end if;
 result:=public.group_activities_dispatch_before_group_images(p_operation,p_actor,p_page_id,p_item_id,p_sub_id,input,p_admin_id);
 if p_operation in('event-save','collection-save','mission-save')and input?'imageAssetId'and not replay then
  target:=coalesce(target,(result->>'id')::uuid,(result#>>'{event,id}')::uuid,(result#>>'{mission,id}')::uuid);
  perform public.group_attach_image(p_actor,kind,target,(input->>'imageAssetId')::uuid);
 end if;
 return result;
end $$;

create function public.authorize_group_image_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.mobile_media_assets;ref public.group_image_references;page uuid;private boolean:=false;allowed boolean:=false;admin uuid;
begin
 if p_variant not in('original','thumbnail')then raise exception 'MEDIA_INVALID_INPUT';end if;
 if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id);end if;
 select *into a from public.mobile_media_assets where id=p_asset_id and purpose='group_image'and kind='image'and state='ready'and storage_deleted_at is null;
 if not found then return null;end if;
 select *into ref from public.group_image_references where asset_id=a.id;
 if not found then allowed:=a.attached_id is null and a.app_user_id=p_app_user_id;
 elsif ref.target_type='application'then
  allowed:=exists(select 1 from public.group_applications where id=ref.target_id and applicant_id=p_app_user_id);
  if not allowed and p_app_user_id is not null then
   select aa.id into admin from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active limit 1;allowed:=admin is not null;
   if allowed then insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_app_user_id,admin,'groups.application.image.read','group_application',ref.target_id::text,extensions.gen_random_uuid(),jsonb_build_object('assetId',a.id));end if;
  end if;
 else
  if ref.target_type='page'then page:=ref.target_id;
  elsif ref.target_type='event'then select page_id,state='draft'into page,private from public.group_events where id=ref.target_id;
  elsif ref.target_type='collection'then select page_id,status='hidden'into page,private from public.group_collections where id=ref.target_id;
  else select page_id,state='draft'into page,private from public.group_missions where id=ref.target_id;end if;
  allowed:=public.group_scope_visible(p_app_user_id,page)and(not private or exists(select 1 from public.group_memberships where page_id=page and app_user_id=p_app_user_id and role in('owner','manager')));
 end if;
 if not coalesce(allowed,false)then return null;end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);
end $$;
-- Generic authenticated asset reads must respect attachment ACL after ownership
-- changes too; ownership alone only permits an unattached upload preview.
alter function public.authorize_mobile_media_read(uuid,uuid,text)rename to authorize_mobile_media_read_before_group_images;
create function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql security definer set search_path=''as $$begin
 if exists(select 1 from public.mobile_media_assets where id=p_asset_id and purpose='group_image')then return public.authorize_group_image_read(p_app_user_id,p_asset_id,p_variant);end if;
 return public.authorize_mobile_media_read_before_group_images(p_app_user_id,p_asset_id,p_variant);
end $$;
revoke all on function public.group_attach_image(uuid,text,uuid,uuid),public.group_publish_application_image(),public.group_release_deleted_image(),public.groups_dispatch_before_group_images(text,uuid,uuid,uuid,jsonb,uuid),public.group_activities_dispatch_before_group_images(text,uuid,uuid,uuid,uuid,jsonb,uuid),public.authorize_mobile_media_read_before_group_images(uuid,uuid,text),public.authorize_group_image_read(uuid,uuid,text),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid),public.authorize_mobile_media_read(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.authorize_group_image_read(uuid,uuid,text),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid),public.authorize_mobile_media_read(uuid,uuid,text)to service_role;
commit;
