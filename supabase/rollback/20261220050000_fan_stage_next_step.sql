-- Rollback of 20261220050000_fan_stage_next_step.sql: the three *_with_stages readers call get_fan_stage_progress(fan_stage_input(...), tier)
-- again (the 20261215090000 expression, so that file's rollback still finds it) and get_fan_passport_stage_progress is dropped.
-- Grants given to the readers' owner on tables and helpers stay. A second run stops at FAN_STAGE_NEXT_STEP_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';

do $patch$
declare p record; d text;
begin
  for p in select * from (values
    ($f$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$,
     $f$public.get_fan_stage_progress(public.fan_stage_input(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */ base.value -> 'score' ->> 'level')$f$),
    ($f$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$,
     $f$public.get_fan_stage_progress(public.fan_stage_input(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */ base.value -> 'score' ->> 'level')$f$),
    ($f$public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer, creator.value -> 'passport' ->> 'tier') /* stage-next-step 20261220050000 */$f$,
     $f$public.get_fan_stage_progress(public.fan_stage_input(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer), /* tier-source-hearts 20261215090000 */ creator.value -> 'passport' ->> 'tier')$f$)
  ) v(fn, patched, original) loop
    d := pg_get_functiondef(p.fn::regprocedure);
    if (length(d) - length(replace(d, p.patched, ''))) / length(p.patched) <> 1 then raise exception 'FAN_STAGE_NEXT_STEP_ROLLBACK_SHAPE: %', p.fn; end if;
    execute replace(d, p.patched, p.original);
  end loop;
end
$patch$;

drop function public.get_fan_passport_stage_progress(uuid, uuid, integer, text);

notify pgrst, 'reload schema';
commit;
