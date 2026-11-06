-- Third review follow-up to 20261211150000 (2026-11-06).
-- 1. Closed failure rows say why. resolution: paid, event_no_award (operator attendance judged at retry time, or a page with no creator), content_gone, rejected. Null on rows closed before this.
--    An unpaid close and a payment looked the same before. Compare with dukjil_action_log for rows closed earlier.
-- 2. A page whose members all left is not a read failure. Zero membership rows now count as unreadable only when row security applies to the function owner and no
--    permissive read policy with a plain true condition covers it. A superuser, BYPASSRLS or table-owner case reads the true state, so an empty result there is real.
-- Recorded, unchanged: the retry judges by the role at that moment, so a member promoted after the check-in closes unpaid and a manager demoted after it is paid.
-- No amounts or limits change. Reverse: restore dukjil_event_award_celebrity and retry_dukjil_wire_failures from 20261211150000, then drop the column.

alter table public.dukjil_wire_failures add column resolution text
  check (resolution is null or resolution in ('paid', 'event_no_award', 'content_gone', 'rejected'));

create or replace function public.dukjil_event_award_celebrity(p_event uuid, p_member uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_page uuid; v_creator uuid; v_cel uuid; v_by uuid;
begin
  select e.page_id, e.created_by into v_page, v_creator from public.group_events e where e.id = p_event;
  if v_page is null then raise exception 'EVENT_OPERATOR_UNREADABLE: group_events' using errcode = 'P0001'; end if;
  select p.celebrity_id into v_cel from public.group_pages p where p.id = v_page;
  if not found then raise exception 'EVENT_OPERATOR_UNREADABLE: group_pages' using errcode = 'P0001'; end if;
  if v_cel is null then return null; end if;
  select r.checked_in_by into v_by from public.group_event_registrations r where r.event_id = p_event and r.app_user_id = p_member;
  if not found then raise exception 'EVENT_OPERATOR_UNREADABLE: group_event_registrations' using errcode = 'P0001'; end if;
  -- no member row at all: real when this owner can see the table, a hidden table otherwise. Members may all have left, so emptiness alone proves nothing.
  if not exists(select 1 from public.group_memberships m where m.page_id = v_page)
     and pg_catalog.row_security_active('public.group_memberships'::regclass)
     and not exists(select 1 from pg_catalog.pg_policy pol
                     where pol.polrelid = 'public.group_memberships'::regclass and pol.polpermissive and pol.polcmd in ('r', '*')
                       and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) = 'true'
                       and (0 = any(pol.polroles) or exists(select 1 from pg_catalog.unnest(pol.polroles) x(role_oid) where pg_catalog.pg_has_role(current_user, x.role_oid, 'MEMBER')))) then
    raise exception 'EVENT_OPERATOR_UNREADABLE: group_memberships' using errcode = 'P0001';
  end if;
  if v_by is not distinct from p_member or v_creator = p_member
     or exists(select 1 from public.group_memberships m where m.page_id = v_page and m.app_user_id = p_member and m.role in ('owner', 'manager')) then
    return null;
  end if;
  return v_cel;
end $$;

do $migration$
declare
  def text;
  closed constant text := 'update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;';
  a1 constant text := closed || E'\n        continue;';
  b1 constant text := $b$update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1,
          resolution = case when f.action_key in ('event_checkin', 'event_review') then 'event_no_award' else 'content_gone' end where id = f.id;
        continue;$b$;
  a2 constant text := closed || E'\n      n := n + 1;';
  b2 constant text := $b$update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1, resolution = 'paid' where id = f.id;
      n := n + 1;$b$;
  a3 constant text := E'if public.dukjil_wire_is_normal_rejection(msg) then\n        ' || closed;
  b3 constant text := $b$if public.dukjil_wire_is_normal_rejection(msg) then
        update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1, resolution = 'rejected' where id = f.id;$b$;
begin
  select pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 or (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1
     or (length(def) - length(replace(def, a3, ''))) / length(a3) <> 1 then
    raise exception 'EVENT_RESOLUTION_ANCHOR_CHANGED'; end if;
  execute replace(replace(replace(def, a1, b1), a2, b2), a3, b3);
end $migration$;

notify pgrst, 'reload schema';
