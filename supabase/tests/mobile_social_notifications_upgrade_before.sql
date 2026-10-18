insert into public.app_users(id,privy_user_id,verified_email) values('92300000-0000-4000-8000-000000000901','did:privy:social-notification-upgrade','social-notification-upgrade@example.invalid');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values('92300000-0000-4000-8000-000000000902','social-notification-upgrade','draft','/upgrade.webp','{creator}','creator');
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values('92300000-0000-4000-8000-000000000903','92300000-0000-4000-8000-000000000902','92300000-0000-4000-8000-000000000901','preserved post','92300000-0000-4000-8000-000000000904','legacy');
insert into public.fan_post_likes(post_id,app_user_id) values('92300000-0000-4000-8000-000000000903','92300000-0000-4000-8000-000000000901');
create table public.social_notification_upgrade_snapshot as select to_jsonb(l) item from public.fan_post_likes l where app_user_id='92300000-0000-4000-8000-000000000901';
