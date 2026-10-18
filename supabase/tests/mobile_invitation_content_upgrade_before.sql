insert into public.app_users(id,privy_user_id,verified_email)
values('1a127000-0000-4000-8000-000000000001','did:privy:invitation-content-upgrade','invitation-content-upgrade@example.test');
create table public.invitation_content_upgrade_snapshot(payload jsonb not null);
insert into public.invitation_content_upgrade_snapshot(payload)
select public.get_mobile_social_stamp_collection('1a127000-0000-4000-8000-000000000001');
