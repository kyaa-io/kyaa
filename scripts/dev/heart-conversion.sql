-- DEV ONLY. One-time stamp -> heart conversion (contract.md 3.7). Never run against production.
-- Dry run (default, rolls back):   psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/dev/heart-conversion.sql
-- Commit on dev:                   psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -v finish=commit -f scripts/dev/heart-conversion.sql
-- Cutoff is the transaction time; valid stamps = not revoked and issued before it. Rerun is safe (on conflict do nothing).
\if :{?finish}
\else
\set finish rollback
\endif
begin;
select 'preview' as step, count(*) as rows, coalesce(sum(hearts),0) as hearts, count(*) filter (where already_converted) as already_converted
  from public.heart_conversion_dry_run(transaction_timestamp());
select public.heart_conversion_apply(transaction_timestamp()) as applied;
select 'after' as step, count(*) as rows, coalesce(sum(hearts),0) as hearts, coalesce(sum(remainder),0) as dropped_remainder from public.fan_heart_conversions;
:finish;
