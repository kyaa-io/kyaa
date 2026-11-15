update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 day' where version=1;
create table public.policy100_test_original as select * from public.dukjil_policy_versions where version=1;
