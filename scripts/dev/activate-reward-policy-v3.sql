-- DEV ONLY. Activates the Tier policy v3 (passport renewal) on the dev database. Never run against production.
-- The P2 migrations do NOT activate v3; production activation also needs the user-confirmed values listed in
-- work/local-team-20261103/tasks/PASSPORT-RENEWAL-20261105/prod-apply-ledger.md (v3 activation conditions).
--
-- Order on dev:
--   1. Apply migrations 20261210130000 ... 20261210139000 (orchestrator).
--   2. Dry run of this file (default, rolls back):
--        psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -v actor=<admin app_users.id> -f scripts/dev/activate-reward-policy-v3.sql
--   3. Commit:
--        psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -v actor=<admin app_users.id> -v finish=commit -f scripts/dev/activate-reward-policy-v3.sql
--   4. Then the stamp -> heart conversion: scripts/dev/heart-conversion.sql (dry run first, then -v finish=commit).
-- Rollback (after commit): activation is a recorded policy switch, not a data rewrite. To go back, call
--   select public.activate_reward_policy(2, transaction_timestamp(), :'actor', 'rollback to v2');
-- (needs a check that activate_reward_policy accepts an older version; not verified here). Hearts already converted stay
-- (fan_heart_conversions is append-only), so convert only after the activation has been seen working on dev.
\if :{?actor}
\else
\echo 'pass -v actor=<admin app_users.id>'
\quit
\endif
\if :{?finish}
\else
\set finish rollback
\endif
begin;
select 'before' as step, policy_version from public.reward_policy_activation where singleton;
select 'v3 rows' as step, (select count(*) from public.reward_policy_tier_stages where policy_version = 3) as stages;
select public.activate_reward_policy(3, transaction_timestamp(), :'actor'::uuid, 'dev draft activation of Tier policy v3');
select 'after' as step, policy_version from public.reward_policy_activation where singleton;
select 'stage progress' as step, public.get_fan_stage_progress(1, 'Gold');
:finish;
