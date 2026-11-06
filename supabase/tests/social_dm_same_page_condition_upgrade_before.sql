\set ON_ERROR_STOP on
-- Conversations that already exist when the migration runs. Run just before 20261212050000.
insert into public.app_users(id,privy_user_id,verified_email)values
 ('7a000000-0000-4000-8000-000000000001','did:privy:dm-up-a','dm-up-a@example.test'),
 ('7a000000-0000-4000-8000-000000000002','did:privy:dm-up-b','dm-up-b@example.test'),
 ('7a000000-0000-4000-8000-000000000003','did:privy:dm-up-c','dm-up-c@example.test'),
 ('7a000000-0000-4000-8000-000000000004','did:privy:dm-up-d','dm-up-d@example.test'),
 ('7a000000-0000-4000-8000-000000000005','did:privy:dm-up-e','dm-up-e@example.test');
insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash)values
 ('7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000002','accepted',gen_random_uuid(),'upgrade'),
 ('7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000003','accepted',gen_random_uuid(),'upgrade'),
 ('7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000004','accepted',gen_random_uuid(),'upgrade');
-- b: accepted, in use. c: cancelled, then friends kept talking, which the old rule allowed. d: cancelled and silent since. e: not friends, cancelled.
insert into public.social_dm_conversations(id,user_low_id,user_high_id,requester_id,status,request_id,payload_hash,updated_at)values
 ('7b000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','accepted',gen_random_uuid(),'upgrade',now()-interval'2 days'),
 ('7b000000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001','cancelled',gen_random_uuid(),'upgrade',now()-interval'2 days'),
 ('7b000000-0000-4000-8000-000000000004','7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000004','7a000000-0000-4000-8000-000000000001','cancelled',gen_random_uuid(),'upgrade',now()-interval'2 days'),
 ('7b000000-0000-4000-8000-000000000005','7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000005','7a000000-0000-4000-8000-000000000001','cancelled',gen_random_uuid(),'upgrade',now()-interval'2 days');
insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash,created_at)values
 ('7b000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','in use',gen_random_uuid(),'upgrade',now()-interval'1 day'),
 ('7b000000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001','kept talking',gen_random_uuid(),'upgrade',now()-interval'1 day'),
 ('7b000000-0000-4000-8000-000000000004','7a000000-0000-4000-8000-000000000001','old',gen_random_uuid(),'upgrade',now()-interval'3 days'),
 ('7b000000-0000-4000-8000-000000000005','7a000000-0000-4000-8000-000000000001','after cancel, not friends',gen_random_uuid(),'upgrade',now()-interval'1 day');
