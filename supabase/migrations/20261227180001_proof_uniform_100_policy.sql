-- Copy only the policy currently in effect; activation is a separate supervised step.
begin;
set local lock_timeout = '5s';
lock table public.dukjil_policy_versions in exclusive mode;
do $$
declare source public.dukjil_policy_versions;
begin
  select * into source from public.dukjil_active_policy(clock_timestamp());
  if source.version is null then
    raise notice 'DUKJIL_POLICY_INACTIVE: no policy draft created';
    return;
  end if;
  if (source.rules #>> '{actions,proof,points}')::integer is distinct from 100 then
    raise exception 'DUKJIL_PROOF_POINTS_NOT_100';
  end if;
  if exists (
    select 1 from public.dukjil_policy_versions
    where status = 'draft'
      and rules = source.rules #- '{actions,proof,firstPoints}'
      and mission_book = source.mission_book
  ) then
    raise notice 'DUKJIL_POLICY100_DRAFT_EXISTS';
    return;
  end if;
  insert into public.dukjil_policy_versions(version, rules, mission_book, note)
  select coalesce(max(version), 0) + 1,
    source.rules #- '{actions,proof,firstPoints}', source.mission_book,
    'FB-N14-POLICY100: uniform proof points; activate separately with replace_dukjil_policy at next KST midnight'
  from public.dukjil_policy_versions;
end $$;
commit;
