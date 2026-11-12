-- 20261224050000_signup_raffle_referral.sql: a friend who signed up and entered through my invite link is one referral row for me.
begin;
-- inviter 01, friends 11..17, a second inviter 02 (operator), a third inviter 03 (no entry)
insert into public.app_users(id,privy_user_id,verified_email,created_at) values
  ('ab230000-0000-4000-8000-000000000001','did:privy:raffle-ref-inviter','inviter@raffle-ref.kyaa.io',now()-interval '30 days'),
  ('ab230000-0000-4000-8000-000000000002','did:privy:raffle-ref-operator','operator@raffle-ref.kyaa.io',now()-interval '30 days'),
  ('ab230000-0000-4000-8000-000000000003','did:privy:raffle-ref-idle','idle@raffle-ref.kyaa.io',now()-interval '30 days'),
  ('ab230000-0000-4000-8000-000000000011','did:privy:raffle-ref-f1','f1@raffle-ref.kyaa.io',now()),
  ('ab230000-0000-4000-8000-000000000012','did:privy:raffle-ref-f2','f2@raffle-ref.kyaa.io',now()),
  ('ab230000-0000-4000-8000-000000000013','did:privy:raffle-ref-f3','f3@raffle-ref.kyaa.io',now()-interval '10 days'),
  ('ab230000-0000-4000-8000-000000000014','did:privy:raffle-ref-f4','f4@raffle-ref.kyaa.io',now()),
  ('ab230000-0000-4000-8000-000000000015','did:privy:raffle-ref-f5','f5-admin@raffle-ref.kyaa.io',now()),
  ('ab230000-0000-4000-8000-000000000016','did:privy:raffle-ref-f6','f6@raffle-ref.test',now()),
  ('ab230000-0000-4000-8000-000000000017','did:privy:raffle-ref-f7','f7@raffle-ref.kyaa.io',now()),
  ('ab230000-0000-4000-8000-000000000018','did:privy:raffle-ref-f8','f8@raffle-ref.kyaa.io',now());
insert into public.admin_allowlist(email,role) values ('f5-admin@raffle-ref.kyaa.io','viewer'),('operator@raffle-ref.kyaa.io','operator');
insert into public.community_stamp_invite_codes(app_user_id,code) values
  ('ab230000-0000-4000-8000-000000000001','AB2300000000000000000001'),
  ('ab230000-0000-4000-8000-000000000002','AB2300000000000000000002'),
  ('ab230000-0000-4000-8000-000000000003','AB2300000000000000000003');
-- f1..f6 registered inviter 01's code, f7 registered the operator's code, f8 registered the idle inviter's code
insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
select ('ab230000-0000-4000-8000-0000000001'||n)::uuid,'ab230000-0000-4000-8000-000000000001',('ab230000-0000-4000-8000-0000000000'||n)::uuid,'AB2300000000000000000001'
from unnest(array['11','12','13','14','15','16']) n;
insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code) values
  ('ab230000-0000-4000-8000-000000000117','ab230000-0000-4000-8000-000000000002','ab230000-0000-4000-8000-000000000017','AB2300000000000000000002'),
  ('ab230000-0000-4000-8000-000000000118','ab230000-0000-4000-8000-000000000003','ab230000-0000-4000-8000-000000000018','AB2300000000000000000003');
insert into public.community_stamp_invitation_relations(redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version,registered_at)
select id,inviter_app_user_id,invitee_app_user_id,(select max(version) from public.community_stamp_invitation_policy_versions),redeemed_at
from public.community_stamp_invite_redemptions where id::text like 'ab230000-0000-4000-8000-0000000001%';
-- f4's registration was cancelled
update public.community_stamp_invitation_relations set status='cancelled',cancelled_at=now()
where invitee_app_user_id='ab230000-0000-4000-8000-000000000014';

