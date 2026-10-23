-- Upgrade fixture: both legacy participation sources and an immutable weighted draw.
insert into public.app_users(id,privy_user_id,verified_email)values
 ('cd000000-0000-4000-8000-000000000001','did:privy:rm-upgrade-registration','rm-upgrade-registration@example.invalid'),
 ('cd000000-0000-4000-8000-000000000002','did:privy:rm-upgrade-mission','rm-upgrade-mission@example.invalid');
insert into public.runmusic_registrations(app_user_id)values('cd000000-0000-4000-8000-000000000001');
insert into public.runmusic_missions(app_user_id,mission)values('cd000000-0000-4000-8000-000000000002','photo');
update public.runmusic_campaign set draw_id='cd000000-0000-4000-8000-000000000003',
 draw_request_key='cd000000-0000-4000-8000-000000000004',draw_seed=repeat('ab',32),
 drawn_at='2026-10-24T10:00:00Z',results_published=true;
insert into public.runmusic_draw_entries(draw_id,app_user_id,weight,mission_snapshot,rank,winner,receipt_id)
 values('cd000000-0000-4000-8000-000000000003','cd000000-0000-4000-8000-000000000002',8,
 '[{"mission":"photo"}]',1,true,'cd000000-0000-4000-8000-000000000005');
