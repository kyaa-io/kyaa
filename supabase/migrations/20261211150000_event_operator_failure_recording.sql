-- Second review follow-up to 20261211130000 (2026-11-06). On AWS these functions have an ordinary owner (no superuser, no BYPASSRLS), and group_events and group_memberships are
-- FORCE RLS with no policy, so the operator check could fail or read zero rows. It sat outside the failure recording, so an error lost an ordinary member's payout silently,
-- and zero rows read as "not an operator".
-- Now:
--   dukjil_event_award_celebrity  reads everything for one check-in or review, refuses to answer when a row it must see is missing (zero rows under RLS), and returns the
--                                 creator to pay or null (operator attendance, or a page with no creator). Rule unchanged from 130000, except that the check-in actor comes from the row.
--   dukjil_wire_event_attendance  runs that inside the failure recording. An error becomes an open dukjil_wire_failures row (wire 'app', celebrity null).
--   retry_dukjil_wire_failures    applies the same check before paying event rows: operator rows close unpaid, unreadable rows stay open and count an attempt.
--                                 This also closes operator rows left from before 130000 without paying them.
--   dukjil_event_operator_owner_access  gives an ordinary owner exactly the rights these need and stops the migration when a gap remains. Same method as 20261210100000.
-- No amounts or limits change. Reverse: restore the registration branch and the retry from 20261211130000 and 20261211090000, then drop the functions and the dukjil_event_fn_owner_* policies.

create function public.dukjil_event_award_celebrity(p_event uuid, p_member uuid) returns uuid
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
  -- a page holding a registration has members, so no row at all means the owner cannot see them, not that nobody is an operator
  if not exists(select 1 from public.group_memberships m where m.page_id = v_page) then
    raise exception 'EVENT_OPERATOR_UNREADABLE: group_memberships' using errcode = 'P0001'; end if;
  if v_by is not distinct from p_member or v_creator = p_member
     or exists(select 1 from public.group_memberships m where m.page_id = v_page and m.app_user_id = p_member and m.role in ('owner', 'manager')) then
    return null;
  end if;
  return v_cel;
end $$;
revoke all on function public.dukjil_event_award_celebrity(uuid, uuid) from public, anon, authenticated, service_role;

