-- PASSPORT-RENEWAL P2 (8/8): function owner rights for the P2 objects, following the P1 42501 lesson (20261210100000_dukjil_owner_execute.sql).
-- A SECURITY DEFINER function runs as its owner. On AWS the legacy functions that P2 patched or that now call P2 helpers
-- (get_fan_effective_tier*, get_fan_score_and_effective_tier, exchange_owned_group_wallet, group_room_allowed callers) can be owned by the
-- imported 'postgres' role, while the P2 functions are owned by the migration admin role. A clean replay owns everything with one role and cannot show this.
-- Everything P2 revoked from the API roles stays revoked: only the internal (non API) owner roles get EXECUTE, and only where needed.
-- Tables: the P2 tables use ENABLE (not FORCE) row level security, so their owner is not blocked; any other owner of a P2 function gets the
-- table rights and an owner policy it would need (table rights are separate from BYPASSRLS). The final checks fail the migration instead of hiding a gap.

do $migration$
declare
  r record;
  helpers constant text[] := array['passport_hearts','passport_v3_tier','get_fan_passport_stage','passport_stage_rank','group_room_gate',
    'passport_policy_row','passport_stamp_action','group_room_allowed','get_fan_effective_tier','get_fan_effective_tier_for_score',
    'get_fan_score_and_effective_tier','fan_level_for_score','fan_level_rank','get_fan_stage_progress','passport_issue_steady_checkin','group_wallet_lock_target'];
  p2_fns constant text[] := array['assign_passport_stamp','claim_passport_page','void_passport_stamp','read_passport_roadmap','read_passport_point_reviews','passport_hearts',
    'passport_v3_tier','get_fan_passport_stage','passport_stage_rank','group_room_gate','group_room_entry','heart_conversion_dry_run',
    'heart_conversion_apply','passport_policy_row','passport_stamp_action'];
  p2_tables constant text[] := array['passport_page_slots','passport_page_claims','jjinfan_titles','creator_heart_ledger','passport_stamp_voids','fan_heart_conversions','dukjil_point_corrections','group_creator_attendance'];
  t text;
begin
  create temporary table p2_internal_owner on commit drop as
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls from pg_catalog.pg_proc p
      join pg_catalog.pg_roles o on o.oid = p.proowner
     where p.pronamespace = 'public'::regnamespace and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public');

  -- 1. EXECUTE on the helpers the legacy (other-owner) functions now call
  for r in
    select o.rolname, p.oid::regprocedure::text as sig from p2_internal_owner o
      join pg_catalog.pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = any (helpers)
     where not pg_catalog.has_function_privilege(o.role_oid, p.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;

  -- 2. callees of the P2 functions that the P2 function owner cannot execute (found by name in the function bodies)
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace and c.oid <> f.oid
        and (c.proname like 'group\_wallet\_%' or c.proname like 'dukjil\_%' or c.proname like 'fan\_level\_%' or c.proname like 'get\_fan\_%')
        and f.prosrc ~ ('\m' || c.proname || '\M')
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p2_fns) and not o.rolsuper
       and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;

  -- 3. table rights and an owner policy for P2 function owners that do not own the tables
  for r in
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls, tc.relname::text as tname
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_class tc on tc.relnamespace = 'public'::regnamespace and tc.relname = any (p2_tables)
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p2_fns) and not o.rolsuper
       and o.rolname not in ('anon', 'authenticated', 'service_role', 'public') and o.oid <> tc.relowner
  loop
    execute format('grant select, insert, update on table public.%I to %I', r.tname, r.rolname);
    if not r.rolbypassrls and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || r.tname)::regclass and r.role_oid = any (pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p2_fn_owner_' || r.rolname, r.tname, r.rolname);
    end if;
  end loop;

  -- 4. checks
  for r in
    select o.rolname, p.proname from p2_internal_owner o
      join pg_catalog.pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = any (helpers)
     where not pg_catalog.has_function_privilege(o.role_oid, p.oid, 'EXECUTE')
  loop
    raise exception 'PASSPORT_P2_OWNER_EXECUTE_GAP: role % cannot execute %', r.rolname, r.proname using errcode = 'P0001';
  end loop;

  for r in
    select distinct f.proname as caller_name, c.proname as callee_name, o.rolname
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace and c.oid <> f.oid
        and (c.proname like 'group\_wallet\_%' or c.proname like 'dukjil\_%' or c.proname like 'fan\_level\_%' or c.proname like 'get\_fan\_%')
        and f.prosrc ~ ('\m' || c.proname || '\M')
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p2_fns) and not o.rolsuper
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    raise exception 'PASSPORT_P2_OWNER_EXECUTE_GAP: % (owner %) cannot call %', r.caller_name, r.rolname, r.callee_name using errcode = 'P0001';
  end loop;

  foreach t in array p2_tables loop
    for r in
      select distinct o.rolname from pg_catalog.pg_proc f
        join pg_catalog.pg_roles o on o.oid = f.proowner
       where f.pronamespace = 'public'::regnamespace and f.proname = any (p2_fns) and not o.rolsuper
         and (not pg_catalog.has_table_privilege(o.oid, ('public.' || t)::regclass, 'SELECT')
              or (not o.rolbypassrls and o.oid <> (select relowner from pg_catalog.pg_class where oid = ('public.' || t)::regclass)
                  and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || t)::regclass and o.oid = any (pol.polroles))))
    loop
      raise exception 'PASSPORT_P2_TABLE_PRIVILEGE_GAP: owner % cannot read %', r.rolname, t using errcode = 'P0001';
    end loop;
  end loop;
end $migration$;
