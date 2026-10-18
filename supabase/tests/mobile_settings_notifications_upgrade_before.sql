insert into public.app_users(id,privy_user_id,verified_email,preferred_locale)
values('5c000000-0000-4000-8000-000000000001','did:privy:mobile-settings-upgrade','mobile-settings-upgrade@example.test','ja');
insert into public.notification_preferences(app_user_id,benefit_notifications)
values('5c000000-0000-4000-8000-000000000001',false);
