-- 20261224060000_signup_raffle_entry_only.sql: entering is the only requirement; Fan Passport and community each add one row.
-- Weights come from the server policy (1 base, passport +1, community +1, comment/attendance +1 up to 3 a day each, referral +3 per friend).
-- The weight query at the end applies that policy to the rows so the roster numbers are checked here too.
begin;
insert into public.app_users(id,privy_user_id,verified_email,created_at) values
  ('ab240000-0000-4000-8000-000000000001','did:privy:raffle-only-bare','bare@raffle-only.kyaa.io',now()-interval '30 days'),
  ('ab240000-0000-4000-8000-000000000002','did:privy:raffle-only-passport','passport@raffle-only.kyaa.io',now()-interval '30 days'),
  ('ab240000-0000-4000-8000-000000000003','did:privy:raffle-only-community','community@raffle-only.kyaa.io',now()-interval '30 days'),
  ('ab240000-0000-4000-8000-000000000004','did:privy:raffle-only-inviter','inviter@raffle-only.kyaa.io',now()-interval '30 days');
insert into public.app_users(id,privy_user_id,verified_email,created_at)
select ('ab240000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'did:privy:raffle-only-f'||n,'f'||n||'@raffle-only.kyaa.io',now()
from generate_series(1,12) n;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('ab240000-0000-4000-8000-000000000a01','raffle-only-one','published','/raffle-only-one.webp',now(),'{artist}','idol'),
  ('ab240000-0000-4000-8000-000000000a02','raffle-only-two','published','/raffle-only-two.webp',now(),'{artist}','idol');
insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values
  ('ab240000-0000-4000-8000-000000000b01','ab240000-0000-4000-8000-000000000a01',1,'published',now()),
  ('ab240000-0000-4000-8000-000000000b02','ab240000-0000-4000-8000-000000000a02',1,'published',now());
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values
  ('ab240000-0000-4000-8000-000000000c01','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a01','ab240000-0000-4000-8000-000000000b01',1,'ab240000-0000-4000-8000-000000000c11','passed',3,now()),
  ('ab240000-0000-4000-8000-000000000c02','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a02','ab240000-0000-4000-8000-000000000b02',1,'ab240000-0000-4000-8000-000000000c12','passed',3,now());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values
  ('ab240000-0000-4000-8000-000000000d01','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a01','ab240000-0000-4000-8000-000000000c01'),
  ('ab240000-0000-4000-8000-000000000d02','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a02','ab240000-0000-4000-8000-000000000c02');
-- The mint lane is not under test; the transaction rolls back, so the lane check is lifted for these fixture rows only.
alter table public.fan_passports drop constraint fan_passports_exactly_one_chain_lane;
-- two passports, the first one issued long before the event: still one row, dated at the window start
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,issued_at) values
  ('ab240000-0000-4000-8000-000000000e01','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a01','ab240000-0000-4000-8000-000000000d01',now()-interval '20 days'),
  ('ab240000-0000-4000-8000-000000000e02','ab240000-0000-4000-8000-000000000002','ab240000-0000-4000-8000-000000000a02','ab240000-0000-4000-8000-000000000d02',now());
insert into public.group_pages(id,kind,celebrity_id,name) values
  ('ab240000-0000-4000-8000-000000000f01','fan','ab240000-0000-4000-8000-000000000a01','Raffle only one'),
  ('ab240000-0000-4000-8000-000000000f02','fan','ab240000-0000-4000-8000-000000000a02','Raffle only two');
-- two communities: still one row
insert into public.group_memberships(page_id,app_user_id,joined_at) values
  ('ab240000-0000-4000-8000-000000000f01','ab240000-0000-4000-8000-000000000003',now()),
  ('ab240000-0000-4000-8000-000000000f02','ab240000-0000-4000-8000-000000000003',now());
