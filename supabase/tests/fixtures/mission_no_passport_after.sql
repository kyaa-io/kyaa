-- After 20261210110000: the refused payout reports and stores 0; every other path is unchanged.
\set expect ok
\ir mission_no_passport_probe.sql
do $$
begin
  if has_function_privilege('anon','public.dukjil_mission_settle_refused(text,uuid)','execute')
     or has_function_privilege('authenticated','public.dukjil_mission_settle_refused(text,uuid)','execute')
     or has_function_privilege('service_role','public.dukjil_mission_settle_refused(text,uuid)','execute')
     or has_function_privilege('anon','public.dukjil_mission_settle_backfill()','execute')
     or has_function_privilege('authenticated','public.dukjil_mission_settle_backfill()','execute')
     or has_function_privilege('service_role','public.dukjil_mission_settle_backfill()','execute') then
    raise exception 'settle helpers must not be callable by API roles'; end if;
end $$;

-- Executed rollback (revert.sql), then the old behaviour must be back and the helpers gone. Rolled back at the end.
begin;
\ir mission_no_passport_revert.sql
do $$
begin
  if to_regprocedure('public.dukjil_mission_settle_refused(text,uuid)') is not null
     or to_regprocedure('public.dukjil_mission_settle_backfill()') is not null then
    raise exception 'revert must drop both helpers'; end if;
  if pg_get_functiondef('public.dukjil_wire_event()'::regprocedure) like '%dukjil_mission_settle_refused%'
     or pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure) like '%dukjil_mission_settle_refused%'
     or pg_get_functiondef('public.group_earning_rows(uuid,uuid)'::regprocedure) like '%gp.celebrity_id is not null%' then
    raise exception 'revert must restore the three functions'; end if;
end $$;
rollback;
