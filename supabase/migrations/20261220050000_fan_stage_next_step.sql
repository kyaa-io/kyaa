-- BUGS-1846 T2: one source for "how far to the next stage". Under policy 3 get_fan_stage_progress returned null for Bronze and Silver
-- (their next stage has the same minimum 0, because those stages are reached by filled mission slots, not hearts). The passport detail
-- then fell back to the v2 point table in the web server ("골드까지 50점") and the MY summary to a hearts milestone minus ledger points
-- ("골드까지 1점"): the same fan saw two answers.
--
-- get_fan_passport_stage_progress(user, passport, score, effective tier) answers for every stage, with the unit of the remaining amount:
--   policy 3: the current stage is get_fan_passport_stage (the stage the room gates use). The next stage is the next rank.
--     silver-1 and silver-2 are reached by filled slots (3 and 6, the rule of passport_v3_tier and get_fan_passport_stage): unit 'stamps'.
--     gold-1 and above are reached by hearts (reward_policy_tier_stages.minimum_score): unit 'hearts'.
--   policy 1 and 2: get_fan_stage_progress unchanged, unit 'points'.
-- The passport detail, the passport collection and the MY summary (all *_with_stages) read only this function. Mobile readers are unchanged.
-- Rollback: supabase/rollback/20261220050000_fan_stage_next_step.sql.
begin;
set local lock_timeout = '5s';

