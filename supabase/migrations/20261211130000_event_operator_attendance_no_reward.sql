-- An event's own operators earn nothing from attending it (user decision 2026-11-06). Before this, a fan page owner could open events and check themselves in:
-- 100P, a stamp and, since 20261211120000, a slot per event, with a new source key each time.
-- The check-in and the review keep working, so attendance counts, tickets and audit rows do not change. Only the award is skipped, in the one trigger that pays both.
-- No payout counts as operator attendance when any of these holds:
--   the member checked themselves in (manual or QR), which also covers a manager demoted later;
--   the member created the event;
--   the member is the page's owner or manager, which covers two operators checking each other in.
-- The review follows the same rule, or a self check-in would still earn 30P and a stamp.
-- No amounts or limits change. Not retroactive: past awards stay.
-- Remaining risk, not addressed here: an operator checking in a second account of their own. A per-event total limit would be a policy number.
-- Reverse: remove the two conditions from dukjil_wire_event and drop dukjil_event_operator_attendance.

-- 20261211150000 removes the function below and keeps both anchors, so a second run after it would pass and bring back the old check outside the failure recording.
do $guard$
begin
  if pg_catalog.to_regprocedure('public.dukjil_event_award_celebrity(uuid,uuid)') is not null then
    raise exception 'EVENT_OPERATOR_ALREADY_SUPERSEDED: 20261211150000 is already applied' using errcode = 'P0001';
  end if;
end $guard$;

create function public.dukjil_event_operator_attendance(p_event uuid, p_member uuid, p_checked_in_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_checked_in_by is not distinct from p_member
      or exists(select 1 from public.group_events e where e.id = p_event and e.created_by = p_member)
      or exists(select 1 from public.group_events e join public.group_memberships m on m.page_id = e.page_id
                 where e.id = p_event and m.app_user_id = p_member and m.role in ('owner', 'manager'))
$$;
revoke all on function public.dukjil_event_operator_attendance(uuid, uuid, uuid) from public, anon, authenticated, service_role;

do $migration$
declare
  def text;
  a1 constant text := $a$if new.checked_in_at is not null and old.checked_in_at is null then$a$;
  b1 constant text := $b$if new.checked_in_at is not null and old.checked_in_at is null
         and not public.dukjil_event_operator_attendance(new.event_id, new.app_user_id, new.checked_in_by) then$b$;
  a2 constant text := $a$if new.review_body is not null and old.review_body is null and new.checked_in_at is not null then$a$;
  b2 constant text := $b$if new.review_body is not null and old.review_body is null and new.checked_in_at is not null
         and not public.dukjil_event_operator_attendance(new.event_id, new.app_user_id, new.checked_in_by) then$b$;
begin
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 or (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1 then
    raise exception 'EVENT_OPERATOR_ANCHOR_CHANGED'; end if;
  execute replace(replace(def, a1, b1), a2, b2);
end $migration$;

-- Function owner rights (P1/P2 42501 lesson): an internal owner role that differs from a callee's owner needs EXECUTE.
do $owner$
declare r record;
begin
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace and c.proname = 'dukjil_event_operator_attendance'
     where f.pronamespace = 'public'::regnamespace and f.proname = 'dukjil_wire_event'
       and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;
end $owner$;

notify pgrst, 'reload schema';
