set local lock_timeout = '5s';
-- ONCHAIN-STAMPS-CAPFIX-1117: backlog recovery uses at most 500 actual dispatch reservations per UTC day.
-- run_community_stamp_recovery limits by enqueued_day only, so items enqueued on an earlier day could all be admitted on the
-- same day (Codex review 11/17: 501 recovery reservations). admit_fan_action_dispatch now counts, under the same policy row
-- lock, today's reservations whose outbox belongs to a recovery item, and defers a recovery job to the next UTC day once 500 are
-- reserved (decision 11/17: recovery 500 a day, the rest of the shared 1,000 stays for new actions). New actions keep using the
-- shared limit as before. A job that already has a signed transaction or today's reservation returns true before this check,
-- so re-admission and signed-transaction recovery are not counted twice or blocked.
-- The installed definition is patched at one exact anchor; drift aborts the migration.
-- Where 20261231100000 kept the legacy issuer (a database without the Fan Action lane, DEV on 11/17) no dukjil stamp reaches
-- this admission, so the definition is kept with a DUKJIL_NATIVE_LANE_ABSENT notice; a native issuer makes the anchor mandatory.
-- Rollback: supabase/rollback/20261231102000_dukjil_recovery_dispatch_cap.sql

create index community_stamp_recovery_items_outbox_idx on public.community_stamp_recovery_items(outbox_id) where outbox_id is not null;

do $migration$
declare
  signature regprocedure := 'public.admit_fan_action_dispatch(uuid,text)'::regprocedure;
  definition text;
  anchor text := $a$  if (select count(*) from public.mint_dispatch_budget_reservations where budget_day=v_day)
$a$;
begin
  if position('community_stamp_enqueue_native' in pg_get_functiondef(
      'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure)) = 0 then
    raise notice 'DUKJIL_NATIVE_LANE_ABSENT: %', 'admit_fan_action_dispatch unchanged';
    return;
  end if;
  definition := pg_get_functiondef(signature);
  if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
    raise exception 'DUKJIL_RECOVERY_DISPATCH_CAP_PATCH_DRIFT'; end if;
  execute replace(definition, anchor, $p$  if exists(select 1 from public.community_stamp_recovery_items where outbox_id=p_job_id)
    and (select count(*) from public.fan_action_dispatch_reservations r where r.budget_day=v_day
      and r.outbox_id in (select i.outbox_id from public.community_stamp_recovery_items i where i.outbox_id is not null))>=500 then
    update public.fan_action_outbox set status='RETRYING',attempts=greatest(attempts-1,0),
      next_attempt_at=((v_day+1)::timestamp at time zone 'UTC'),lease_owner=null,lease_expires_at=null,
      last_error_code='COMMUNITY_STAMP_RECOVERY_DAILY_LIMIT',last_error_message='Daily stamp recovery dispatch limit reached'
      where id=q.id;
    return false;
  end if;
$p$ || anchor);
end $migration$;
