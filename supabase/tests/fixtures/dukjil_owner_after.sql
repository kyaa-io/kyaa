-- After 20261210100000: same owner layout, same calls, now they must succeed and the grants stay minimal.
\set expect ok
-- the migration's own functions belong to the migration runner; on AWS that is the same non-superuser role that owns the table
grant create on schema public to dukjil_wire_owner_fixture;
alter function public.record_dukjil_award_failure(uuid, uuid, text, text, jsonb, text, text) owner to dukjil_wire_owner_fixture;
alter function public.resume_dukjil_wire_failures(uuid[]) owner to dukjil_wire_owner_fixture;
revoke create on schema public from dukjil_wire_owner_fixture;
\ir dukjil_owner_probe.sql
do $$
begin
  if not has_function_privilege('dukjil_legacy_owner_fixture','public.dukjil_policy_replaces_earning(timestamptz)','execute') then
    raise exception 'legacy owner must be able to probe the policy'; end if;
  if has_function_privilege('anon','public.dukjil_policy_replaces_earning(timestamptz)','execute')
     or has_function_privilege('authenticated','public.dukjil_policy_replaces_earning(timestamptz)','execute')
     or has_function_privilege('anon','public.dukjil_active_policy(timestamptz)','execute')
     or has_function_privilege('authenticated','public.dukjil_active_policy(timestamptz)','execute') then
    raise exception 'anon/authenticated must not gain execute'; end if;
  if not has_function_privilege('service_role','public.dukjil_policy_replaces_earning(timestamptz)','execute')
     or has_function_privilege('service_role','public.activate_dukjil_policy(integer,timestamptz)','execute') then
    raise exception 'service_role grants changed'; end if;
end $$;
do $$
declare u uuid := 'd1200000-0000-4000-8000-0000000000f1'; n integer;
begin
  if has_function_privilege('anon','public.record_dukjil_award_failure(uuid,uuid,text,text,jsonb,text,text)','execute')
     or has_function_privilege('authenticated','public.record_dukjil_award_failure(uuid,uuid,text,text,jsonb,text,text)','execute')
     or not has_function_privilege('service_role','public.record_dukjil_award_failure(uuid,uuid,text,text,jsonb,text,text)','execute') then
    raise exception 'record_dukjil_award_failure grants wrong'; end if;
  set local role service_role;
  perform public.record_dukjil_award_failure(u, null, 'post', 'src-1', '{"chars":30}'::jsonb, '42501', 'permission denied');
  perform public.record_dukjil_award_failure(u, null, 'post', 'src-1', '{"chars":30}'::jsonb, '42501', 'permission denied again');
  reset role;
  select count(*) into n from public.dukjil_wire_failures where app_user_id = u and wire = 'app' and resolved_at is null;
  if n <> 1 then raise exception 'one open failure row expected, got %', n; end if;
  delete from public.dukjil_wire_failures where false;
end $$;
-- policy only for the function owner, and no table access opened to the API roles
do $$
declare n integer;
begin
  if has_table_privilege('anon', 'public.dukjil_wire_failures', 'SELECT') or has_table_privilege('authenticated', 'public.dukjil_wire_failures', 'SELECT')
     or has_table_privilege('service_role', 'public.dukjil_wire_failures', 'SELECT') or has_table_privilege('service_role', 'public.dukjil_wire_failures', 'INSERT') then
    raise exception 'API roles must not get table access'; end if;
  select count(*) into n from pg_policy pol where pol.polrelid = 'public.dukjil_wire_failures'::regclass
    and pol.polroles <> array[(select oid from pg_roles where rolname = 'dukjil_wire_owner_fixture')];
  if n <> 0 then raise exception 'unexpected policy roles on dukjil_wire_failures'; end if;
  -- the legacy owner of live_participation_award can read the action log (table right, not BYPASSRLS)
  if not has_table_privilege('dukjil_legacy_owner_fixture', 'public.dukjil_action_log', 'SELECT')
     or has_table_privilege('dukjil_legacy_owner_fixture', 'public.dukjil_action_log', 'INSERT') then
    raise exception 'legacy owner action log right wrong'; end if;
end $$;
-- operator resume: a given-up open row goes back into the retry queue, only service_role may call it
begin;
do $$
declare u uuid := 'd1200000-0000-4000-8000-0000000000f2'; n integer; g timestamptz;
begin
  if has_function_privilege('anon','public.resume_dukjil_wire_failures(uuid[])','execute')
     or has_function_privilege('authenticated','public.resume_dukjil_wire_failures(uuid[])','execute')
     or not has_function_privilege('service_role','public.resume_dukjil_wire_failures(uuid[])','execute') then
    raise exception 'resume grants wrong'; end if;
  insert into public.dukjil_wire_failures(wire, app_user_id, action_key, source_key, error_message, attempts, gave_up_at)
    values ('app', u, 'post', 'resume-src', 'seed', 5, now());
  set local role service_role;
  n := public.resume_dukjil_wire_failures(null);
  reset role;
  select gave_up_at into g from public.dukjil_wire_failures where app_user_id = u;
  if n <> 1 or g is not null then raise exception 'resume did not reopen (n %, gave_up %)', n, g; end if;
end $$;
rollback;
