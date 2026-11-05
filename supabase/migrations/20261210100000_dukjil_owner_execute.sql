-- PASSPORT-RENEWAL P1 FIX (attendance 503 after activation): 42501 "permission denied for function
-- dukjil_policy_replaces_earning". 20261210020000 revoked the policy helpers from everyone but service_role and the owner.
-- On AWS the helpers are owned by the migration admin role, while the legacy functions that the P1 migrations patched
-- (assert_community_stamp_source, validate_fan_score_weight, award_mobile_fan_activity, the invitation guards ...) are owned
-- by the imported 'postgres' role. A clean replay owns everything with one role and cannot show this.
-- Which role runs a function: a SECURITY DEFINER function runs as its owner. An invoker function runs as whoever reached it,
-- so inside the call chain it takes the owner of the definer function that called it (assert_community_stamp_blockchain_job_link,
-- issue_community_stamp, validate_fan_score_weight and assert_community_stamp_source are invoker-or-definer links of that chain).
-- This migration therefore works from the call chain: every definer function starts a chain as its owner, a chain follows
-- invoker callees found by name in the function bodies (comments and quoted text removed), and an invoker trigger function is
-- attributed to the owners of the definer functions that write its table. Each role found that way gets exactly the rights
-- the chain needs, and the final checks fail the migration if any chain still lacks one.
-- Limits (a different owner layout can still hide a gap from this static reading): calls built with dynamic SQL (execute),
-- calls through a function stored in a table or setting, an invoker trigger fired by DML from a role other than a definer owner
-- (for example a direct service_role write), two functions with one name in different argument lists (matched by name, so the
-- check can block on an overload that is never called) and a name that only appears in text the stripper does not recognise
-- (a double-dash inside a quoted string, dollar-quoted text) are not seen or are over-read. The migration only blocks, it never
-- grants the write helpers record_dukjil_action or activate_dukjil_policy.
--
-- Failure-record access: dukjil_wire_failures is FORCE ROW LEVEL SECURITY with no policy, so even the table owner reads no row
-- and cannot insert unless it is a superuser or has BYPASSRLS. The owners of the functions that record or retry failures
-- (byus_admin on AWS) have neither, which made dukjil_wire_award, retry_dukjil_wire_failures and the function below fail
-- silently or abort the user's action. A policy for exactly those owner roles (not anon, authenticated or service_role) and the
-- table rights they need are added. Table rights are checked separately from BYPASSRLS: bypass does not grant privileges.