-- the bare entrant writes 5 comments on one day: rows keep all 5, the policy counts 3
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
values('ab240000-0000-4000-8000-000000000f10','ab240000-0000-4000-8000-000000000a01','ab240000-0000-4000-8000-000000000001','Raffle only',extensions.gen_random_uuid(),'test');
-- inviter: 12 friends signed up with the code (no cap); two of them entered before the inviter
insert into public.community_stamp_invite_codes(app_user_id,code) values ('ab240000-0000-4000-8000-000000000004','AB2400000000000000000004');
insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
select ('ab240000-0000-4000-8000-0000000002'||lpad(n::text,2,'0'))::uuid,'ab240000-0000-4000-8000-000000000004',('ab240000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'AB2400000000000000000004'
from generate_series(1,12) n;
insert into public.community_stamp_invitation_relations(redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version,registered_at)
select id,inviter_app_user_id,invitee_app_user_id,(select max(version) from public.community_stamp_invitation_policy_versions),redeemed_at
from public.community_stamp_invite_redemptions where inviter_app_user_id='ab240000-0000-4000-8000-000000000004';

set local role service_role;
do $$
declare v_from timestamptz := now()-interval '1 day'; v_to timestamptz := now()+interval '1 day'; v_friend uuid;
begin
  -- two friends enter first
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000101',true,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000102',true,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000001',true,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000002',true,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000003',true,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000004',true,v_from,v_to);
  for v_friend in select ('ab240000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid from generate_series(3,12) n loop
    assert public.refresh_signup_raffle_participant(v_friend,true,v_from,v_to);
  end loop;
end $$;
reset role;
-- written after the entry (entered_at is the wall clock inside this transaction), all on one day
insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key,created_at)
select 'ab240000-0000-4000-8000-000000000f10','ab240000-0000-4000-8000-000000000001','Comment '||n,extensions.gen_random_uuid(),clock_timestamp()+interval '1 second'
from generate_series(1,5) n;
set local role service_role;
do $$
declare v_from timestamptz := now()-interval '1 day'; v_to timestamptz := now()+interval '1 day'; snapshot jsonb;
begin
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000001',false,v_from,v_to);
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000004',false,v_from,v_to);
  -- bare entrant: on the roster (an entry), no passport/community rows, flags false
  assert (select not passport_received and not community_joined from public.signup_raffle_entries where app_user_id='ab240000-0000-4000-8000-000000000001');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000001' and kind in ('passport','community'));
  -- passport: exactly one row, dated at the window start because the first passport predates it
  assert (select count(*)=1 and min(occurred_at)=v_from and min(source_id)='passport:fan_passports'
    from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000002' and kind='passport');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000002' and kind='community');
  -- community: exactly one row for two memberships
  assert (select count(*)=1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000003' and kind='community');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000003' and kind='passport');
  -- referral: all 12 friends, including the two who entered before the inviter
  assert (select count(*)=12 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000004' and kind='referral-signup');
  -- refresh is idempotent
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000002',false,v_from,v_to);
  assert (select count(*)=1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000002');
  -- a passport completed only after the close does not count
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000003',false,v_from,now()-interval '1 hour');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000003');
  assert public.refresh_signup_raffle_participant('ab240000-0000-4000-8000-000000000003',false,v_from,v_to);
  snapshot := public.read_signup_raffle_snapshot('ab240000-0000-4000-8000-000000000002',v_from,v_to);
  assert snapshot->'actions'->0->>'kind'='passport';
end $$;
-- Roster weights under the server policy (1 base; passport, community +1 once; comment/attendance +1 up to 3 a day each in KST; referral +3 each, uncapped).
do $$
declare roster jsonb;
begin
  select jsonb_object_agg(e.app_user_id::text, 1
      + least(1,(select count(*) from public.signup_raffle_actions a where a.app_user_id=e.app_user_id and a.kind='passport'))
      + least(1,(select count(*) from public.signup_raffle_actions a where a.app_user_id=e.app_user_id and a.kind='community'))
      + coalesce((select sum(least(3,c)) from (select count(*) c from public.signup_raffle_actions a
          where a.app_user_id=e.app_user_id and a.kind in ('comment','attendance') and a.occurred_at>=e.entered_at
          group by a.kind,(a.occurred_at at time zone 'Asia/Seoul')::date) d),0)
      + 3*(select count(*) from public.signup_raffle_actions a where a.app_user_id=e.app_user_id and a.kind='referral-signup'))
    into roster from public.signup_raffle_entries e where e.app_user_id::text like 'ab240000-%';
  assert (roster->>'ab240000-0000-4000-8000-000000000001')::int=4, 'bare entrant: 1 + 3 capped comments';
  assert (roster->>'ab240000-0000-4000-8000-000000000002')::int=2, 'passport +1';
  assert (roster->>'ab240000-0000-4000-8000-000000000003')::int=2, 'community +1';
  assert (roster->>'ab240000-0000-4000-8000-000000000004')::int=37, 'referral 12 x 3, uncapped';
  assert (roster->>'ab240000-0000-4000-8000-000000000105')::int=1, 'friend with nothing else: still on the roster with 1';
  assert (select count(*)=16 from public.signup_raffle_entries where app_user_id::text like 'ab240000-%');
  assert (select count(*)=5 from public.signup_raffle_actions where app_user_id='ab240000-0000-4000-8000-000000000001' and kind='comment');
end $$;
reset role;
do $$
begin
  assert (select pg_get_constraintdef(oid) like '%passport%' and pg_get_constraintdef(oid) like '%community%' from pg_constraint where conname='signup_raffle_actions_kind_check');
  assert not has_function_privilege('authenticated','public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz)','EXECUTE');
  assert not has_function_privilege('anon','public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz)','EXECUTE');
end $$;
rollback;
