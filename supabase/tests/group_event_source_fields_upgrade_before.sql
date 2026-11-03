\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
create table public._group_event_source_upgrade_fixture(actor uuid,page uuid,event uuid,request uuid,input jsonb,response jsonb,core_oid oid,dispatch_oid oid,projection_oid oid,projection_service_execute boolean);
do $$declare actor uuid:=gen_random_uuid();page uuid:=gen_random_uuid();req uuid:=gen_random_uuid();input jsonb;result jsonb;begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:event-source-upgrade-'||actor,actor||'@example.test');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Legacy cancelled event');insert into public.group_memberships(page_id,app_user_id,role)values(page,actor,'owner');
 input:=jsonb_build_object('requestId',req,'title','Legacy cancelled','description','Original','imageUrl',null,'startsAt',now()+interval'1 day','endsAt',now()+interval'2 day','opensAt',now()-interval'1 day','closesAt',now()+interval'1 hour','location','Original location','capacity',10,'requiresApproval',false,'state','cancelled');
 result:=public.group_activities_dispatch('event-save',actor,page,null,null,input);
 insert into public._group_event_source_upgrade_fixture values(actor,page,(result#>>'{event,id}')::uuid,req,input,result,'public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid,'public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure::oid,'public.group_event_json(uuid,uuid)'::regprocedure::oid,has_function_privilege('service_role','public.group_event_json(uuid,uuid)','execute'));
end $$;
