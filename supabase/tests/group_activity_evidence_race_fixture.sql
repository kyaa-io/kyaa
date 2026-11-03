\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email)select('e9750000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'evidence-race-'||n,'evidence-race-'||n||'@example.test'from generate_series(1,3)n;
insert into public.admin_allowlist(id,email,role)values('e9750000-0000-4000-8000-000000000008','evidence-race-1@example.test','operator');
insert into public.group_pages(id,kind,name)values('e9750000-0000-4000-8000-000000000004','hobby','Evidence race fixture');
insert into public.group_memberships(page_id,app_user_id,role)select'e9750000-0000-4000-8000-000000000004'::uuid,('e9750000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case n when 1 then'owner'when 2 then'manager'else'member'end from generate_series(1,3)n;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)select('e9750000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'e9750000-0000-4000-8000-000000000003','image','group_image','image/png',100,100,'race/'||n||'.png','race/'||n||'.webp','ready',20,20,gen_random_uuid(),'fixture'from generate_series(6,7)n;
insert into public.group_missions(id,page_id,title,instructions,state,submission_kind,reward_points,reward_budget,reward_approved_by)values('e9750000-0000-4000-8000-000000000005','e9750000-0000-4000-8000-000000000004','Photo race','Original proof','published','photo',50,100,'e9750000-0000-4000-8000-000000000008');
commit;
