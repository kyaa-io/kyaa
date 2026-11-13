begin;
insert into public.app_users(id,privy_user_id,verified_email)
values('ab220000-0000-4000-8000-000000000001','did:privy:raffle-sql','raffle-sql@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('ab220000-0000-4000-8000-000000000002','raffle-sql','published','/images/creator.webp',now(),'{creator}','creator');
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
values('ab220000-0000-4000-8000-000000000003','ab220000-0000-4000-8000-000000000002','ab220000-0000-4000-8000-000000000001','Raffle test',extensions.gen_random_uuid(),'test');
insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key)
values('ab220000-0000-4000-8000-000000000003','ab220000-0000-4000-8000-000000000001','Verified comment',extensions.gen_random_uuid());
set local role service_role;
do $$
declare v_user uuid := 'ab220000-0000-4000-8000-000000000001'; v_entered timestamptz;
begin
  assert public.refresh_signup_raffle_participant(v_user,true,now()-interval '1 day',now()+interval '1 day');
  select entered_at into strict v_entered from public.signup_raffle_entries where app_user_id=v_user;
  assert public.refresh_signup_raffle_participant(v_user,true,now()-interval '1 day',now()+interval '1 day');
  assert (select count(*)=1 and min(entered_at)=v_entered from public.signup_raffle_entries where app_user_id=v_user);
  assert (select count(*)=1 from public.signup_raffle_actions where app_user_id=v_user);
end $$;
reset role;
insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key)
select 'ab220000-0000-4000-8000-000000000003','ab220000-0000-4000-8000-000000000001','Verified comment '||n,extensions.gen_random_uuid()
from generate_series(1,500) n;
insert into public.app_users(id,privy_user_id,verified_email)
values('ab220000-0000-4000-8000-000000000004','did:privy:raffle-other','raffle-other@example.test');
set local role service_role;
select public.refresh_signup_raffle_participant('ab220000-0000-4000-8000-000000000004',true,now()-interval '1 day',now()+interval '1 day');
do $$
declare snapshot jsonb;
begin
  snapshot := public.read_signup_raffle_snapshot('ab220000-0000-4000-8000-000000000001',now()-interval '1 day',now()+interval '1 day');
  assert jsonb_array_length(snapshot->'users')=1;
  assert jsonb_array_length(snapshot->'entries')=1;
  assert jsonb_array_length(snapshot->'actions')=501;
  assert (select count(distinct value->>'sourceId')=501 from jsonb_array_elements(snapshot->'actions'));
  snapshot := public.read_signup_raffle_snapshot(null,now()-interval '1 day',now()+interval '1 day');
  assert jsonb_array_length(snapshot->'users')=2;
end $$;
reset role;
update public.fan_post_comments set deleted_at=now() where app_user_id='ab220000-0000-4000-8000-000000000001';
set local role service_role;
do $$
declare v_user uuid := 'ab220000-0000-4000-8000-000000000001';
begin
  assert public.refresh_signup_raffle_participant(v_user,false,now()-interval '1 day',now()+interval '1 day');
  assert not exists(select 1 from public.signup_raffle_actions where app_user_id=v_user);
  assert jsonb_array_length(public.read_signup_raffle_snapshot(v_user,now()-interval '1 day',now()+interval '1 day')->'actions')=0;
  assert not public.refresh_signup_raffle_participant(v_user,true,now()-interval '2 days',now()-interval '1 day');
end $$;
reset role;
do $$
begin
  assert not has_table_privilege('authenticated','public.signup_raffle_entries','SELECT');
  assert not has_table_privilege('anon','public.signup_raffle_actions','INSERT');
  assert not has_function_privilege('authenticated','public.read_signup_raffle_snapshot(uuid,timestamptz,timestamptz)','EXECUTE');
  assert not has_function_privilege('authenticated','public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz)','EXECUTE');
end $$;
rollback;
