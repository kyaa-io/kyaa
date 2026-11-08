-- Rollback of 20261215090000_tier_source_hearts: the score callers pass their point sum to passport_v3_tier again (MY shows the
-- point-based tier). Grants given to callers' owners stay (harmless).
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
drop function if exists public.fan_stage_input(uuid, uuid, integer);
notify pgrst, 'reload schema';
commit;
