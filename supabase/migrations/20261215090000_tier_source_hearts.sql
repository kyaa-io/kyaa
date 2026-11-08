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
--
-- Before applying to production (review r4c M1, M2), run both read queries; the file itself stops on the same conditions:
--   1. select count(*), count(distinct (app_user_id, celebrity_id)) from public.fan_level_events where policy_version >= 3;
--      must be 0 (TIER_SOURCE_V3_EVENTS_PRESENT): passport_v3_tier merges these point-written policy-3 events into every tier, so
--      they would keep the old point-based tier after this file. Deciding what to do with them is a user decision.
--   2. select b.id, b.minimum_level, count(a.*) filter (where a.status = 'submitted') pending from public.benefits b
--        left join public.benefit_applications a on a.benefit_id = b.id
--      where b.reward_policy_version >= 3 and b.minimum_level <> 'Bronze' and b.archived_at is null group by b.id;
--      must show no pending application (TIER_SOURCE_V3_PENDING_APPLICATIONS): an application accepted on the point tier could
--      no longer be selected on the heart tier. dev was checked read-only on 2026-11-08: both 0.
--
-- Benefit unlock notices (review r4c M3): under policy 3 the score trigger no longer sees a tier change, so a heart that lifts the
-- tier now runs the same unlock check from the heart ledger and the heart conversion record (project_heart_benefit_unlock_events).
-- Rollback: supabase/rollback/20261215090000_tier_source_hearts.sql.
begin;
set local lock_timeout = '5s';

-- Review r4c M1, M2: stop instead of changing tiers under rows the change would misread.
do $$ begin
  if exists (select 1 from public.fan_level_events where policy_version >= 3) then
    raise exception 'TIER_SOURCE_V3_EVENTS_PRESENT: % policy-3 level events would keep the point-based tier', (select count(*) from public.fan_level_events where policy_version >= 3);
  end if;
  if exists (select 1 from public.benefits b join public.benefit_applications a on a.benefit_id = b.id and a.status = 'submitted'
             where b.reward_policy_version >= 3 and b.minimum_level <> 'Bronze' and b.archived_at is null) then
    raise exception 'TIER_SOURCE_V3_PENDING_APPLICATIONS: pending applications to policy-3 tier benefits were accepted on the point tier';
  end if;
end $$;

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

-- Every other place that turns a score into a stage or tier under policy 3 (found by searching function bodies for
-- get_fan_stage_progress, fan_level_for_score, passport_v3_tier and reward_policy_tier_stages): the passport detail and collection
-- stages, the mobile passport list, the mobile favorite levels and the mobile account level. Same rule as above: hearts under
-- policy 3, the score before it. Each expression is replaced exactly once or the file stops.
create function public.fan_stage_input_creator(p_app_user_id uuid, p_celebrity_id uuid, p_score integer) returns integer
language sql stable set search_path = '' as $$
  select case when (select policy_version from public.reward_policy_activation where singleton) >= 3
    then public.passport_hearts(p_app_user_id, p_celebrity_id) else p_score end
$$;
-- The mobile account level summed points over every favorite (rule 'favorite-xp-sum-v1'). Policy 3 has no account-wide tier, so it
-- shows the member's best passport tier and that tier's stage from the most hearts on one passport; before policy 3 nothing changes.
create function public.fan_account_tier(p_app_user_id uuid, p_xp integer) returns text
language sql stable set search_path = '' as $$
  select case when (select policy_version from public.reward_policy_activation where singleton) >= 3
    then coalesce((select t.tier from public.fan_passports p join public.celebrities c on c.id = p.celebrity_id and c.primary_role <> 'brand'
                   cross join lateral (select public.get_fan_effective_tier(p.app_user_id, p.celebrity_id) tier) t
                   where p.app_user_id = p_app_user_id and p.business_status = 'issued'
                   order by public.fan_level_rank(t.tier) desc limit 1), 'Bronze')
    else public.fan_level_for_score(p_xp) end
$$;
create function public.fan_account_stage_input(p_app_user_id uuid, p_xp integer) returns integer
language sql stable set search_path = '' as $$
  select case when (select policy_version from public.reward_policy_activation where singleton) >= 3
    then coalesce((select max(public.passport_hearts(p.app_user_id, p.celebrity_id)) from public.fan_passports p
                   join public.celebrities c on c.id = p.celebrity_id and c.primary_role <> 'brand'
                   where p.app_user_id = p_app_user_id and p.business_status = 'issued'), 0)
    else p_xp end
