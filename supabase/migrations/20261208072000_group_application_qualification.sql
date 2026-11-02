begin;
alter table public.group_applications add column qualification jsonb;
alter table public.group_applications add column submission_revision integer not null default 1;
create table public.group_application_evidence (
 id uuid primary key default extensions.gen_random_uuid(),
 application_id uuid not null references public.group_applications(id) on delete cascade,
 submission_revision integer not null,
 asset_id uuid not null unique references public.mobile_media_assets(id),
 created_at timestamptz not null default clock_timestamp()
);
create table public.group_application_qualification_history (
 application_id uuid not null references public.group_applications(id) on delete cascade,
 submission_revision integer not null,
 qualification jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(application_id,submission_revision)
);
alter table public.group_application_evidence enable row level security;
alter table public.group_application_evidence force row level security;
alter table public.group_application_qualification_history enable row level security;
alter table public.group_application_qualification_history force row level security;
revoke all on public.group_application_evidence,public.group_application_qualification_history from public,anon,authenticated,service_role;
do $$declare c record;begin
 select conname,pg_get_constraintdef(oid) definition into strict c from pg_constraint where conrelid='public.group_image_references'::regclass and contype='c' and pg_get_constraintdef(oid) like '%target_type%';
 execute format('alter table public.group_image_references drop constraint %I',c.conname);
 execute format('alter table public.group_image_references add constraint %I check ((%s) or target_type=''application_evidence'')',c.conname,substring(c.definition from 8 for length(c.definition)-8));
end $$;
create function public.group_save_application_qualification(p_actor uuid,p_application uuid,p_qualification jsonb,p_revision integer)returns void language plpgsql security definer set search_path=''as $$
declare item jsonb;asset uuid;a public.mobile_media_assets;e public.group_application_evidence;ids uuid[]:='{}';
begin
 if jsonb_typeof(p_qualification)<>'object' or not(p_qualification ?& array['communityName','evidenceUrl','introduction','assetIds']) or p_qualification-array['communityName','evidenceUrl','introduction','assetIds']<>'{}'::jsonb
 or jsonb_typeof(p_qualification->'communityName')<>'string' or jsonb_typeof(p_qualification->'evidenceUrl')<>'string' or jsonb_typeof(p_qualification->'introduction')<>'string'
 or length(btrim(p_qualification->>'communityName')) not between 1 and 100 or length(btrim(p_qualification->>'introduction')) not between 1 and 2000
 or length(p_qualification->>'evidenceUrl') not between 9 and 2048 or (p_qualification->>'evidenceUrl')!~'^https://[^/@[:space:]]+([/?#]|$)' or (p_qualification->>'evidenceUrl')~'[[:cntrl:]]'
 or jsonb_typeof(p_qualification->'assetIds')<>'array' or jsonb_array_length(p_qualification->'assetIds')>3 then raise exception 'GROUPS_INVALID_REQUEST';end if;
 if not exists(select 1 from public.group_applications where id=p_application and applicant_id=p_actor and status='submitted')then raise exception 'GROUPS_FORBIDDEN';end if;
 for item in select value from jsonb_array_elements(p_qualification->'assetIds')loop
  asset:=(item#>>'{}')::uuid;if asset=any(ids)then raise exception 'GROUPS_INVALID_REQUEST';end if;ids:=array_append(ids,asset);
  select *into a from public.mobile_media_assets where id=asset for update;
  if not found or a.app_user_id<>p_actor or a.kind<>'image' or a.purpose<>'group_image' or a.state<>'ready' or a.storage_deleted_at is not null then raise exception 'GROUPS_INVALID_REQUEST';end if;
  select *into e from public.group_application_evidence where asset_id=asset;
  if found then if e.application_id<>p_application then raise exception 'GROUPS_INVALID_REQUEST';end if;
  else
   if a.attached_id is not null then raise exception 'GROUPS_INVALID_REQUEST';end if;
   insert into public.group_application_evidence(application_id,submission_revision,asset_id)values(p_application,p_revision,asset)returning *into e;
   insert into public.group_image_references values('application_evidence',e.id,asset);
   update public.mobile_media_assets set attached_type='group_image',attached_id=e.id,attached_version=1,access_scope='group_image',position=0,updated_at=clock_timestamp()where id=asset;
  end if;
 end loop;
 update public.group_applications set qualification=p_qualification,submission_revision=p_revision where id=p_application;
 insert into public.group_application_qualification_history(application_id,submission_revision,qualification)values(p_application,p_revision,p_qualification);
end $$;
-- Keep qualification files separate from the cover-image publication trigger.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.authorize_group_image_read(uuid,uuid,text)'::regprocedure);
 if position('FUNCTION public.authorize_group_image_read(' in definition)=0 then raise exception 'GROUP_QUALIFICATION_FUNCTION_SHAPE';end if;
 execute replace(definition,'FUNCTION public.authorize_group_image_read(','FUNCTION public.authorize_group_image_read_before_qualification(');
end $$;
create or replace function public.authorize_group_image_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql security definer set search_path=''as $$
declare evidence public.group_application_evidence;a public.mobile_media_assets;admin uuid;
begin
 select *into evidence from public.group_application_evidence where asset_id=p_asset_id;
 if not found then return public.authorize_group_image_read_before_qualification(p_app_user_id,p_asset_id,p_variant);end if;
 if p_variant not in('original','thumbnail')then raise exception 'MEDIA_INVALID_INPUT';end if;
 if p_app_user_id is null then return null;end if;perform public.fan_web_lock_active_user(p_app_user_id);
 if not exists(select 1 from public.group_applications where id=evidence.application_id and applicant_id=p_app_user_id)then
  select aa.id into admin from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active limit 1;
  if admin is null then return null;end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_app_user_id,admin,'groups.application.evidence.read','group_application',evidence.application_id::text,extensions.gen_random_uuid(),jsonb_build_object('assetId',p_asset_id));
 end if;
 select *into a from public.mobile_media_assets where id=p_asset_id and purpose='group_image'and kind='image'and state='ready'and storage_deleted_at is null;
 if not found then return null;end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);
