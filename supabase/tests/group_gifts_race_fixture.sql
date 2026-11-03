\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email)values('e9740000-0000-4000-8000-000000000001','gift-race-owner','gift-race-owner@example.test'),('e9740000-0000-4000-8000-000000000002','gift-race-manager','gift-race-manager@example.test');
insert into public.group_pages(id,kind,name)values('e9740000-0000-4000-8000-000000000003','hobby','Gift stock race fixture');
insert into public.group_memberships(page_id,app_user_id,role)values('e9740000-0000-4000-8000-000000000003','e9740000-0000-4000-8000-000000000001','owner'),('e9740000-0000-4000-8000-000000000003','e9740000-0000-4000-8000-000000000002','manager');
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)values('e9740000-0000-4000-8000-000000000004','e9740000-0000-4000-8000-000000000001','image','group_image','image/png',100,100,'gift-race.png','gift-race.webp','ready',20,20,gen_random_uuid(),'fixture');
insert into public.group_gift_applications(id,page_id,submitted_by,name,image_asset_id,quantity,provider_name,fulfillment_method,fulfillment_description,status)values('e9740000-0000-4000-8000-000000000005','e9740000-0000-4000-8000-000000000003','e9740000-0000-4000-8000-000000000001','Stock race gift','e9740000-0000-4000-8000-000000000004',100,'Fixture provider','digital','Digital','approved');
select public.group_attach_image('e9740000-0000-4000-8000-000000000001','gift_application','e9740000-0000-4000-8000-000000000005','e9740000-0000-4000-8000-000000000004');
commit;
