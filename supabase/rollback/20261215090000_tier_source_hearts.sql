-- Rollback of 20261215090000_tier_source_hearts: the score callers pass their point sum to passport_v3_tier again (MY, the passport
-- and mobile stages show the point-based tier) and hearts no longer unlock benefits. Grants given to callers' owners stay (harmless).
-- Caution (review r4c L3): tier history keeps reading get_fan_effective_tier (20261215060000) and keeps its 'correction' rows, so
-- after this rollback MY shows the point tier while the passport's tier history shows the heart tier. No rise or dialog is created.
begin;
set local lock_timeout = '5s';
do $$
declare d text;
  old_expr text := 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, p_score)';
  new_expr text := 'public.passport_v3_tier(p_app_user_id, p_celebrity_id, public.passport_hearts(p_app_user_id, p_celebrity_id)) /* tier-source-hearts 20261215090000 */';
begin
  d := pg_get_functiondef('public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure);
  if position(new_expr in d) = 0 then return; end if;
  execute replace(d, new_expr, old_expr);
end $$;
do $$
declare d text;
  old_expr text := $e$(creator.value -> 'passport' ->> 'score')::integer,$e$;
  new_expr text := $e$public.fan_stage_input(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer), /* tier-source-hearts 20261215090000 */$e$;
begin
  d := pg_get_functiondef('public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)'::regprocedure);
  if position(new_expr in d) > 0 then execute replace(d, new_expr, old_expr); end if;
end $$;
do $$
declare p record; d text;
begin
  for p in select * from (values
    ($p$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$p$, $p$(base.value -> 'score' ->> 'points')::integer,$p$, $p$public.fan_stage_input(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$p$, $p$(base.value -> 'score' ->> 'points')::integer,$p$, $p$public.fan_stage_input(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.read_owned_mobile_passports(uuid,public.content_locale)$p$, $p$public.get_fan_stage_progress(fan_xp,fan_tier)$p$, $p$public.get_fan_stage_progress(public.fan_stage_input(p_app_user_id,id,fan_xp),fan_tier) /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.read_owned_mobile_profile_levels(uuid,public.content_locale)$p$, $p$public.get_fan_stage_progress(mine.xp,mine.tier)$p$, $p$public.get_fan_stage_progress(public.fan_stage_input_creator(p_app_user_id,mine.celebrity_id,mine.xp),mine.tier) /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.mobile_profile_account_level(uuid)$p$, $p$select xp,public.fan_level_for_score(xp) tier from total$p$, $p$select xp,public.fan_account_tier(p_app_user_id,xp) tier from total /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.mobile_profile_account_level(uuid)$p$, $p$'progress',public.get_fan_stage_progress(xp,tier)$p$, $p$'progress',public.get_fan_stage_progress(public.fan_account_stage_input(p_app_user_id,xp),tier)$p$)) v(fn, old_expr, new_expr) loop
    d := pg_get_functiondef(p.fn::regprocedure);
    if position(p.new_expr in d) > 0 then execute replace(d, p.new_expr, p.old_expr); end if;
  end loop;
end $$;
drop function if exists public.fan_account_stage_input(uuid, integer);
drop function if exists public.fan_account_tier(uuid, integer);
drop function if exists public.fan_stage_input_creator(uuid, uuid, integer);
drop trigger if exists zz_heart_benefit_unlock on public.creator_heart_ledger;
drop trigger if exists zz_heart_benefit_unlock on public.fan_heart_conversions;
drop function if exists public.project_heart_benefit_unlock_events();
drop function if exists public.fan_stage_input(uuid, uuid, integer);
notify pgrst, 'reload schema';
commit;