$$;
revoke all on function public.fan_stage_input_creator(uuid, uuid, integer), public.fan_account_tier(uuid, integer),
  public.fan_account_stage_input(uuid, integer) from public, anon, authenticated, service_role;

do $$
declare p record; d text; owner_name name; helper text;
begin
  for p in select * from (values
    ($p$public.get_owned_passport_detail_with_stages(uuid,uuid,public.content_locale)$p$, $p$(base.value -> 'score' ->> 'points')::integer,$p$, $p$public.fan_stage_input(p_app_user_id, p_passport_id, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.get_owned_passport_collection_with_stages(uuid,public.content_locale)$p$, $p$(base.value -> 'score' ->> 'points')::integer,$p$, $p$public.fan_stage_input(p_app_user_id, (base.value ->> 'id')::uuid, (base.value -> 'score' ->> 'points')::integer), /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.read_owned_mobile_passports(uuid,public.content_locale)$p$, $p$public.get_fan_stage_progress(fan_xp,fan_tier)$p$, $p$public.get_fan_stage_progress(public.fan_stage_input(p_app_user_id,id,fan_xp),fan_tier) /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.read_owned_mobile_profile_levels(uuid,public.content_locale)$p$, $p$public.get_fan_stage_progress(mine.xp,mine.tier)$p$, $p$public.get_fan_stage_progress(public.fan_stage_input_creator(p_app_user_id,mine.celebrity_id,mine.xp),mine.tier) /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.mobile_profile_account_level(uuid)$p$, $p$select xp,public.fan_level_for_score(xp) tier from total$p$, $p$select xp,public.fan_account_tier(p_app_user_id,xp) tier from total /* tier-source-hearts 20261215090000 */$p$),
    ($p$public.mobile_profile_account_level(uuid)$p$, $p$'progress',public.get_fan_stage_progress(xp,tier)$p$, $p$'progress',public.get_fan_stage_progress(public.fan_account_stage_input(p_app_user_id,xp),tier)$p$)) v(fn, old_expr, new_expr) loop
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = p.fn::regprocedure;
    if not pg_has_role(current_user, owner_name, 'USAGE') then raise exception 'TIER_SOURCE: % cannot replace % owned by %', current_user, p.fn, owner_name; end if;
    d := pg_get_functiondef(p.fn::regprocedure);
    if position(p.new_expr in d) > 0 then continue; end if;
    if (length(d) - length(replace(d, p.old_expr, ''))) / length(p.old_expr) <> 1 then raise exception 'TIER_SOURCE: % expression not found exactly once in %', p.old_expr, p.fn; end if;
    execute replace(d, p.old_expr, p.new_expr);
    -- These functions run the helpers with their owner's rights.
    foreach helper in array array['public.fan_stage_input(uuid,uuid,integer)', 'public.fan_stage_input_creator(uuid,uuid,integer)',
      'public.fan_account_tier(uuid,integer)', 'public.fan_account_stage_input(uuid,integer)'] loop
      execute format('grant execute on function %s to %I', helper, owner_name);
    end loop;
  end loop;
end $$;

-- Review r4c M3: a heart that lifts the tier unlocks policy-3 benefits the way project_benefit_unlock_events does for points:
-- same conditions (published, open window, stock, unclaimed, minimum score, required stamp and activity, minimum level newly met),
-- same notice and push queue, same source key, so the two paths never notify twice.
create function public.project_heart_benefit_unlock_events() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := new.app_user_id; v_celebrity uuid := new.celebrity_id; v_at timestamptz := clock_timestamp();
  v_added integer := coalesce((to_jsonb(new) ->> 'amount')::integer, (to_jsonb(new) ->> 'hearts')::integer, 0);
  v_hearts integer; v_previous text; v_current text; v_score integer; b record; v_event uuid; v_notification uuid;
begin
  if v_added <= 0 or coalesce((select policy_version from public.reward_policy_activation where singleton), 0) < 3 then return new; end if;
  v_hearts := public.passport_hearts(v_user, v_celebrity);
  v_previous := public.passport_v3_tier(v_user, v_celebrity, greatest(v_hearts - v_added, 0));
  v_current := public.get_fan_effective_tier(v_user, v_celebrity);
  if public.fan_level_rank(v_current) <= public.fan_level_rank(v_previous) then return new; end if;
  select coalesce(sum(points), 0)::integer into v_score from public.fan_score_ledger where app_user_id = v_user and celebrity_id = v_celebrity;
  for b in
    select benefit.id, benefit.slug, benefit.revision, benefit.reward_policy_version from public.benefits benefit
    where benefit.celebrity_id = v_celebrity and benefit.publication_status = 'published' and benefit.archived_at is null
      and benefit.reward_policy_version >= 3 and v_at >= benefit.claim_opens_at and v_at < benefit.claim_closes_at
      and (benefit.stock_limit is null or (select count(*) from public.benefit_claims claim where claim.benefit_id = benefit.id) < benefit.stock_limit)
      and (benefit.delivery_type <> 'unique_code' or exists (select 1 from public.benefit_unique_codes code where code.benefit_id = benefit.id and code.claimed_by_claim_id is null))
      and not exists (select 1 from public.benefit_claims claim where claim.benefit_id = benefit.id and claim.app_user_id = v_user)
      and v_score >= benefit.minimum_score
      and public.fan_level_rank(v_current) >= public.fan_level_rank(benefit.minimum_level)
      and public.fan_level_rank(v_previous) < public.fan_level_rank(benefit.minimum_level)
      and (benefit.required_stamp_type is null or exists (select 1 from public.stamps stamp where stamp.app_user_id = v_user and stamp.celebrity_id = v_celebrity and stamp.stamp_type = benefit.required_stamp_type))
      and (benefit.required_activity_type is null or exists (select 1 from public.fan_activities activity where activity.app_user_id = v_user and activity.celebrity_id = v_celebrity and activity.activity_type = benefit.required_activity_type))
    order by benefit.id
  loop
    v_event := extensions.gen_random_uuid();
    insert into public.fan_notifications (id, app_user_id, kind, source_key, benefit_id, scheduled_for, celebrity_id, source_event_id, target_type, target_id, deep_link, payload, created_at)
    values (extensions.gen_random_uuid(), v_user, 'benefit_unlocked', 'benefit:' || b.id::text || ':policy:' || b.revision::text, b.id, v_at, v_celebrity, v_event, 'benefit', b.id, '/benefits/' || b.id::text,
      jsonb_build_object('schemaVersion', 2, 'policyVersion', b.reward_policy_version, 'celebrityId', v_celebrity, 'benefitId', b.id, 'benefitSlug', b.slug,
        'benefitPolicyVersion', b.revision, 'previousScore', v_score, 'currentScore', v_score, 'previousTier', v_previous, 'currentTier', v_current, 'source', 'hearts'), v_at)
    on conflict (app_user_id, source_key) do nothing returning id into v_notification;
    if v_notification is not null then
      insert into public.notification_delivery_outbox (notification_id, subscription_id, available_at)
      select v_notification, subscription.id, v_at from public.push_subscriptions subscription
      where subscription.app_user_id = v_user and subscription.disabled_at is null
        and coalesce((select preference.benefit_notifications from public.notification_preferences preference where preference.app_user_id = v_user), true)
      on conflict (notification_id, subscription_id) do nothing;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.project_heart_benefit_unlock_events() from public, anon, authenticated, service_role;

do $$
declare unlock_owner name := (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.project_benefit_unlock_events(uuid)'::regprocedure); t text;
begin
  -- Same owner as the point path, so it reads and writes what that one does under the same row security.
  if not pg_has_role(current_user, unlock_owner, 'USAGE') then raise exception 'TIER_SOURCE: % cannot hand the unlock function to %', current_user, unlock_owner; end if;
  execute format('alter function public.project_heart_benefit_unlock_events() owner to %I', unlock_owner);
  foreach t in array array['creator_heart_ledger', 'fan_heart_conversions'] loop
    if not pg_has_role(current_user, (select relowner from pg_class where oid = ('public.' || t)::regclass), 'USAGE') then
      raise exception 'TIER_SOURCE: % cannot add a trigger on %', current_user, t; end if;
    execute format('create trigger zz_heart_benefit_unlock after insert on public.%I for each row execute function public.project_heart_benefit_unlock_events()', t);
  end loop;
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
