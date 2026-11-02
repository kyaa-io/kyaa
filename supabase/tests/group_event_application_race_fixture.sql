\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email)select('e9770000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'event-application-race-'||n,'event-application-race-'||n||'@example.test'from generate_series(1,3)n;
insert into public.group_pages(id,kind,name)values('e9770000-0000-4000-8000-000000000004','hobby','Application capacity race fixture');
insert into public.group_memberships(page_id,app_user_id,role)select'e9770000-0000-4000-8000-000000000004'::uuid,('e9770000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case n when 3 then'owner'else'member'end from generate_series(1,3)n;
insert into public.group_events(id,page_id,title,description,starts_at,ends_at,opens_at,closes_at,location,state,requires_approval,capacity,created_by)values('e9770000-0000-4000-8000-000000000005','e9770000-0000-4000-8000-000000000004','Capacity one','Original description',clock_timestamp()+interval'2 days',clock_timestamp()+interval'3 days',clock_timestamp()-interval'1 day',clock_timestamp()+interval'1 day','Seoul','published',false,1,'e9770000-0000-4000-8000-000000000003');
commit;
