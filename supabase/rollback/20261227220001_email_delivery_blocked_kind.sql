-- 20261227220001_email_delivery_blocked_kind.sql: enum values cannot be dropped in Postgres. Nothing to roll back.
-- Roll back 20261227220002 first (it removes every email_delivery_blocked row).
select 1;
