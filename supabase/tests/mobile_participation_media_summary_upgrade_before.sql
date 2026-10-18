do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;end$$;
insert into public.app_users(id,privy_user_id,verified_email)values('7c200000-0000-4000-8000-000000000001','did:privy:space-upgrade','space-upgrade@example.test');
insert into public.admin_allowlist(id,email,role,active)values('7c200000-0000-4000-8000-000000000002','space-upgrade@example.test','operator',true);
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values('7c200000-0000-4000-8000-000000000003','space-upgrade','draft','/favorite.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('7c200000-0000-4000-8000-000000000003','ko','기존 공간','설명','사진'),('7c200000-0000-4000-8000-000000000003','en','Legacy space','Description','Photo');
update public.celebrities set status='published',published_at=clock_timestamp()where id='7c200000-0000-4000-8000-000000000003';
insert into public.mobile_participation_spaces(id,celebrity_id,slug,policy_version,state,opens_at,closes_at,title_ko,title_en,image_url,address_ko,address_en,created_by_admin_id)
values('7c200000-0000-4000-8000-000000000004','7c200000-0000-4000-8000-000000000003','space-upgrade','v1','published',clock_timestamp()-interval'1 day',clock_timestamp()+interval'1 day','이전 공간','Legacy space','/old-space.webp','서울','Seoul','7c200000-0000-4000-8000-000000000002');
create table public.mobile_space_media_upgrade_proof as select to_jsonb(s)row_value,
  public.read_owned_mobile_participation_space('7c200000-0000-4000-8000-000000000001',s.id,'ko')-'serverNow'projection
  from public.mobile_participation_spaces s where id='7c200000-0000-4000-8000-000000000004';
