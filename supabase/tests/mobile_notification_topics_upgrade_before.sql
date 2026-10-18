insert into public.app_users(id,privy_user_id,verified_email) values('92200000-0000-4000-8000-000000000901','did:privy:topics-upgrade','topics-upgrade@example.invalid');
select public.mobile_get_owned_settings('92200000-0000-4000-8000-000000000901');
select public.mobile_patch_owned_settings('92200000-0000-4000-8000-000000000901',1,'{"preferredLocale":"ja","pushEnabled":false,"topics":{"community":false,"benefit":false,"marketing":true}}');
create table public.notification_topics_upgrade_snapshot as select public.mobile_get_owned_settings('92200000-0000-4000-8000-000000000901') settings;
