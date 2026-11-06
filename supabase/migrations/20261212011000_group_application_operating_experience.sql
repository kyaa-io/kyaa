-- [12] The operator check asks one question: did the applicant already run a page. "yes" brings a link and at least one
-- screenshot in the existing evidence fields, "no" brings nothing. The community name is gone from new answers.
-- Stored answers and web clients still open during a release keep the earlier shape, so both shapes are accepted.
-- Apply this before the web that sends the new shape. It changes no stored row.
begin;
set local lock_timeout='5s';
create or replace function public.group_save_application_qualification(p_actor uuid,p_application uuid,p_qualification jsonb,p_revision integer)returns void language plpgsql security definer set search_path=''as $$
declare item jsonb;asset uuid;a public.mobile_media_assets;e public.group_application_evidence;ids uuid[]:='{}';
begin
 if jsonb_typeof(p_qualification)<>'object' then raise exception 'GROUPS_INVALID_REQUEST';end if;
 if p_qualification?'hasExistingPage' then
  if jsonb_typeof(p_qualification->'hasExistingPage')<>'boolean' then raise exception 'GROUPS_INVALID_REQUEST';end if;
  if (p_qualification->>'hasExistingPage')::boolean then
   if not(p_qualification?&array['evidenceUrl','assetIds']) or p_qualification-array['hasExistingPage','evidenceUrl','assetIds']<>'{}'::jsonb
   or jsonb_typeof(p_qualification->'evidenceUrl')<>'string' or jsonb_typeof(p_qualification->'assetIds')<>'array'
   or jsonb_array_length(p_qualification->'assetIds') not between 1 and 3 then raise exception 'GROUPS_INVALID_REQUEST';end if;
  elsif p_qualification<>jsonb_build_object('hasExistingPage',false) then raise exception 'GROUPS_INVALID_REQUEST';end if;
 elsif not(p_qualification?&array['communityName','evidenceUrl','introduction','assetIds']) or p_qualification-array['communityName','evidenceUrl','introduction','assetIds']<>'{}'::jsonb
  or jsonb_typeof(p_qualification->'communityName')<>'string' or jsonb_typeof(p_qualification->'evidenceUrl')<>'string' or jsonb_typeof(p_qualification->'introduction')<>'string'
  or length(btrim(p_qualification->>'communityName')) not between 1 and 100 or length(btrim(p_qualification->>'introduction')) not between 1 and 2000
  or jsonb_typeof(p_qualification->'assetIds')<>'array' or jsonb_array_length(p_qualification->'assetIds')>3 then raise exception 'GROUPS_INVALID_REQUEST';
 end if;
 if p_qualification?'evidenceUrl' and(length(p_qualification->>'evidenceUrl') not between 9 and 2048 or (p_qualification->>'evidenceUrl')!~'^https://[^/@[:space:]]+([/?#]|$)' or (p_qualification->>'evidenceUrl')~'[[:cntrl:]]')then raise exception 'GROUPS_INVALID_REQUEST';end if;
 if not exists(select 1 from public.group_applications where id=p_application and applicant_id=p_actor and status='submitted')then raise exception 'GROUPS_FORBIDDEN';end if;
 for item in select value from jsonb_array_elements(coalesce(p_qualification->'assetIds','[]'::jsonb))loop
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
revoke all on function public.group_save_application_qualification(uuid,uuid,jsonb,integer)from public,anon,authenticated,service_role;
commit;