create or replace function public.get_fan_passport_stage_progress(p_app_user_id uuid, p_passport_id uuid, p_score integer, p_effective_tier text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  pol integer; celebrity uuid; stage jsonb; hearts integer; slots integer; cur record; nxt record;
  unit text; remaining integer; percent integer; base_slots integer; target_slots integer; legacy jsonb;
begin
  select activation.policy_version into pol from public.reward_policy_activation activation where activation.singleton = true;
  if pol is null then return null; end if;
  if pol < 3 then
    legacy := public.get_fan_stage_progress(p_score, p_effective_tier);
    return case when legacy is null then null else legacy || jsonb_build_object('unit', 'points') end;
  end if;
  select passport.celebrity_id into celebrity from public.fan_passports passport
   where passport.id = p_passport_id and passport.app_user_id = p_app_user_id;
  if celebrity is null then return null; end if;
  stage := public.get_fan_passport_stage(p_app_user_id, celebrity);
  hearts := coalesce((stage ->> 'hearts')::integer, 0);
  select count(*)::integer into slots from public.passport_page_slots slot join public.fan_passports passport on passport.id = slot.passport_id
   where passport.app_user_id = p_app_user_id and passport.celebrity_id = celebrity and slot.stamp_id is not null;
  select * into cur from public.reward_policy_tier_stages s where s.policy_version = pol and s.stage_key = stage ->> 'stageKey';
  if not found then return null; end if;
  select * into nxt from public.reward_policy_tier_stages s where s.policy_version = pol and s.stage_rank = cur.stage_rank + 1;
  if not found then
    unit := 'hearts'; remaining := 0; percent := 100;
  elsif nxt.minimum_score = 0 then
    -- Same numbers as passport_v3_tier (3 slots: Silver) and get_fan_passport_stage (6 slots: silver-2).
    target_slots := case nxt.stage_key when 'silver-1' then 3 when 'silver-2' then 6 end;
    if target_slots is null then raise exception 'FAN_STAGE_NEXT_STEP_SHAPE: % has no slot rule', nxt.stage_key; end if;
    base_slots := case cur.stage_key when 'silver-1' then 3 else 0 end;
    unit := 'stamps'; remaining := greatest(target_slots - slots, 0);
    percent := greatest(0, least(100, floor((slots - base_slots)::numeric * 100 / greatest(target_slots - base_slots, 1))::integer));
  else
    unit := 'hearts'; remaining := greatest(nxt.minimum_score - hearts, 0);
    percent := greatest(0, least(100, floor((hearts - cur.minimum_score)::numeric * 100 / greatest(nxt.minimum_score - cur.minimum_score, 1))::integer));
  end if;
  return jsonb_build_object(
    'policyVersion', pol,
    'current', jsonb_build_object('key', cur.stage_key, 'tier', cur.tier_name, 'subdivision', cur.subdivision, 'rank', cur.stage_rank, 'minimumScore', cur.minimum_score),
    'next', case when nxt.stage_key is null then null else jsonb_build_object('key', nxt.stage_key, 'tier', nxt.tier_name, 'subdivision', nxt.subdivision, 'rank', nxt.stage_rank, 'minimumScore', nxt.minimum_score) end,
    'remaining', remaining, 'progressPercent', percent, 'unit', unit);
end
$$;
comment on function public.get_fan_passport_stage_progress(uuid, uuid, integer, text) is
  'BUGS-1846: current stage, next stage and the remaining amount with its unit (stamps | hearts | points) for one owned passport.';
revoke all on function public.get_fan_passport_stage_progress(uuid, uuid, integer, text) from public, anon, authenticated, service_role;

-- The three readers call it in place of get_fan_stage_progress(fan_stage_input(...), tier). The call is cut out by position (it spans
-- lines) and must be found exactly once; a reader already patched is left alone.
do $patch$
declare p record; d text; owner_name name; start_at integer; tier_at integer; close_at integer; old_call text;
begin
  for p in select * from (values
    ($f$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$f$,
     $f$public.fan_stage_input(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$f$,
     $f$base.value -> 'score' ->> 'level'$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$),
    ($f$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$f$,
     $f$public.fan_stage_input(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$f$,
     $f$base.value -> 'score' ->> 'level'$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer, base.value -> 'score' ->> 'level') /* stage-next-step 20261220050000 */$f$),
    ($f$public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)$f$,
     $f$public.fan_stage_input(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer), /* tier-source-hearts 20261215090000 */$f$,
     $f$creator.value -> 'passport' ->> 'tier'$f$,
     $f$public.get_fan_passport_stage_progress(p_app_user_id, (creator.value -> 'passport' ->> 'id')::uuid, (creator.value -> 'passport' ->> 'score')::integer, creator.value -> 'passport' ->> 'tier') /* stage-next-step 20261220050000 */$f$)
  ) v(fn, input_expr, tier_expr, new_call) loop
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = p.fn::regprocedure;
    if not pg_has_role(current_user, owner_name, 'USAGE') then raise exception 'FAN_STAGE_NEXT_STEP: % cannot replace % owned by %', current_user, p.fn, owner_name; end if;
    if owner_name in ('anon', 'authenticated', 'service_role') then raise exception 'FAN_STAGE_NEXT_STEP_OWNER_GAP: % may not own %', owner_name, p.fn; end if;
    d := pg_get_functiondef(p.fn::regprocedure);
    if position(p.new_call in d) = 0 then
      if (length(d) - length(replace(d, 'public.get_fan_stage_progress(', ''))) / length('public.get_fan_stage_progress(') <> 1
         or (length(d) - length(replace(d, p.input_expr, ''))) / length(p.input_expr) <> 1 then
        raise exception 'FAN_STAGE_NEXT_STEP_SHAPE: % does not hold the expected stage call', p.fn;
      end if;
      start_at := position('public.get_fan_stage_progress(' in d);
      tier_at := start_at + position(p.tier_expr in substr(d, start_at)) - 1;
      close_at := tier_at + length(p.tier_expr) - 1 + position(')' in substr(d, tier_at + length(p.tier_expr)));
      old_call := substr(d, start_at, close_at - start_at + 1);
      -- Compared without whitespace: the call must be exactly get_fan_stage_progress(<input>, <tier>).
      if regexp_replace(old_call, '\s+', '', 'g')
         <> regexp_replace('public.get_fan_stage_progress(' || p.input_expr || p.tier_expr || ')', '\s+', '', 'g') then
        raise exception 'FAN_STAGE_NEXT_STEP_SHAPE: unexpected stage call in %: %', p.fn, old_call;
      end if;
      execute overlay(d placing p.new_call from start_at for length(old_call));
    end if;
    -- The readers are definers: the helper (invoker rights) runs as their owner.
    execute format('grant execute on function public.get_fan_passport_stage_progress(uuid,uuid,integer,text) to %I', owner_name);
  end loop;
end
$patch$;

-- The helper reads these as each reader's owner. Grant what is missing; stop when the owner still cannot read.
do $access$
declare o record; c pg_catalog.pg_class; t text; f text; gaps text[] := '{}';
begin
  for o in select distinct r.oid role_oid, r.rolname, r.rolsuper, r.rolbypassrls from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid in ('public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)'::regprocedure,
                    'public.get_owned_passport_collection_with_stages(uuid,public.content_locale)'::regprocedure,
                    'public.get_owned_my_fan_activity_with_stages(uuid,public.content_locale,timestamp with time zone)'::regprocedure) loop
    if o.rolsuper then continue; end if;
    foreach t in array array['reward_policy_activation', 'fan_passports', 'passport_page_slots', 'reward_policy_tier_stages'] loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> o.role_oid and not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then
        begin execute format('grant select on table public.%I to %I', t, o.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', o.rolname, t); end if;
      if not o.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> o.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = c.oid and o.role_oid = any (pol.polroles) and pol.polpermissive and pol.polcmd in ('r', '*')) then
        gaps := gaps || format('%s has no read policy on %s', o.rolname, t);
      end if;
    end loop;
    foreach f in array array['public.get_fan_passport_stage(uuid,uuid)', 'public.get_fan_stage_progress(integer,text)'] loop
      if not pg_catalog.has_function_privilege(o.role_oid, f::regprocedure, 'execute') then
        begin execute format('grant execute on function %s to %I', f, o.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not pg_catalog.has_function_privilege(o.role_oid, f::regprocedure, 'execute') then gaps := gaps || format('%s cannot execute %s', o.rolname, f); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'FAN_STAGE_NEXT_STEP_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
