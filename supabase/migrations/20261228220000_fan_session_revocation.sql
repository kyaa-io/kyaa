begin;
-- app_users is read on every request; give up after 3s instead of queuing them behind the ACCESS EXCLUSIVE lock.
set local lock_timeout = '3s';

-- Nullable for accounts that have never signed out. Never writable by browser roles.
alter table public.app_users add column sessions_valid_after timestamptz;

-- Concurrent sign-outs may only advance the cutoff, never restore older sessions.
create function public.revoke_fan_sessions(target_user_id uuid, revoked_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.app_users
  set sessions_valid_after = greatest(sessions_valid_after, revoked_at)
  where id = target_user_id;
$$;
revoke all on function public.revoke_fan_sessions(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.revoke_fan_sessions(uuid, timestamptz) to service_role;
commit;
