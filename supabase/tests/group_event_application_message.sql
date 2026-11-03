\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
create function pg_temp.application_assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',message;end if;raise notice 'PASS %',message;end $$;
create function pg_temp.application_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected %',expected;end $$;
do $$declare owner uuid:=gen_random_uuid();member uuid:=gen_random_uuid();other uuid:=gen_random_uuid();page uuid:=gen_random_uuid();event uuid:=gen_random_uuid();legacy_event uuid:=gen_random_uuid();key uuid:=gen_random_uuid();input jsonb;receipt jsonb;reg uuid;result jsonb;note text:=E'  직접 쓴 원문\n주최자에게 전하는 말  ';begin
 insert into public.app_users(id,privy_user_id,verified_email)select x,'event-note-'||x,x||'@example.test'from unnest(array[owner,member,other])x;
 insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(member,'메모회원','메모회원');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Application note fixture');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner,'owner'),(page,member,'member'),(page,other,'member');
 insert into public.group_events(id,page_id,title,description,starts_at,ends_at,opens_at,closes_at,location,state,requires_approval,capacity,created_by)select x,page,'Open event','Original description',clock_timestamp()+interval'2 days',clock_timestamp()+interval'3 days',clock_timestamp()-interval'1 day',clock_timestamp()+interval'1 day','Seoul','published',true,10,owner from unnest(array[event,legacy_event])x;
 result:=public.group_activities_dispatch('event',member,page,event);
 perform pg_temp.application_assert(result#>>'{participation,participantName}'='메모회원','confirmation participant is the current authenticated profile nickname');
 perform pg_temp.application_assert(public.group_activities_dispatch('event',null,page,event)#>>'{participation,participantName}'is null,'guest event read contains no member nickname');
 input:=jsonb_build_object('requestId',key,'applicationMessage',note);
 receipt:=public.group_activities_dispatch('event-apply',member,page,event,null,input);
 select id into reg from public.group_event_registrations where event_id=event and app_user_id=member;
 perform pg_temp.application_assert(receipt=public.group_activities_dispatch('event-apply',member,page,event,null,input)and(select application_message=note and status='pending'from public.group_event_registrations where id=reg),'application note and receipt persist atomically with exact retry');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-apply'',%L,%L,%L,null,%L)',member,page,event,input||jsonb_build_object('applicationMessage','Changed')),'CONFLICT');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-apply'',%L,%L,%L,null,%L)',member,page,event,input||jsonb_build_object('requestId',gen_random_uuid(),'applicationMessage','Changed after response loss')),'CONFLICT');
 perform pg_temp.application_assert(public.group_activities_dispatch('event-apply',member,page,event,null,jsonb_build_object('requestId',gen_random_uuid()))=receipt and(select application_message=note from public.group_event_registrations where id=reg),'legacy omission on an already-active application never erases its organizer note');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-apply'',%L,%L,%L,null,%L)',other,page,event,jsonb_build_object('requestId',gen_random_uuid(),'applicationMessage',repeat('x',1001))),'INVALID');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-apply'',%L,%L,%L,null,%L)',other,page,event,jsonb_build_object('requestId',gen_random_uuid(),'applicationMessage',jsonb_build_object('bad',true))),'INVALID');
 result:=public.group_activities_dispatch('event-participants',owner,page,event);
 perform pg_temp.application_assert((select item->>'applicationMessage'=note from jsonb_array_elements(result->'items')item where item->>'id'=reg::text),'only authorized participant list returns the original organizer note');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-participants'',%L,%L,%L)',other,page,event),'FORBIDDEN');
 perform pg_temp.application_error(format('select public.group_activities_dispatch(''event-participants'',null,%L,%L)',page,event),'FORBIDDEN');
 perform pg_temp.application_assert(not jsonb_path_exists(public.group_activities_dispatch('event',other,page,event),'$.**.applicationMessage'),'public event detail never exposes another participant note');
 -- Legacy omission remains omission in the request fingerprint and exact response.
 input:=jsonb_build_object('requestId',gen_random_uuid());receipt:=public.group_activities_dispatch('event-apply',member,page,legacy_event,null,input);
 perform pg_temp.application_assert(receipt=public.group_activities_dispatch('event-apply',member,page,legacy_event,null,input)and(select application_message=''from public.group_event_registrations where event_id=legacy_event and app_user_id=member),'requestId-only legacy retry preserves its exact receipt and empty note');
 perform public.group_activities_dispatch('event-cancel',member,page,event,null,jsonb_build_object('requestId',gen_random_uuid()));
 perform public.group_activities_dispatch('event-apply',member,page,event,null,jsonb_build_object('requestId',gen_random_uuid(),'applicationMessage','새로 신청하며 쓴 원문'));
 perform pg_temp.application_assert((select application_message='새로 신청하며 쓴 원문'from public.group_event_registrations where id=reg),'cancelled registration reapplication stores its new note');
 perform pg_temp.application_assert(not has_table_privilege('authenticated','public.group_event_registrations','SELECT')and not has_table_privilege('service_role','public.group_event_registrations','SELECT'),'raw registration notes remain inaccessible to client/database service roles');
end $$;
rollback;
