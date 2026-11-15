-- 20261227220101_email_delivery_blocked_kind.sql: enum values cannot be dropped in Postgres. Nothing to roll back.
-- Roll back 20261227220102 first (it removes every email_delivery_blocked row).
select 1;