create function public.dukjil_wire_event_attendance(p_action text, p_member uuid, p_event uuid, p_params jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare v_cel uuid; msg text; st text; ctx text;
begin
  if p_member is null or not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return; end if;
  begin
    v_cel := public.dukjil_event_award_celebrity(p_event, p_member);
  exception when others then
    get stacked diagnostics msg = message_text, st = returned_sqlstate, ctx = pg_exception_context;
    perform public.record_dukjil_award_failure(p_member, null, p_action, p_event::text, coalesce(p_params, '{}'::jsonb), st, pg_catalog.left(msg || ' @ ' || coalesce(ctx, ''), 800));
    return;
  end;
  if v_cel is not null then
    perform public.dukjil_wire_award(p_action, p_member, v_cel, p_action, p_event::text, coalesce(p_params, '{}'::jsonb));
  end if;
end $$;
revoke all on function public.dukjil_wire_event_attendance(text, uuid, uuid, jsonb) from public, anon, authenticated, service_role;

do $migration$
declare
  def text;
  a1 constant text := $a$select p.celebrity_id into cel from public.group_events e join public.group_pages p on p.id = e.page_id where e.id = new.event_id;
    if cel is not null then
      if new.checked_in_at is not null and old.checked_in_at is null
         and not public.dukjil_event_operator_attendance(new.event_id, new.app_user_id, new.checked_in_by) then
        perform public.dukjil_wire_award('event_checkin', new.app_user_id, cel, 'event_checkin', new.event_id::text);
      end if;
      if new.review_body is not null and old.review_body is null and new.checked_in_at is not null
         and not public.dukjil_event_operator_attendance(new.event_id, new.app_user_id, new.checked_in_by) then
        perform public.dukjil_wire_award('event_review', new.app_user_id, cel, 'event_review', new.event_id::text,
          jsonb_build_object('chars', pg_catalog.length(pg_catalog.btrim(new.review_body))));
      end if;
    end if;$a$;
  b1 constant text := $b$if new.checked_in_at is not null and old.checked_in_at is null then
      perform public.dukjil_wire_event_attendance('event_checkin', new.app_user_id, new.event_id);
    end if;
    if new.review_body is not null and old.review_body is null and new.checked_in_at is not null then
      perform public.dukjil_wire_event_attendance('event_review', new.app_user_id, new.event_id,
        jsonb_build_object('chars', pg_catalog.length(pg_catalog.btrim(new.review_body))));
    end if;$b$;
  a2 constant text := $a$gone := not exists(select 1 from public.fan_post_comments k where k.id::text = f.source_key and k.deleted_at is null and k.hidden_at is null);
      end if;$a$;
  b2 constant text := $b$gone := not exists(select 1 from public.fan_post_comments k where k.id::text = f.source_key and k.deleted_at is null and k.hidden_at is null);
      elsif f.action_key in ('event_checkin', 'event_review') then
        -- same check as the trigger: an operator row closes unpaid, an unreadable one raises and stays open
        f.celebrity_id := public.dukjil_event_award_celebrity(f.source_key::uuid, f.app_user_id);
        gone := f.celebrity_id is null;
      end if;$b$;
begin
  select pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 then raise exception 'EVENT_FAILURE_ANCHOR_CHANGED: trigger'; end if;
  execute replace(def, a1, b1);
  select pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1 then raise exception 'EVENT_FAILURE_ANCHOR_CHANGED: retry'; end if;
  execute replace(def, a2, b2);
end $migration$;

drop function public.dukjil_event_operator_attendance(uuid, uuid, uuid);

-- Rights for an ordinary owner. A superuser or BYPASSRLS owner needs no policy; a table right is still checked, because bypass does not grant it.
-- Fails the migration on a gap instead of repeating the silent loss. Kept as a function so the owner test can run the same step.
create function public.dukjil_event_operator_owner_access() returns void language plpgsql set search_path = '' as $$
declare r record; t text;
  tables constant text[] := array['group_events', 'group_pages', 'group_event_registrations', 'group_memberships'];
begin
  for r in
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls
      from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner
     where p.pronamespace = 'public'::regnamespace and p.proname = 'dukjil_event_award_celebrity' and not o.rolsuper
  loop
    foreach t in array tables loop
      if not pg_catalog.has_table_privilege(r.role_oid, pg_catalog.format('public.%I', t)::regclass, 'SELECT') then
        execute pg_catalog.format('grant select on table public.%I to %I', t, r.rolname);
      end if;
      if not r.rolbypassrls and not exists(select 1 from pg_catalog.pg_policy pol where pol.polrelid = pg_catalog.format('public.%I', t)::regclass and r.role_oid = any(pol.polroles)) then
        execute pg_catalog.format('create policy %I on public.%I for select to %I using (true)', 'dukjil_event_fn_owner_' || r.rolname, t, r.rolname);
      end if;
    end loop;
  end loop;

  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace
        and ((f.proname = 'dukjil_wire_event' and c.proname = 'dukjil_wire_event_attendance')
          or (f.proname = 'retry_dukjil_wire_failures' and c.proname = 'dukjil_event_award_celebrity')
          or (f.proname = 'dukjil_wire_event_attendance' and c.proname in ('dukjil_event_award_celebrity', 'dukjil_wire_award', 'dukjil_policy_replaces_earning', 'record_dukjil_award_failure')))
     where f.pronamespace = 'public'::regnamespace
       and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute pg_catalog.format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;

  for r in
    select o.rolname, x.t
      from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner, pg_catalog.unnest(tables) x(t)
     where p.pronamespace = 'public'::regnamespace and p.proname = 'dukjil_event_award_celebrity' and not o.rolsuper
       and (not pg_catalog.has_table_privilege(o.oid, pg_catalog.format('public.%I', x.t)::regclass, 'SELECT')
         or (not o.rolbypassrls and not exists(select 1 from pg_catalog.pg_policy pol where pol.polrelid = pg_catalog.format('public.%I', x.t)::regclass and o.oid = any(pol.polroles))))
  loop
    raise exception 'DUKJIL_EVENT_ACCESS_GAP: % cannot read %', r.rolname, r.t using errcode = 'P0001';
  end loop;
end $$;
revoke all on function public.dukjil_event_operator_owner_access() from public, anon, authenticated, service_role;

select public.dukjil_event_operator_owner_access();

-- L4: a void that waited on the wallet lock and lost the race answers with what the winner stored, not 'none'. The money was already right.
do $migration$
declare
  def text;
  replay constant text := $v$return (select jsonb_build_object('stampId', st.id, 'replayed', not (s.x ->> 'changed')::boolean, 'pointCorrection', 'none', 'jjinfanRevoked', (s.x ->> 'revoked')::boolean)
      from (select public.passport_sanction_voided_stamp(p_actor, st.id, false, p_sanction, p_reason) as x) s);$v$;
  a constant text := $a$select * into st from public.community_stamps where id = p_stamp_id for update;
  if st.revoked_at is not null then
    $a$ || replay;
  b constant text := $b$select * into st from public.community_stamps where id = p_stamp_id for update;
  if st.revoked_at is not null then
    select * into prior from public.passport_stamp_voids where stamp_id = st.id;
    return (select jsonb_build_object('stampId', st.id, 'replayed', not (s.x ->> 'changed')::boolean, 'pointCorrection', coalesce(prior.point_correction, 'none'), 'jjinfanRevoked', (s.x ->> 'revoked')::boolean)
      from (select public.passport_sanction_voided_stamp(p_actor, st.id, prior.sanction, p_sanction, p_reason) as x) s);$b$;
begin
  select pg_get_functiondef('public.void_passport_stamp(uuid,uuid,text,boolean,text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a, ''))) / length(a) <> 1 then raise exception 'VOID_RACE_ANCHOR_CHANGED'; end if;
  execute replace(def, a, b);
end $migration$;

notify pgrst, 'reload schema';
