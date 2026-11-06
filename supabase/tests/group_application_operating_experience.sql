\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end$$;
begin;
do $$
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();reviewer uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();img1 uuid:=gen_random_uuid();img2 uuid:=gen_random_uuid();foreign_img uuid:=gen_random_uuid();app uuid;res jsonb;bad jsonb;i integer:=0;
 base jsonb:=jsonb_build_object('kind','fan','description','Introduction');
 before_count integer;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:experience-'||actor,actor||'@example.test'),(other,'did:privy:experience-'||other,other||'@example.test'),(reviewer,'did:privy:experience-'||reviewer,reviewer||'@example.test');
 insert into public.admin_allowlist(id,email,role)values(admin,reviewer||'@example.test','operator');
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)
 select v.id,v.owner,'image','group_image','image/png',100,100,'private/'||v.id||'.png','private/'||v.id||'.webp','ready',20,20,gen_random_uuid(),'fixture' from(values(img1,actor),(img2,actor),(foreign_img,other))v(id,owner);

 -- A yes answer keeps its link and screenshots private to the applicant and reviewers.
 res:=public.groups_dispatch('apply',actor,null,null,base||jsonb_build_object('name','Yes page','requestId',gen_random_uuid(),'qualification',jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://cafe.example.test/club','assetIds',jsonb_build_array(img1))));
 app:=(res->>'id')::uuid;
 if(select qualification->>'evidenceUrl' from public.group_applications where id=app)<>'https://cafe.example.test/club' or(select count(*)from public.group_application_evidence where application_id=app)<>1 then raise exception 'yes answer not stored';end if;
 if public.authorize_group_image_read(actor,img1,'original')is null or public.authorize_mobile_media_read(reviewer,img1,'thumbnail')is null then raise exception 'reviewer cannot read screenshot';end if;
 if public.authorize_group_image_read(null,img1,'original')is not null or public.authorize_mobile_media_read(other,img1,'original')is not null then raise exception 'screenshot exposed';end if;
 res:=public.groups_content_dispatch('admin-applications',reviewer,null,null,'{}',admin);
 if not exists(select 1 from jsonb_array_elements(res->'items')x where x->>'id'=app::text and x#>>'{qualification,hasExistingPage}'='true')then raise exception 'reviewer list misses the answer';end if;

 -- A no answer stores only that answer.
 res:=public.groups_dispatch('apply',actor,null,null,base||jsonb_build_object('name','No page','requestId',gen_random_uuid(),'qualification',jsonb_build_object('hasExistingPage',false)));
 if(select qualification from public.group_applications where id=(res->>'id')::uuid)<>'{"hasExistingPage":false}'::jsonb then raise exception 'no answer not stored';end if;

 -- The earlier shape still saves, for web clients open during a release.
 res:=public.groups_dispatch('apply',actor,null,null,base||jsonb_build_object('name','Earlier page','requestId',gen_random_uuid(),'qualification',jsonb_build_object('communityName','Club','evidenceUrl','https://example.test/club','introduction','Experience','assetIds','[]'::jsonb)));
 if(select qualification->>'communityName' from public.group_applications where id=(res->>'id')::uuid)<>'Club' then raise exception 'earlier shape refused';end if;

 -- Nothing else saves, and a refused answer leaves no application behind.
 select count(*)into before_count from public.group_applications where applicant_id=actor;
 for bad in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('hasExistingPage',true),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://example.test','assetIds','[]'::jsonb),
  jsonb_build_object('hasExistingPage',true,'assetIds',jsonb_build_array(img2)),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','http://example.test','assetIds',jsonb_build_array(img2)),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://user@example.test','assetIds',jsonb_build_array(img2)),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://example.test','assetIds',jsonb_build_array(img2,img2)),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://example.test','assetIds',jsonb_build_array(foreign_img)),
  jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://example.test','assetIds',jsonb_build_array(img2),'communityName','Club'),
  jsonb_build_object('hasExistingPage',false,'evidenceUrl','https://example.test'),
  jsonb_build_object('hasExistingPage',false,'assetIds',jsonb_build_array(img2)),
  jsonb_build_object('hasExistingPage','yes'),
  jsonb_build_object('communityName','Club')
 ))loop
  i:=i+1;
  begin
   perform public.groups_dispatch('apply',actor,null,null,base||jsonb_build_object('name','Refused '||i,'requestId',gen_random_uuid(),'qualification',bad));
   raise exception 'accepted: %',bad;
  exception when others then if sqlerrm<>'GROUPS_INVALID_REQUEST' then raise;end if;end;
 end loop;
 if(select count(*)from public.group_applications where applicant_id=actor)<>before_count then raise exception 'refused answer left an application';end if;

 -- The status read returns the applicant's own rows only, with no reviewer identity.
 perform public.groups_content_dispatch('review',reviewer,null,app,jsonb_build_object('action','request_changes','reason','Add proof','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 res:=public.group_application_status(actor,app,1);
 if jsonb_array_length(res->'items')<>1 or res#>>'{items,0,status}'<>'changes_requested' or res#>>'{items,0,reason}'<>'Add proof' or res#>'{items,0}'?'reviewed_by' or res#>'{items,0}'?'applicant_id' or res#>'{items,0}'?'qualification' then raise exception 'status row wrong: %',res;end if;
 if jsonb_array_length(public.group_application_status(other,app,1)->'items')<>0 then raise exception 'status readable by another member';end if;
 if jsonb_array_length(public.group_application_status(null,null,50)->'items')<>0 then raise exception 'status readable without an actor';end if;
 if jsonb_array_length(public.group_application_status(actor,null,2)->'items')<>2 or jsonb_array_length(public.group_application_status(actor,null,5000)->'items')<>3 then raise exception 'status limit wrong';end if;
 perform public.groups_dispatch('revise',actor,null,app,base||jsonb_build_object('name','Yes page','requestId',gen_random_uuid(),'expectedRevision',1,'qualification',jsonb_build_object('hasExistingPage',true,'evidenceUrl','https://cafe.example.test/club','assetIds',jsonb_build_array(img1,img2))));
 res:=public.group_application_status(actor,app,1);
 if res#>>'{items,0,status}'<>'submitted' or res#>>'{items,0,reason}' is not null or res#>>'{items,0,submissionRevision}'<>'2' then raise exception 'resubmission still shows the old note: %',res;end if;
end$$;
do $$begin
 if has_function_privilege('anon','public.group_application_status(uuid,uuid,integer)','EXECUTE')or has_function_privilege('authenticated','public.group_application_status(uuid,uuid,integer)','EXECUTE')then raise exception 'status read exposed to client roles';end if;
 if not has_function_privilege('service_role','public.group_application_status(uuid,uuid,integer)','EXECUTE')then raise exception 'service role cannot read status';end if;
end$$;
rollback;