-- P1-FIX-ATTEND-D2: a payout the app could not record used to vanish (award.ts swallows the error and the server log is not
-- readable). The app now reports any failure that is not an expected "nothing to pay" code through this function, into the
-- existing dukjil_wire_failures table (wire = 'app'). One open row per event, and retry_dukjil_wire_failures pays it again
-- once the cause is fixed. Only service_role may call it, and it writes nothing else.
create function public.record_dukjil_award_failure(
  p_user uuid, p_celebrity uuid, p_action text, p_source text, p_params jsonb, p_state text, p_message text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_action is null or pg_catalog.length(p_action) not between 1 and 40
     or p_source is null or pg_catalog.length(p_source) not between 1 and 220 then
    raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  insert into public.dukjil_wire_failures(wire, app_user_id, celebrity_id, action_key, source_key, params, error_state, error_message)
    values ('app', p_user, p_celebrity, p_action, p_source,
      case when pg_catalog.jsonb_typeof(p_params) = 'object' and pg_catalog.pg_column_size(p_params) <= 2048 then p_params else '{}'::jsonb end,
      pg_catalog.left(p_state, 8), pg_catalog.left(coalesce(p_message, 'unknown'), 800))
    on conflict (app_user_id, action_key, source_key) where resolved_at is null do nothing;
end $$;
revoke all on function public.record_dukjil_award_failure(uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_dukjil_award_failure(uuid, uuid, text, text, jsonb, text, text) to service_role;

-- Operator resume: retry_dukjil_wire_failures stops after 5 failures (gave_up_at) and never looks at that row again, so fixing
-- the cause does not pay it. This puts given-up open rows (all of them, or the ids passed) back into the retry queue.
create function public.resume_dukjil_wire_failures(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.dukjil_wire_failures set gave_up_at = null, attempts = 0
    where resolved_at is null and gave_up_at is not null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.resume_dukjil_wire_failures(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.resume_dukjil_wire_failures(uuid[]) to service_role;

do $migration$
declare
  r record;
  probe constant regprocedure := 'public.dukjil_policy_replaces_earning(timestamptz)'::regprocedure;
begin
  -- 1. failure table access for the roles that run the recording and retry functions
  for r in
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles o on o.oid = p.proowner
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('dukjil_wire_award', 'retry_dukjil_wire_failures', 'record_dukjil_award_failure', 'resume_dukjil_wire_failures')
      and not o.rolsuper
      and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
  loop
    execute format('grant select, insert, update on table public.dukjil_wire_failures to %I', r.rolname);
    if not r.rolbypassrls and not exists (
      select 1 from pg_catalog.pg_policy pol
      where pol.polrelid = 'public.dukjil_wire_failures'::regclass and r.role_oid = any (pol.polroles)
    ) then
      execute format('create policy %I on public.dukjil_wire_failures for all to %I using (true) with check (true)',
        'dukjil_wire_fn_owner_' || r.rolname, r.rolname);
    end if;
  end loop;

  -- 2. the call chain: which role runs which function
  create temporary table dukjil_fn on commit drop as
    select p.oid as oid, p.proname::text as proname, p.prosecdef, p.proowner,
      pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(p.prosrc,
        '/\*.*?\*/', ' ', 'g'), '--[^\n]*', ' ', 'g'), '''([^'']|'''')*''', ' ', 'g') as src
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang and l.lanname in ('plpgsql', 'sql')
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f';

  create temporary table dukjil_runas on commit drop as
    with recursive trig as (
      select distinct t.tgfoid as fn, c.relname::text as relname
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
    ), start (fn, role_oid) as (
      select f.oid, f.proowner from dukjil_fn f where f.prosecdef
      union
      select f.oid, d.proowner
      from dukjil_fn f
      join trig on trig.fn = f.oid
      join dukjil_fn d on d.prosecdef
        and d.src ~* ('(insert\s+into|update|delete\s+from)\s+(public\.)?' || trig.relname || '\M')
      where not f.prosecdef
    ), reach (fn, role_oid) as (
      select s.fn, s.role_oid from start s
      union
      select c.oid, x.role_oid
      from reach x
      join dukjil_fn a on a.oid = x.fn
      join dukjil_fn c on not c.prosecdef and c.oid <> a.oid
        and position(c.proname in a.src) > 0 and a.src ~ ('\m' || c.proname || '\M')
    )
    select distinct fn, role_oid from reach;

  -- 3. grants the chain needs
  for r in
    select distinct o.rolname
    from dukjil_runas x
    join dukjil_fn a on a.oid = x.fn and a.oid <> probe::oid and a.src ~ '\mdukjil_policy_replaces_earning\M'
    join pg_catalog.pg_roles o on o.oid = x.role_oid
    where o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
      and not o.rolsuper
      and not pg_catalog.has_function_privilege(x.role_oid, probe::oid, 'EXECUTE')
  loop
    execute format('grant execute on function public.dukjil_policy_replaces_earning(timestamptz) to %I', r.rolname);
  end loop;

  -- LIVE and other readers of the action log run as their own owner; BYPASSRLS does not replace the table right.
  for r in
    select distinct o.rolname
    from dukjil_runas x
    join dukjil_fn a on a.oid = x.fn and a.src ~* '(from|join)\s+(public\.)?dukjil_action_log\M'
    join pg_catalog.pg_roles o on o.oid = x.role_oid
    where o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
      and not o.rolsuper
      and not pg_catalog.has_table_privilege(x.role_oid, 'public.dukjil_action_log'::regclass, 'SELECT')
  loop
    execute format('grant select on table public.dukjil_action_log to %I', r.rolname);
  end loop;

  -- 4. checks: fail the migration instead of repeating the gap silently
  for r in
    select distinct a.proname as caller_name, h.proname as callee_name, o.rolname as run_as
    from dukjil_runas x
    join dukjil_fn a on a.oid = x.fn
    join dukjil_fn h on h.oid <> a.oid
      and (h.proname like 'dukjil\_%' or h.proname in ('record_dukjil_action', 'activate_dukjil_policy'))
      and position(h.proname in a.src) > 0 and a.src ~ ('\m' || h.proname || '\M')
    join pg_catalog.pg_roles o on o.oid = x.role_oid
    where not pg_catalog.has_function_privilege(x.role_oid, h.oid, 'EXECUTE')
  loop
    raise exception 'DUKJIL_OWNER_EXECUTE_GAP: % (running as %) cannot call %', r.caller_name, r.run_as, r.callee_name using errcode = 'P0001';
  end loop;

  for r in
    select distinct a.proname as caller_name, o.rolname as run_as
    from dukjil_runas x
    join dukjil_fn a on a.oid = x.fn and a.src ~* '(from|join)\s+(public\.)?dukjil_action_log\M'
    join pg_catalog.pg_roles o on o.oid = x.role_oid
    where not pg_catalog.has_table_privilege(x.role_oid, 'public.dukjil_action_log'::regclass, 'SELECT')
  loop
    raise exception 'DUKJIL_TABLE_PRIVILEGE_GAP: % (running as %) cannot read dukjil_action_log', r.caller_name, r.run_as using errcode = 'P0001';
  end loop;

  for r in
    select distinct o.rolname, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles o on o.oid = p.proowner
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('dukjil_wire_award', 'retry_dukjil_wire_failures', 'record_dukjil_award_failure', 'resume_dukjil_wire_failures')
      and not o.rolsuper
      and (not (pg_catalog.has_table_privilege(o.oid, 'public.dukjil_wire_failures'::regclass, 'SELECT')
          and pg_catalog.has_table_privilege(o.oid, 'public.dukjil_wire_failures'::regclass, 'INSERT')
          and pg_catalog.has_table_privilege(o.oid, 'public.dukjil_wire_failures'::regclass, 'UPDATE'))
        or (not o.rolbypassrls and not exists (
          select 1 from pg_catalog.pg_policy pol
          where pol.polrelid = 'public.dukjil_wire_failures'::regclass and o.oid = any (pol.polroles))))
  loop
    raise exception 'DUKJIL_WIRE_ACCESS_GAP: % (owner %) cannot use dukjil_wire_failures', r.proname, r.rolname using errcode = 'P0001';
  end loop;

  -- 5. rows given up only because of the missing helper right go back into the retry queue
  update public.dukjil_wire_failures set gave_up_at = null, attempts = 0
    where resolved_at is null and gave_up_at is not null
      and error_message like '%dukjil\_policy\_replaces\_earning%';
end $migration$;
