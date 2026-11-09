-- On top of 20261220050000 (BUGS-1846 T2, mini review): the stage came from get_fan_passport_stage (hearts) while the tier label
-- (score.level of the passport readers, passport.tier of the MY summary) still came from get_fan_effective_tier_for_score(user, creator,
-- points, policy). Where that function does not read hearts under policy 3 (a database without 20261215090000's body), a fan whose heart
-- came from creator_heart_ledger saw a Silver badge beside "골드 2까지 하트 7개".
--
-- The three *_with_stages readers now also set the label from get_fan_effective_tier, the function get_fan_passport_stage and the fan
-- lists use (passport_hearts = creator_heart_ledger + fan_heart_conversions under policy 3; the point sum under 1 and 2), through
-- fan_passport_effective_tier(user, passport). The label key is added next to stageProgress, so label and stage come from one place.
-- Rollback: supabase/rollback/20261220051000_fan_tier_label_same_source.sql.
begin;
set local lock_timeout = '5s';

create or replace function public.fan_passport_effective_tier(p_app_user_id uuid, p_passport_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select public.get_fan_effective_tier(passport.app_user_id, passport.celebrity_id)
  from public.fan_passports passport
  where passport.id = p_passport_id and passport.app_user_id = p_app_user_id
$$;
comment on function public.fan_passport_effective_tier(uuid, uuid) is
  'BUGS-1846: the tier label of one owned passport, from get_fan_effective_tier (the source of get_fan_passport_stage).';
revoke all on function public.fan_passport_effective_tier(uuid, uuid) from public, anon, authenticated, service_role;

do $patch$
declare p record; d text; owner_name name;
begin
  for p in select * from (values
    ($f$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$,
     $f$, 'level', public.fan_passport_effective_tier(p_app_user_id, p_passport_id) /* tier-label 20261220051000 */$f$),
    ($f$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$,
     $f$, 'level', public.fan_passport_effective_tier(p_app_user_id, (base.value ->> 'id')::uuid) /* tier-label 20261220051000 */$f$),
    ($f$public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer, creator.value -> 'passport' ->> 'tier') /* stage-next-step 20261220050000 */$f$,
     $f$, 'tier', public.fan_passport_effective_tier(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid) /* tier-label 20261220051000 */$f$)
  ) v(fn, stage_call, label_pair) loop
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = p.fn::regprocedure;
    if not pg_has_role(current_user, owner_name, 'USAGE') then raise exception 'FAN_TIER_LABEL: % cannot replace % owned by %', current_user, p.fn, owner_name; end if;
    if owner_name in ('anon', 'authenticated', 'service_role') then raise exception 'FAN_TIER_LABEL_OWNER_GAP: % may not own %', owner_name, p.fn; end if;
    d := pg_get_functiondef(p.fn::regprocedure);
    if position(p.stage_call || p.label_pair in d) = 0 then
      if (length(d) - length(replace(d, p.stage_call, ''))) / length(p.stage_call) <> 1 then
        raise exception 'FAN_TIER_LABEL_SHAPE: % does not hold the 20261220050000 stage call', p.fn;
      end if;
      execute replace(d, p.stage_call, p.stage_call || p.label_pair);
    end if;
    execute format('grant execute on function public.fan_passport_effective_tier(uuid,uuid) to %I', owner_name);
  end loop;
end
$patch$;

-- The helper runs with each reader's owner's rights: it reads fan_passports and calls get_fan_effective_tier.
do $access$
declare o record; c pg_catalog.pg_class; gaps text[] := '{}';
begin
  for o in select distinct r.oid role_oid, r.rolname, r.rolsuper, r.rolbypassrls from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid in ('public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)'::regprocedure,
                    'public.get_owned_passport_collection_with_stages(uuid,public.content_locale)'::regprocedure,
                    'public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)'::regprocedure) loop
    if o.rolsuper then continue; end if;
    select * into c from pg_catalog.pg_class where oid = 'public.fan_passports'::regclass;
    if c.relowner <> o.role_oid and not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then
      begin execute format('grant select on table public.fan_passports to %I', o.rolname); exception when insufficient_privilege then null; end;
    end if;
    if not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on fan_passports', o.rolname); end if;
    if not o.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> o.role_oid)
       and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = c.oid and o.role_oid = any (pol.polroles) and pol.polpermissive and pol.polcmd in ('r', '*')) then
      gaps := gaps || format('%s has no read policy on fan_passports', o.rolname);
    end if;
    if not pg_catalog.has_function_privilege(o.role_oid, 'public.get_fan_effective_tier(uuid,uuid)'::regprocedure, 'execute') then
      begin execute format('grant execute on function public.get_fan_effective_tier(uuid,uuid) to %I', o.rolname); exception when insufficient_privilege then null; end;
    end if;
    if not pg_catalog.has_function_privilege(o.role_oid, 'public.get_fan_effective_tier(uuid,uuid)'::regprocedure, 'execute') then
      gaps := gaps || format('%s cannot execute get_fan_effective_tier', o.rolname);
    end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'FAN_TIER_LABEL_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
