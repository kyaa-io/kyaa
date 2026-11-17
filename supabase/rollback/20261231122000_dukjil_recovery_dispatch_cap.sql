-- Rollback for 20261231122000_dukjil_recovery_dispatch_cap.sql: admit_fan_action_dispatch goes back to the shared limit only
-- (definition of 20261013110000_kyaa_credential_cutover.sql). Reservations already made stay. Stop backlog recovery first
-- (supabase/rollback/20261231120000_dukjil_stamps_native_onchain.sql) or recovery jobs can again use more than 500 a day.
begin;
set local lock_timeout = '5s';
create or replace function public.admit_fan_action_dispatch(p_job_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_paused boolean; v_limit integer; v_day date:=(clock_timestamp() at time zone 'UTC')::date; q public.fan_action_outbox;
begin
  select daily_job_limit,transmission_paused into v_limit,v_paused from public.mint_dispatch_policy where singleton for update;
  if v_limit is null then raise exception 'MINT_POLICY_MISSING'; end if;
  select * into q from public.fan_action_outbox where id=p_job_id and status='PROCESSING'
    and lease_owner=p_worker_id and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'STALE_JOB_LEASE'; end if;
  if v_paused then
    update public.fan_action_outbox set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=clock_timestamp()+interval '1 minute',lease_owner=null,lease_expires_at=null,
      last_error_code='MINT_TRANSMISSION_PAUSED',last_error_message='Mint transmission paused' where id=q.id;
    return false;
  end if;
  if q.signed_transaction is not null or exists(select 1 from public.fan_action_dispatch_reservations
    where budget_day=v_day and outbox_id=p_job_id) then return true; end if;
  if (select count(*) from public.mint_dispatch_budget_reservations where budget_day=v_day)
    +(select count(*) from public.fan_action_dispatch_reservations where budget_day=v_day)>=v_limit then
    update public.fan_action_outbox set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=((v_day+1)::timestamp at time zone 'UTC'),lease_owner=null,lease_expires_at=null,
      last_error_code='MINT_DAILY_DISPATCH_LIMIT',last_error_message='Daily mint dispatch limit reached'
      where id=q.id;
    return false;
  end if;
  insert into public.fan_action_dispatch_reservations values(v_day,p_job_id);
  return true;
end $$;
drop index if exists public.community_stamp_recovery_items_outbox_idx;
commit;
