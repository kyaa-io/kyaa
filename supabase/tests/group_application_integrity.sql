\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end$$;
begin;
do $$declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();reviewer uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();a1 uuid;a2 uuid;a3 uuid;res jsonb;begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:integrity-'||actor,actor||'@example.test'),(other,'did:privy:integrity-'||other,other||'@example.test'),(reviewer,'did:privy:integrity-'||reviewer,reviewer||'@example.test');
 insert into public.admin_allowlist(id,email,role)values(admin,reviewer||'@example.test','operator');
 res:=public.groups_dispatch('apply',actor,null,null,jsonb_build_object('kind','hobby','name','Integrity club','description','Intro','requestId',gen_random_uuid()));a1:=(res->>'id')::uuid;
 begin perform public.groups_dispatch('apply',actor,null,null,jsonb_build_object('kind','hobby','name',' integrity CLUB ','description','Intro','requestId',gen_random_uuid()));raise exception 'duplicate pending accepted';exception when others then if sqlerrm<>'GROUPS_CONFLICT'then raise;end if;end;
 perform public.groups_dispatch('apply',actor,null,null,jsonb_build_object('kind','brand','name','Integrity club','description','Intro','requestId',gen_random_uuid()));
 res:=public.groups_dispatch('apply',other,null,null,jsonb_build_object('kind','hobby','name','Integrity club','description','Intro','requestId',gen_random_uuid()));a2:=(res->>'id')::uuid;
 -- blank reason is refused, and a blank re-request keeps the earlier reason
 begin perform public.groups_content_dispatch('review',reviewer,null,a1,jsonb_build_object('action','reject','expectedRevision',1,'requestId',gen_random_uuid()),admin);raise exception 'blank reject accepted';exception when others then if sqlerrm<>'GROUPS_INVALID_REQUEST'then raise;end if;end;
 perform public.groups_content_dispatch('review',reviewer,null,a1,jsonb_build_object('action','request_changes','reason','Add detail','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 begin perform public.groups_content_dispatch('review',reviewer,null,a1,jsonb_build_object('action','request_changes','expectedRevision',1,'requestId',gen_random_uuid()),admin);raise exception 'blank re-request accepted';exception when others then if sqlerrm<>'GROUPS_INVALID_REQUEST'then raise;end if;end;
 if(select reason from public.group_applications where id=a1)<>'Add detail'then raise exception 'earlier reason erased';end if;
 -- resubmitting the same row with the same name is allowed
 perform public.groups_dispatch('revise',actor,null,a1,jsonb_build_object('kind','hobby','name','Integrity club','description','Edited','requestId',gen_random_uuid()));
 if(select status from public.group_applications where id=a1)<>'submitted'then raise exception 'own resubmit blocked';end if;
 -- resubmission cannot take a name another pending application holds
 res:=public.groups_dispatch('apply',actor,null,null,jsonb_build_object('kind','hobby','name','Second','description','Intro','requestId',gen_random_uuid()));a3:=(res->>'id')::uuid;
 perform public.groups_content_dispatch('review',reviewer,null,a3,jsonb_build_object('action','request_changes','reason','Add detail','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 begin perform public.groups_dispatch('revise',actor,null,a3,jsonb_build_object('kind','hobby','name','integrity club','description','Intro','requestId',gen_random_uuid()));raise exception 'resubmit bypass accepted';exception when others then if sqlerrm<>'GROUPS_CONFLICT'then raise;end if;end;
 -- reject, then re-application and approval still work; same-name public pages stay allowed
 perform public.groups_content_dispatch('review',reviewer,null,a1,jsonb_build_object('action','reject','reason','Not now','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 res:=public.groups_dispatch('apply',actor,null,null,jsonb_build_object('kind','hobby','name','Integrity club','description','Intro','requestId',gen_random_uuid()));
 perform public.groups_content_dispatch('review',reviewer,null,(res->>'id')::uuid,jsonb_build_object('action','approve','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 perform public.groups_content_dispatch('review',reviewer,null,a2,jsonb_build_object('action','approve','expectedRevision',1,'requestId',gen_random_uuid()),admin);
 if(select count(*)from public.group_pages where kind='hobby' and lower(name)='integrity club')<>2 then raise exception 'same-name pages blocked';end if;
end$$;
rollback;
