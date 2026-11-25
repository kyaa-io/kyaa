begin;

create function public.enter_signup_raffle(
  p_user_id uuid, p_starts_at timestamptz, p_closes_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare already_entered boolean;
begin
  -- The refresh uses the same lock. Keep the existence check and entry in one transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('signup-raffle:' || p_user_id::text, 0));
  select exists(select 1 from public.signup_raffle_entries where app_user_id = p_user_id)
    into already_entered;
  if not public.refresh_signup_raffle_participant(p_user_id, true, p_starts_at, p_closes_at) then
    return 'rejected';
  end if;
  return case when already_entered then 'existing' else 'created' end;
end;
$$;

revoke all on function public.enter_signup_raffle(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.enter_signup_raffle(uuid, timestamptz, timestamptz) to service_role;

commit;
