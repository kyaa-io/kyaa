-- B3 review F1: 20261220034000 applied over 5,200 passports in one transaction: every passport got its start row, the Gold ones a
-- baseline, nobody a grant. Then the fixture goes and the reward policy is back to the replay's value.
\set ON_ERROR_STOP on
do $$
declare n_start integer; n_base integer; n_grant integer;
begin
  select count(*) filter (where kind = 'start'), count(*) filter (where kind = 'baseline' and tier = 'Gold') into n_start, n_base
    from public.fan_tier_history where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
  select count(*) into n_grant from public.fan_tier_bonus_grants where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
  if n_start <> 5200 or n_base <> 520 or n_grant <> 0 then
    raise exception 'B3 install catch-up over 5,200 passports: start %, baseline %, grants %', n_start, n_base, n_grant;
  end if;
  raise notice 'B3 install catch-up ok: % start rows, % baselines, no grants', n_start, n_base;
end $$;
begin;
set local session_replication_role = replica;
delete from public.fan_tier_history where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
delete from public.creator_heart_ledger where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
delete from public.fan_passports where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
delete from public.app_users where id::text like 'b3f10000-%';
delete from public.celebrity_localizations where celebrity_id = 'b3f00000-0000-4000-8000-000000000001';
delete from public.celebrities where id = 'b3f00000-0000-4000-8000-000000000001';
update public.reward_policy_activation set policy_version = 2 where singleton;
commit;
