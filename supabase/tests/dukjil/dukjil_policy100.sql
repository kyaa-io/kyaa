-- Run after the policy100 migration in a disposable upgrade database.
begin;
do $$
declare old public.dukjil_policy_versions; new public.dukjil_policy_versions;
begin
 select * into old from public.policy100_test_original;
 select * into new from public.dukjil_policy_versions order by version desc limit 1;
 assert new.status='draft';
 assert new.rules = old.rules #- '{actions,proof,firstPoints}';
 assert new.mission_book = old.mission_book;
 assert new.rules #>> '{actions,proof,points}' = '100';
 assert new.rules #>> '{actions,proof,pointCap,max}' = '2';
 assert (select rules=old.rules from public.dukjil_policy_versions where version=old.version);
 perform public.replace_dukjil_policy(new.version);
 assert (select version=old.version from public.dukjil_active_policy());
 assert (select version=new.version from public.dukjil_active_policy(((public.dukjil_kst_date()+1)::timestamp at time zone 'Asia/Seoul')));
end $$;
rollback;
