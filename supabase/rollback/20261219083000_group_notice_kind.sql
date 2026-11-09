-- 20261219083000_group_notice_kind.sql: enum values cannot be dropped in Postgres. Nothing to roll back.
-- Roll back 20261219084000 first (its step 3 removes every group_notice row).
select 1;
