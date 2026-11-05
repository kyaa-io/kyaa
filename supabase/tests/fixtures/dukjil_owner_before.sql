-- Reproduce the AWS owner layout before 20261210100000: the legacy functions that P1 patched belong to a role other than
-- the one that owns (and alone may execute) the Dukjil policy helpers.
create role dukjil_legacy_owner_fixture nologin bypassrls;
grant usage on schema public, extensions to dukjil_legacy_owner_fixture;
grant create on schema public to dukjil_legacy_owner_fixture;
grant execute on all functions in schema public to dukjil_legacy_owner_fixture;
grant select, insert, update, delete on all tables in schema public to dukjil_legacy_owner_fixture;
grant usage, select on all sequences in schema public to dukjil_legacy_owner_fixture;
revoke all on function public.dukjil_policy_replaces_earning(timestamptz) from dukjil_legacy_owner_fixture;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname in ('assert_community_stamp_source',
      'assert_community_stamp_blockchain_job_link','award_mobile_fan_activity','guard_qualified_community_stamp_invitation',
      'qualify_community_stamp_invitation_on_quiz_pass','validate_fan_score_weight','issue_community_stamp','live_participation_award')
  loop execute format('alter function %s owner to dukjil_legacy_owner_fixture', r.sig); end loop;
  if has_function_privilege('dukjil_legacy_owner_fixture','public.dukjil_policy_replaces_earning(timestamptz)','execute') then
    raise exception 'fixture must reproduce the missing helper grant'; end if;
end $$;
revoke create on schema public from dukjil_legacy_owner_fixture;
-- dev: the legacy owner cannot read the action log although live_participation_award (its function) does (BYPASSRLS is no table right)
revoke select, insert, update, delete on public.dukjil_action_log from dukjil_legacy_owner_fixture;
-- dev: the failure table and the wire functions belong to a role that is neither superuser nor BYPASSRLS (byus_admin on AWS)
create role dukjil_wire_owner_fixture nologin;
grant usage on schema public, extensions to dukjil_wire_owner_fixture;
grant create on schema public to dukjil_wire_owner_fixture;
grant execute on all functions in schema public to dukjil_wire_owner_fixture;
do $$
declare r record;
begin
  alter table public.dukjil_wire_failures owner to dukjil_wire_owner_fixture;
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname in ('dukjil_wire_award','retry_dukjil_wire_failures')
  loop execute format('alter function %s owner to dukjil_wire_owner_fixture', r.sig); end loop;
  if (select rolsuper or rolbypassrls from pg_roles where rolname='dukjil_wire_owner_fixture') then
    raise exception 'wire owner fixture must have neither superuser nor BYPASSRLS'; end if;
end $$;
revoke create on schema public from dukjil_wire_owner_fixture;
\set expect fail
\ir dukjil_owner_probe.sql
