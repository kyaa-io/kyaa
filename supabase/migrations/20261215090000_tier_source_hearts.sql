-- 261107-2 merge checklist 9: one tier source. Under policy 3 the tier is hearts (passport_hearts = creator_heart_ledger
-- + fan_heart_conversions) with the filled-stamp-slot rule for Silver (contract head of 20261210134000). get_fan_effective_tier,
-- get_fan_passport_stage and get_fan_score_and_effective_tier pass passport_hearts to passport_v3_tier, but
-- get_fan_effective_tier_for_score passed its p_score argument, and its callers (the MY summary get_owned_my_fan_activity_before_fan_web,
-- the passport detail and collection, benefit eligibility, admin fan lists and analytics) give it the fan_score_ledger point sum.
-- Points stood in for hearts, so MY showed a higher tier than the fan list for 121 of 252 local passports.
--
-- Fix at the one place every score caller goes through: under policy 3 the function now ignores p_score and asks passport_hearts.
-- Policies 1 and 2 are unchanged. The body is patched in place (its owner, invoker rights and grants stay); the patch stops if the
-- expected expression is not found, so a changed definition is never half-patched.
--
-- Effect: under policy 3, members whose point sum was above their hearts see a lower tier on MY, the passport and benefit checks
-- (the tier the fan list and profile card already showed). Tier history (20261215060000) reads get_fan_effective_tier; history written
-- before this file gets a seen 'correction' row, so this change records no rise and shows no celebration.
-- Rollback: supabase/rollback/20261215090000_tier_source_hearts.sql.
begin;
set local lock_timeout = '5s';

do $$
declare d text; owner_name name;
  old_expr text := 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, p_score)';
  new_expr text := 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, public.passport_hearts(p_app_user_id, p_celebrity_id)) /* tier-source-hearts 20261215090000 */';
begin
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = 'public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure;
  -- In dev the function belongs to postgres and the applying role is a member of it; anyone else cannot replace it.
  if not pg_has_role(current_user, owner_name, 'USAGE') then raise exception 'TIER_SOURCE: % cannot replace a function owned by %', current_user, owner_name; end if;
  d := pg_get_functiondef('public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure);
  if position('tier-source-hearts' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, old_expr, ''))) / length(old_expr) <> 1 then raise exception 'TIER_SOURCE: expected expression not found exactly once'; end if;
  execute replace(d, old_expr, new_expr);
end $$;

-- The function runs with its callers' rights: every owner of a definer that calls it needs passport_hearts (same cause as 20261212030000).
do $$ declare caller_owner name; target_owner name := (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.passport_hearts(uuid,uuid)'::regprocedure); begin
  for caller_owner in select distinct pg_get_userbyid(p.proowner) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prosrc ~ 'get_fan_effective_tier_for_score\s*\(' loop
    if caller_owner in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner %', caller_owner; end if;
    if caller_owner <> target_owner then execute format('grant execute on function public.passport_hearts(uuid,uuid) to %I', caller_owner); end if;
  end loop;
end $$;

-- The MY summary's stage (get_owned_my_fan_activity_with_stages -> get_fan_stage_progress(score, tier)) also received the point sum;
-- under policy 3 the stage minimums are heart counts, so 150 points read as diamond-1 under a Gold badge. The stage input is now
-- the passport's hearts under policy 3 and the score before it.
create function public.fan_stage_input(p_app_user_id uuid, p_passport_id uuid, p_score integer) returns integer
language sql stable set search_path = '' as $$
  select case when (select policy_version from public.reward_policy_activation where singleton) >= 3
    then coalesce((select public.passport_hearts(fp.app_user_id, fp.celebrity_id) from public.fan_passports fp
                   where fp.id = p_passport_id and fp.app_user_id = p_app_user_id), 0)
    else p_score end
$$;
revoke all on function public.fan_stage_input(uuid, uuid, integer) from public, anon, authenticated, service_role;

do $$
declare d text; owner_name name;
  old_expr text := $e$(creator.value -> 'passport' ->> 'score')::integer,$e$;
  new_expr text := $e$public.fan_stage_input(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer), /* tier-source-hearts 20261215090000 */$e$;
begin
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = 'public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)'::regprocedure;
  if not pg_has_role(current_user, owner_name, 'USAGE') then raise exception 'TIER_SOURCE: % cannot replace a function owned by %', current_user, owner_name; end if;
  d := pg_get_functiondef('public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)'::regprocedure);
  if position('tier-source-hearts' in d) = 0 then
    if (length(d) - length(replace(d, old_expr, ''))) / length(old_expr) <> 1 then raise exception 'TIER_SOURCE: MY stage expression not found exactly once'; end if;
    execute replace(d, old_expr, new_expr);
  end if;
  -- The MY function (a definer) runs the helper with its owner's rights.
  execute format('grant execute on function public.fan_stage_input(uuid,uuid,integer) to %I', owner_name);
end $$;

-- Tier history written before this file (only where 20261215060000 was already in use) may end on the point-based tier. The new
-- source is a correction, not a rise or a drop the fan caused: a seen 'correction' row takes the history to the corrected tier, so the
-- next observation records nothing and no dialog opens.
do $$ begin
  if to_regclass('public.fan_tier_history') is null then return; end if;
  insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, seen_at)
  select l.app_user_id, l.celebrity_id, l.passport_id, 'correction', l.tier, n.tier, clock_timestamp()
  from (select distinct on (h.passport_id) h.* from public.fan_tier_history h order by h.passport_id, h.occurred_at desc, h.id desc) l
  join public.fan_passports fp on fp.id = l.passport_id
  cross join lateral (select public.get_fan_effective_tier(fp.app_user_id, fp.celebrity_id) tier) n
  where n.tier is not null and n.tier <> l.tier;
  -- A rise recorded on the old source and not yet shown is closed too.
  update public.fan_tier_history set seen_at = clock_timestamp() where seen_at is null;
end $$;

notify pgrst, 'reload schema';
commit;