set local role service_role;
do $$
declare v_from timestamptz := now()-interval '1 day'; v_to timestamptz := now()+interval '1 day';
  v_inviter uuid := 'ab230000-0000-4000-8000-000000000001'; v_friend uuid; snapshot jsonb;
  referral text := 'referral:community_stamp_invite_redemptions:ab230000-0000-4000-8000-000000000111';
begin
  assert public.refresh_signup_raffle_participant(v_inviter,true,v_from,v_to);
  -- nobody has entered yet
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id=v_inviter);
  -- every friend except f2 enters
  foreach v_friend in array array['ab230000-0000-4000-8000-000000000011','ab230000-0000-4000-8000-000000000013','ab230000-0000-4000-8000-000000000014',
    'ab230000-0000-4000-8000-000000000015','ab230000-0000-4000-8000-000000000016','ab230000-0000-4000-8000-000000000017','ab230000-0000-4000-8000-000000000018']::uuid[] loop
    assert public.refresh_signup_raffle_participant(v_friend,true,v_from,v_to);
  end loop;
  -- the friend's own rows never carry the referral
  assert not exists(select 1 from public.signup_raffle_actions where kind='referral-signup');
  -- only f1 counts: f2 did not enter, f3 is an old account, f4 was cancelled, f5 is an operator, f6 is a test address
  assert public.refresh_signup_raffle_participant(v_inviter,false,v_from,v_to);
  assert (select count(*)=1 and min(source_id)=referral from public.signup_raffle_actions where app_user_id=v_inviter and kind='referral-signup');
  -- refreshing again keeps one row per friend
  assert public.refresh_signup_raffle_participant(v_inviter,false,v_from,v_to);
  assert (select count(*)=1 from public.signup_raffle_actions where app_user_id=v_inviter);
  snapshot := public.read_signup_raffle_snapshot(v_inviter,v_from,v_to);
  assert jsonb_array_length(snapshot->'actions')=1;
  assert snapshot->'actions'->0->>'kind'='referral-signup' and snapshot->'actions'->0->>'sourceId'=referral;
  -- the row happens when the friend entered (later than the registration)
  assert (select a.occurred_at=e.entered_at from public.signup_raffle_actions a, public.signup_raffle_entries e
    where a.app_user_id=v_inviter and e.app_user_id='ab230000-0000-4000-8000-000000000011');
  -- an operator inviter earns nothing even when the friend qualifies
  assert public.refresh_signup_raffle_participant('ab230000-0000-4000-8000-000000000002',true,v_from,v_to);
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab230000-0000-4000-8000-000000000002');
  -- an inviter who has not entered has no rows and is not a participant
  assert not public.refresh_signup_raffle_participant('ab230000-0000-4000-8000-000000000003',false,v_from,v_to);
  -- a friend who registered or entered outside the window does not count
  assert public.refresh_signup_raffle_participant(v_inviter,false,now()+interval '1 hour',v_to);
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id=v_inviter);
  assert public.refresh_signup_raffle_participant(v_inviter,false,v_from,v_to);
  assert public.signup_raffle_referral_excluded('ab230000-0000-4000-8000-000000000015');
  assert public.signup_raffle_referral_excluded('ab230000-0000-4000-8000-000000000016');
  assert public.signup_raffle_referral_excluded('ab230000-0000-4000-8000-0000000000ff');
  assert not public.signup_raffle_referral_excluded('ab230000-0000-4000-8000-000000000011');
end $$;
reset role;
-- a friend whose account is disabled stops counting on the next refresh
update public.app_users set status='disabled' where id='ab230000-0000-4000-8000-000000000011';
set local role service_role;
do $$
begin
  assert public.refresh_signup_raffle_participant('ab230000-0000-4000-8000-000000000001',false,now()-interval '1 day',now()+interval '1 day');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab230000-0000-4000-8000-000000000001');
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('authenticated','public.signup_raffle_referral_excluded(uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.signup_raffle_referral_excluded(uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz)','EXECUTE');
  assert (select pg_get_constraintdef(oid) like '%referral-signup%' from pg_constraint where conname='signup_raffle_actions_kind_check');
end $$;
rollback;
