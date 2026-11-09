-- Rollback of 20261220051000_fan_tier_label_same_source.sql: the readers take the tier label from their base projection again and
-- fan_passport_effective_tier is dropped. Grants given to the readers' owner stay. A second run stops at FAN_TIER_LABEL_ROLLBACK_SHAPE.
-- Roll this back before 20261220050000.
begin;
set local lock_timeout = '5s';

do $patch$
declare p record; d text;
begin
  for p in select * from (values
    ($f$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$f$,
     $f$, 'level', public.fan_passport_effective_tier(p_app_user_id, p_passport_id) /* tier-label 20261220051000 */$f$),
    ($f$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$f$,
     $f$, 'level', public.fan_passport_effective_tier(p_app_user_id, (base.value ->> 'id')::uuid) /* tier-label 20261220051000 */$f$),
    ($f$public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)$f$,
     $f$, 'tier', public.fan_passport_effective_tier(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid) /* tier-label 20261220051000 */$f$)
  ) v(fn, label_pair) loop
    d := pg_get_functiondef(p.fn::regprocedure);
    if (length(d) - length(replace(d, p.label_pair, ''))) / length(p.label_pair) <> 1 then raise exception 'FAN_TIER_LABEL_ROLLBACK_SHAPE: %', p.fn; end if;
    execute replace(d, p.label_pair, '');
  end loop;
end
$patch$;

drop function public.fan_passport_effective_tier(uuid, uuid);

notify pgrst, 'reload schema';
commit;
