\set ON_ERROR_STOP on
begin;
do $$
declare owner_id uuid:=gen_random_uuid();next_owner uuid:=gen_random_uuid();admin_actor uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();images uuid[]:='{}';img uuid;app uuid;page uuid;event uuid;collection uuid;mission uuid;request uuid:=gen_random_uuid();r jsonb;i integer;input jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(owner_id,'did:privy:group-image-'||owner_id,owner_id||'@example.test'),(next_owner,'did:privy:group-image-'||next_owner,next_owner||'@example.test'),(admin_actor,'did:privy:group-image-'||admin_actor,admin_actor||'@example.test');
 insert into public.admin_allowlist(id,email,role)values(admin,admin_actor||'@example.test','operator');
 begin perform public.reserve_owned_mobile_media(owner_id,'video','group_image','video/mp4',100,gen_random_uuid());raise exception 'group video image accepted';exception when others then if sqlerrm<>'MEDIA_INVALID_INPUT'then raise;end if;end;
 for i in 1..5 loop
  img:=gen_random_uuid();images:=array_append(images,img);
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)values(img,owner_id,'image','group_image','image/png',100,100,'private/'||img||'.png','private/'||img||'.webp','ready',20,20,gen_random_uuid(),'fixture');
 end loop;
 if public.authorize_group_image_read(null,images[1],'original')is not null or public.authorize_group_image_read(owner_id,images[1],'thumbnail')is null then raise exception 'unattached preview ACL wrong';end if;
 input:=jsonb_build_object('kind','hobby','name','Photo application','description','Description','imageAssetId',images[1],'requestId',request);
 app:=(public.groups_dispatch('apply',owner_id,null,null,input)->>'id')::uuid;
 if public.authorize_group_image_read(null,images[1],'original')is not null or public.authorize_group_image_read(next_owner,images[1],'original')is not null then raise exception 'application image public';end if;
 if public.authorize_mobile_media_read(admin_actor,images[1],'original')is null then raise exception 'admin application preview failed';end if;
 begin perform public.cancel_owned_mobile_media(owner_id,images[1]);exception when others then null;end;
 if(select state from public.mobile_media_assets where id=images[1])<>'ready'then raise exception 'UI cleanup canceled attached application image';end if;
 page:=(public.groups_content_dispatch('review',admin_actor,null,app,jsonb_build_object('action','approve','requestId',gen_random_uuid()),admin)->>'pageId')::uuid;
 if public.authorize_group_image_read(null,images[1],'original')is null or(select target_type from public.group_image_references where asset_id=images[1])<>'page'then raise exception 'approval image publication failed';end if;
 if public.groups_dispatch('apply',owner_id,null,null,input)->>'id'<>app::text then raise exception 'application replay changed after approval';end if;
 perform public.groups_dispatch('settings',owner_id,page,null,jsonb_build_object('name','Photo page','description','Description','question',null,'anonymous',false,'imageAssetId',images[2],'requestId',gen_random_uuid()));
 if(select state from public.mobile_media_assets where id=images[1])<>'cancelled'or public.authorize_group_image_read(null,images[1],'original')is not null then raise exception 'replaced image still exposed';end if;
 begin perform public.groups_dispatch('settings',owner_id,page,null,jsonb_build_object('name','Forged','description','Description','question',null,'anonymous',false,'imageUrl','https://evil.test/forged.png','requestId',gen_random_uuid()));raise exception 'forged image URL trusted';exception when others then if sqlerrm<>'GROUPS_INVALID_REQUEST'then raise;end if;end;
 insert into public.group_memberships(page_id,app_user_id,role)values(page,next_owner,'manager');
 input:=jsonb_build_object('title','Draft event','description','Description','imageAssetId',images[3],'startsAt',now()+interval '2 days','endsAt',now()+interval '3 days','opensAt',now()-interval '1 day','closesAt',now()+interval '1 day','location','Seoul','capacity',null,'requiresApproval',false,'state','draft','requestId',gen_random_uuid());
 r:=public.group_activities_dispatch('event-save',owner_id,page,null,null,input);event:=(r#>>'{event,id}')::uuid;
 if event is null then event:=(r->>'id')::uuid;end if;
 collection:=(public.group_activities_dispatch('collection-save',owner_id,page,null,null,jsonb_build_object('title','Hidden collection','imageAssetId',images[4],'externalUrl','https://example.test/shop','status','hidden','requestId',gen_random_uuid()))->>'id')::uuid;
 r:=public.group_activities_dispatch('mission-save',owner_id,page,null,null,jsonb_build_object('title','Draft mission','instructions','Instructions','imageAssetId',images[5],'state','draft','requestId',gen_random_uuid()));mission:=(r#>>'{mission,id}')::uuid;
 if public.authorize_group_image_read(null,images[3],'original')is not null or public.authorize_group_image_read(next_owner,images[3],'original')is null or public.authorize_group_image_read(null,images[4],'original')is not null or public.authorize_group_image_read(null,images[5],'original')is not null then raise exception 'draft image ACL wrong';end if;
 perform public.groups_dispatch('transfer',owner_id,page,null,jsonb_build_object('appUserId',next_owner,'requestId',gen_random_uuid()));perform public.groups_dispatch('leave',owner_id,page);
 if public.authorize_group_image_read(owner_id,images[3],'original')is not null or public.authorize_mobile_media_read(owner_id,images[4],'original')is not null or public.authorize_group_image_read(owner_id,images[5],'original')is not null then raise exception 'former uploader retained draft authority';end if;
 input:=(input-'imageAssetId')||jsonb_build_object('state','published','expectedRevision',1,'requestId',gen_random_uuid());
 perform public.group_activities_dispatch('event-save',next_owner,page,event,null,input);
 if public.authorize_group_image_read(null,images[3],'original')is null or(select image_url from public.group_events where id=event)<>'/api/groups/images/'||images[3]::text then raise exception 'publish or omitted image preservation failed';end if;
 delete from public.group_missions where id=mission;
 if(select state from public.mobile_media_assets where id=images[5])<>'cancelled'or exists(select 1 from public.group_image_references where asset_id=images[5])then raise exception 'deleted target left orphan image';end if;
 perform public.groups_dispatch('settings',next_owner,page,null,jsonb_build_object('name','Photo page','description','Description','question',null,'anonymous',false,'imageAssetId',null,'requestId',gen_random_uuid()));
 if(select image_url from public.group_pages where id=page)is not null or(select state from public.mobile_media_assets where id=images[2])<>'cancelled'then raise exception 'explicit image removal failed';end if;
end $$;
rollback;
