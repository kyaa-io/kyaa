\set ON_ERROR_STOP on
-- Runs before the approval migration: a live event with a registration and a draft that already exist.
insert into public.app_users(id,privy_user_id,verified_email)values('ea000000-0000-4000-8000-000000000001','did:privy:approval-upgrade-1','approval-upgrade-1@example.test'),('ea000000-0000-4000-8000-000000000002','did:privy:approval-upgrade-2','approval-upgrade-2@example.test');
insert into public.group_pages(id,kind,name)values('ea000000-0000-4000-8000-000000000003','hobby','Approval upgrade');
insert into public.group_memberships(page_id,app_user_id,role)values('ea000000-0000-4000-8000-000000000003','ea000000-0000-4000-8000-000000000001','owner'),('ea000000-0000-4000-8000-000000000003','ea000000-0000-4000-8000-000000000002','member');
insert into public.group_events(id,page_id,title,starts_at,ends_at,opens_at,closes_at,location,state,created_by)values
 ('ea000000-0000-4000-8000-000000000004','ea000000-0000-4000-8000-000000000003','Existing live',now()-interval'1 hour',now()+interval'1 hour',now()-interval'1 day',now()+interval'30 minutes','Hall','published','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000005','ea000000-0000-4000-8000-000000000003','Existing draft',now()+interval'1 day',now()+interval'2 days',now(),now()+interval'1 day','Hall','draft','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000006','ea000000-0000-4000-8000-000000000003','Existing cancelled',now()-interval'2 days',now()-interval'1 day',now()-interval'3 days',now()-interval'2 days','Hall','cancelled','ea000000-0000-4000-8000-000000000001');
insert into public.group_event_registrations(event_id,app_user_id,status)values('ea000000-0000-4000-8000-000000000004','ea000000-0000-4000-8000-000000000002','confirmed');
