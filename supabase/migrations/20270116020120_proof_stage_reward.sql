begin;
set local lock_timeout = '5s';
alter table public.certification_submissions add column rewarded_stage_rank smallint;
create index certification_reward_stage_idx on public.certification_submissions
  (app_user_id, celebrity_id, rewarded_stage_rank desc) where rewarded_stage_rank is not null;

create function public.proof_reward_stage(p_user uuid, p_creator uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select max(rewarded_stage_rank) from public.certification_submissions submission
  where app_user_id = p_user and celebrity_id = p_creator and rewarded_stage_rank is not null
    and not exists (select 1 from public.dukjil_action_log a
      join public.passport_stamp_voids v on v.stamp_id = a.stamp_id
      where a.action_key='proof' and a.app_user_id=p_user and a.source_key=submission.id::text)
$$;
revoke all on function public.proof_reward_stage(uuid,uuid) from public, anon, authenticated, service_role;

-- Retain installed policy logic and the existing reader owners.
do $$
declare d text; old_text text; new_text text; f regprocedure; owner_name name;
begin
  for f, old_text, new_text in select * from (values
    ('public.passport_v3_tier(uuid,uuid,integer)'::regprocedure, 'greatest(base.r, ev.r)',
     'greatest(base.r, ev.r, (select public.fan_level_rank(tier_name) from public.reward_policy_tier_stages where policy_version=3 and stage_rank=public.proof_reward_stage(p_user,p_celebrity)))'),
    ('public.get_fan_passport_stage(uuid,uuid)'::regprocedure, 'select stage_key, tier_name, subdivision into st',
     'pick := greatest(pick, public.proof_reward_stage(p_user,p_celebrity)); select stage_key, tier_name, subdivision into st')
  ) patches loop
    d := pg_get_functiondef(f);
    if position(old_text in d)=0 then raise exception 'Unexpected function body %', f; end if;
    execute replace(d,old_text,new_text);
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid=f;
    execute format('grant execute on function public.proof_reward_stage(uuid,uuid) to %I',owner_name);
  end loop;
end $$;

create function public.assign_proof_reward_stage() returns trigger language plpgsql security definer set search_path = '' as $$
declare stage text;
begin
  if (select rules #>> '{actions,proof,points}' from public.dukjil_active_policy(public.dukjil_now())) = '1000' then
    stage := public.get_fan_passport_stage(new.app_user_id,new.celebrity_id)->>'stageKey';
    select coalesce(next_stage.stage_rank, current_stage.stage_rank) into strict new.rewarded_stage_rank
    from public.reward_policy_tier_stages current_stage
    left join public.reward_policy_tier_stages next_stage on next_stage.policy_version=3 and next_stage.stage_rank=current_stage.stage_rank+1
    where current_stage.policy_version=3 and current_stage.stage_key=stage;
  end if;
  return new;
end $$;
revoke all on function public.assign_proof_reward_stage() from public,anon,authenticated,service_role;
create trigger assign_proof_reward_stage before update of status on public.certification_submissions
for each row when (new.status='approved' and old.status<>new.status and new.proof_type<>'sns_post')
execute function public.assign_proof_reward_stage();

lock table public.dukjil_policy_versions in exclusive mode;
insert into public.dukjil_policy_versions(version,rules,mission_book,note)
select (select max(version)+1 from public.dukjil_policy_versions),
  jsonb_set(active.rules #- '{actions,proof,firstPoints}' #- '{actions,proof,pointCap}', '{actions,proof,points}', '1000'),
  active.mission_book,'DUKHU-CERT-REWARD-1125'
from public.dukjil_active_policy(clock_timestamp()) active where active.version is not null;
commit;
