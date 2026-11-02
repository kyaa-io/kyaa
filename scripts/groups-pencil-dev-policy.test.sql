\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end $$;
set byus.groups_pencil_dev='SEED_GROUPS_PENCIL_DEV_ONLY';
set byus.groups_pencil_operator='{"Account":"996702758024","Arn":"arn:aws:iam::996702758024:user/local-test"}';
\getenv fixture_repo PWD
create temp table fixture_policy_source as select regexp_replace(pg_read_file(:'fixture_repo'||'/scripts/fixtures/groups-pencil-dev-policy.sql'),'(?m)^begin;|^commit;','','g')sql;
do $$declare original text:=current_setting('byus.groups_pencil_operator');bad text;begin
 foreach bad in array array['{}','{"Account":"996702758024"}','{"Arn":"arn:aws:iam::996702758024:user/test"}']loop
  perform set_config('byus.groups_pencil_operator',bad,false);
  begin execute(select sql from fixture_policy_source);raise exception 'Missing principal accepted';
  exception when raise_exception then if sqlerrm<>'DEV_FIXTURE_OPERATOR_REQUIRED'then raise;end if;end;
 end loop;
 perform set_config('byus.groups_pencil_operator',original,false);
end $$;
create temp table policy_before as select to_jsonb(a)row from public.reward_policy_activation a;
\ir fixtures/groups-pencil-dev-policy.sql
do $$begin if(select row from policy_before)is distinct from(select to_jsonb(a)from public.reward_policy_activation a)then raise exception 'Healthy policy changed';end if;end $$;
-- Reproduce the observed empty dev bootstrap only in this disposable test database.
set session_replication_role=replica;
delete from public.reward_policy_activation_audit;
delete from public.reward_policy_activation;
delete from public.reward_policy_tier_milestones;
delete from public.reward_policy_versions;
set session_replication_role=origin;
\ir fixtures/groups-pencil-dev-policy.sql
create temp table recovered_before as select to_jsonb(a)row from public.reward_policy_activation a;
\ir fixtures/groups-pencil-dev-policy.sql
do $$begin
 if(select row from recovered_before)is distinct from(select to_jsonb(a)from public.reward_policy_activation a)then raise exception 'Recovery replay changed activation';end if;
 if(select count(*)from public.audit_logs where action='dev.reward_policy.bootstrap_recovered')<>1 or exists(select 1 from public.reward_policy_activation_audit)then raise exception 'Recovery provenance incorrect';end if;
 if not exists(select 1 from public.reward_policy_activation where policy_version=2 and actor_app_user_id is null and effective_at>=current_date)then raise exception 'Recovery activation incorrect';end if;
end $$;
\ir groups-pencil-dev-economy.test.sql
