\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end$$;
begin;
do $$declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();reviewer uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();images uuid[]:='{}';img uuid;app uuid;page uuid;key uuid:=gen_random_uuid();input jsonb;res jsonb;i integer;count_before integer;begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:qualification-'||actor,actor||'@example.test'),(other,'did:privy:qualification-'||other,other||'@example.test'),(reviewer,'did:privy:qualification-'||reviewer,reviewer||'@example.test');
 insert into public.admin_allowlist(id,email,role)values(admin,reviewer||'@example.test','operator');
 for i in 1..3 loop
  img:=gen_random_uuid();images:=array_append(images,img);
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)values(img,case when i=3 then other else actor end,'image','group_image','image/png',100,100,'private/'||img||'.png','private/'||img||'.webp','ready',20,20,gen_random_uuid(),'fixture');
 end loop;
 input:=jsonb_build_object('kind','hobby','name','Private qualification','description','Introduction','requestId',key,'qualification',jsonb_build_object('communityName','Existing club','evidenceUrl','https://example.test/club','introduction','Operator experience','assetIds',jsonb_build_array(images[1])));
 res:=public.groups_dispatch('apply',actor,null,null,input);app:=(res->>'id')::uuid;
 if public.groups_dispatch('apply',actor,null,null,input)<>res or(select count(*)from public.group_application_evidence where application_id=app)<>1 then raise exception 'qualification replay duplicates';end if;
 if public.authorize_group_image_read(actor,images[1],'original')is null or public.authorize_mobile_media_read(reviewer,images[1],'thumbnail')is null then raise exception 'authorized proof unavailable';end if;
 if public.authorize_group_image_read(null,images[1],'original')is not null or public.authorize_mobile_media_read(other,images[1],'original')is not null then raise exception 'private proof exposed';end if;
 begin perform public.cancel_owned_mobile_media(actor,images[1]);exception when others then null;end;
 if(select state from public.mobile_media_assets where id=images[1])<>'ready'then raise exception 'attached proof canceled';end if;
 perform public.groups_content_dispatch('review',reviewer,null,app,jsonb_build_object('action','request_changes','reason','Add proof','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 input:=jsonb_set(input,'{qualification,assetIds}',jsonb_build_array(images[2]))||jsonb_build_object('requestId',gen_random_uuid(),'expectedRevision',1);
 perform public.groups_dispatch('revise',actor,null,app,input);
 if(select submission_revision from public.group_applications where id=app)<>2 or(select count(*)from public.group_application_qualification_history where application_id=app)<>2 then raise exception 'revision history missing';end if;
 begin perform public.groups_content_dispatch('review',reviewer,null,app,jsonb_build_object('action','approve','expectedRevision',1,'requestId',gen_random_uuid()),admin);raise exception 'stale proof approved';exception when others then if sqlerrm<>'GROUPS_CONFLICT'then raise;end if;end;
 res:=public.groups_content_dispatch('review',reviewer,null,app,jsonb_build_object('action','approve','expectedRevision',2,'requestId',gen_random_uuid()),admin);page:=(res->>'pageId')::uuid;
 if page is null or public.authorize_group_image_read(null,images[2],'original')is not null or public.authorize_group_image_read(actor,images[1],'original')is null or public.authorize_group_image_read(actor,images[2],'original')is null then raise exception 'proof publication or history regression';end if;
 if exists(select 1 from public.group_image_references where asset_id=any(images[1:2])and target_type<>'application_evidence')then raise exception 'proof converted to cover';end if;
 res:=public.groups_content_dispatch('applications',actor,null,null,'{}');
 if res#>>'{items,0,qualification,communityName}'<>'Existing club' or res#>>'{items,0,submissionRevision}'<>'2' then raise exception 'qualification DTO missing';end if;
 select count(*)into count_before from public.group_applications where applicant_id=actor;
 begin perform public.groups_dispatch('apply',actor,null,null,jsonb_set(input-'expectedRevision','{qualification,assetIds}',jsonb_build_array(images[3]))||jsonb_build_object('requestId',gen_random_uuid()));raise exception 'borrowed proof accepted';exception when others then if sqlerrm<>'GROUPS_INVALID_REQUEST'then raise;end if;end;
 if(select count(*)from public.group_applications where applicant_id=actor)<>count_before then raise exception 'failed proof left application';end if;
 if has_table_privilege('service_role','public.group_application_evidence','SELECT')or has_table_privilege('anon','public.group_application_qualification_history','SELECT')then raise exception 'proof table exposed';end if;
end$$;
rollback;
