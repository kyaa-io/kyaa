-- EMAIL-BOUNCE-DB-1115: site-only notice kind for a mail channel that SES feedback stopped.
-- Own file without begin: a new enum value cannot be used in the transaction that adds it.
-- 20261227220102 uses it. Rollback: enum values cannot be dropped (harmless with no rows).
alter type public.notification_kind add value if not exists 'email_delivery_blocked';