end $$;
create function public.group_release_application_evidence()returns trigger language plpgsql security definer set search_path=''as $$
begin
 delete from public.group_image_references where target_type='application_evidence'and target_id=old.id;
 update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()where id=old.asset_id;
 return old;
end $$;
create trigger group_release_application_evidence after delete on public.group_application_evidence for each row execute function public.group_release_application_evidence();

do $$declare definition text;begin
 definition:=pg_get_functiondef('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('FUNCTION public.groups_dispatch(' in definition)=0 then raise exception 'GROUP_QUALIFICATION_FUNCTION_SHAPE';end if;
 execute replace(definition,'FUNCTION public.groups_dispatch(','FUNCTION public.groups_dispatch_before_qualification(');
end $$;
create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;app public.group_applications;replay boolean;revision integer:=1;qualification jsonb;input jsonb:=p_input;prior_url text;target uuid;kind text;stored_input jsonb;
begin
 if p_operation not in('apply','revise','settings')then return public.groups_dispatch_before_qualification(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);end if;
 perform public.fan_web_lock_active_user(p_actor);
 select exists(select 1 from public.group_action_receipts where actor_id=p_actor and request_id=(p_input->>'requestId')::uuid)into replay;
 if p_operation='revise'then
  select *into app from public.group_applications where id=p_item_id and applicant_id=p_actor for update;
  if not found then raise exception 'GROUPS_NOT_FOUND';end if;
  if not replay and app.qualification is not null and (p_input->>'expectedRevision')::integer is distinct from app.submission_revision then raise exception 'GROUPS_CONFLICT';end if;
  revision:=app.submission_revision+1;
 end if;
 -- Restore the cover-image adapter lost when the directory dispatcher was replaced.
 kind:=case when p_operation='settings'then'page'else'application'end;
 target:=case when p_operation='settings'then p_page_id else p_item_id end;
 if kind='page'then select image_url into prior_url from public.group_pages where id=target;else select image_url into prior_url from public.group_applications where id=target;end if;
 select payload->'input'into stored_input from public.group_action_receipts where actor_id=p_actor and request_id=(p_input->>'requestId')::uuid;
 if not replay or stored_input?'imageUrl'then
  if input?'imageAssetId'then input:=input||jsonb_build_object('imageUrl',case when input->>'imageAssetId'is not null then '/api/groups/images/'||(input->>'imageAssetId')::uuid::text end);
  elsif input?'imageUrl'then if not replay and input->>'imageUrl'is distinct from prior_url then raise exception 'GROUPS_INVALID_REQUEST';end if;
  elsif replay then input:=input||jsonb_build_object('imageUrl',stored_input->'imageUrl');
  else input:=input||jsonb_build_object('imageUrl',prior_url);end if;
 end if;
 result:=public.groups_dispatch_before_qualification(p_operation,p_actor,p_page_id,p_item_id,input,p_admin_id);
 if not replay and input?'imageAssetId'then
  if p_operation='apply'then target:=(result->>'id')::uuid;end if;
  perform public.group_attach_image(p_actor,kind,target,(input->>'imageAssetId')::uuid);
  if kind='page'then
   update public.group_pages set image_url=input->>'imageUrl'where id=target;
   result:=public.group_page_json(target);
   update public.group_action_receipts set response=result where actor_id=p_actor and request_id=(input->>'requestId')::uuid and operation='settings';
  end if;
 end if;
 qualification:=coalesce(p_input->'qualification',app.qualification);
 if p_operation in('apply','revise')and not replay and qualification is not null then perform public.group_save_application_qualification(p_actor,(result->>'id')::uuid,qualification,revision);end if;
 return result;
end $$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('FUNCTION public.groups_content_dispatch(' in definition)=0 then raise exception 'GROUP_QUALIFICATION_FUNCTION_SHAPE';end if;
 execute replace(definition,'FUNCTION public.groups_content_dispatch(','FUNCTION public.groups_content_dispatch_before_qualification(');
end $$;
create or replace function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;app public.group_applications;replay boolean;
begin
 if p_operation='review'then
  perform public.fan_web_lock_active_user(p_actor);perform public.assert_active_admin(p_actor,p_admin_id,true);
  select exists(select 1 from public.group_action_receipts where actor_id=p_actor and request_id=(p_input->>'requestId')::uuid)into replay;
  select *into app from public.group_applications where id=p_item_id for update;
  if not replay and app.qualification is not null and (p_input->>'expectedRevision')::integer is distinct from app.submission_revision then raise exception 'GROUPS_CONFLICT';end if;
 end if;
 result:=public.groups_content_dispatch_before_qualification(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation in('applications','admin-applications')then
  result:=jsonb_set(result,'{items}',coalesce((select jsonb_agg(item||jsonb_build_object('qualification',a.qualification,'submissionRevision',a.submission_revision)order by ordinal)from jsonb_array_elements(result->'items')with ordinality as entries(item,ordinal)join public.group_applications a on a.id=(item->>'id')::uuid),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function public.group_save_application_qualification(uuid,uuid,jsonb,integer),public.group_release_application_evidence(),public.authorize_group_image_read_before_qualification(uuid,uuid,text),public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid),public.groups_content_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
revoke all on function public.authorize_group_image_read(uuid,uuid,text),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated;
grant execute on function public.authorize_group_image_read(uuid,uuid,text),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;
