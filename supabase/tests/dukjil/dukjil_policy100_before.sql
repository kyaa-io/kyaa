-- Disposable upgrade fixture: inactive policy must leave all rows unchanged.
create table public.policy100_test_inactive as select * from public.dukjil_policy_versions;
\ir ../../migrations/20261227180001_proof_uniform_100_policy.sql
do $$ begin
 assert not exists (
   (select * from public.dukjil_policy_versions except select * from public.policy100_test_inactive)
   union all
   (select * from public.policy100_test_inactive except select * from public.dukjil_policy_versions)
 );
 raise notice 'POLICY100 PASS: inactive policy no-op';
end $$;
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 day' where version=1;
create table public.policy100_test_original as select * from public.dukjil_policy_versions where version=1;
