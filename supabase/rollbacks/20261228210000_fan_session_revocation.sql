-- Deploy the previous application version before removing the revocation column.
drop function if exists public.revoke_fan_sessions(uuid, timestamptz);
alter table public.app_users drop column if exists sessions_valid_after;
