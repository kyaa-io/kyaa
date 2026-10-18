insert into public.app_users(id,privy_user_id,verified_email) values
 ('92100000-0000-4000-8000-000000000901','did:privy:sms-upgrade','sms-upgrade@example.invalid');
select public.reserve_owned_phone_sms_challenge('92100000-0000-4000-8000-000000000901',
 '92100000-0000-4000-8000-000000000902','92100000-0000-4000-8000-000000000903',
 '01099990000',repeat('9',64),repeat('8',64));
