-- Merge checklist 9: every screen's tier and stage for every local passport, in one transaction that rolls back (tier history and the
-- mobile reads write or lock). Reference: the fan list / profile card tier (get_fan_effective_tier) and the passport stage
-- (get_fan_passport_stage). Compared: MY summary, passport detail, passport collection, mobile passports, mobile favorite levels,
-- tier history. A stage is compared where the screen has one; under policy 3 get_fan_stage_progress has none for 0 hearts and every
-- screen then shows the tier name alone (counted separately).
\set ON_ERROR_STOP on
\pset pager off
begin;
create temporary table tier_check as
with passports as (
  select p.id passport_id, p.app_user_id, p.celebrity_id, c.slug
  from public.fan_passports p join public.celebrities c on c.id = p.celebrity_id join public.app_users u on u.id = p.app_user_id and u.status = 'active'
), users as (select distinct app_user_id from passports),
my as (
  select u.app_user_id, x.value -> 'celebrity' ->> 'slug' slug, x.value -> 'passport' ->> 'tier' tier, x.value -> 'passport' -> 'stageProgress' -> 'current' ->> 'key' stage
  from users u, jsonb_array_elements(public.get_owned_my_fan_activity_with_stages(u.app_user_id, 'ko', now()) -> 'creators') x
  where jsonb_typeof(x.value -> 'passport') = 'object'
), collection as (
  select u.app_user_id, (c ->> 'id')::uuid passport_id, c -> 'score' ->> 'level' tier, c -> 'score' -> 'stageProgress' -> 'current' ->> 'key' stage
  from users u cross join lateral public.get_owned_passport_collection_with_stages(u.app_user_id, 'ko') c
), mobile as (
  select u.app_user_id, x -> 'favorite' ->> 'slug' slug, x ->> 'fanTier' tier, x -> 'progress' -> 'current' ->> 'key' stage
  from users u cross join lateral jsonb_array_elements(public.read_owned_mobile_passports(u.app_user_id, 'ko') -> 'passports') x where x ->> 'kind' = 'favorite'
), levels as (
  select u.app_user_id, x -> 'favorite' ->> 'slug' slug, x ->> 'tier' tier, x -> 'progress' -> 'current' ->> 'key' stage
  from users u cross join lateral jsonb_array_elements(public.read_owned_mobile_profile_levels(u.app_user_id, 'ko') -> 'favorites') x
)
select p.passport_id, p.app_user_id, p.celebrity_id, p.slug,
  public.get_fan_effective_tier(p.app_user_id, p.celebrity_id) list_tier,
  public.get_fan_passport_stage(p.app_user_id, p.celebrity_id) ->> 'tier' stage_tier,
  public.get_fan_passport_stage(p.app_user_id, p.celebrity_id) ->> 'stageKey' stage_key,
  my.tier my_tier, my.stage my_stage,
  (select d -> 'score' ->> 'level' from public.get_owned_passport_detail_with_stages(p.passport_id, p.app_user_id, 'ko') d limit 1) detail_tier,
  (select d -> 'score' -> 'stageProgress' -> 'current' ->> 'key' from public.get_owned_passport_detail_with_stages(p.passport_id, p.app_user_id, 'ko') d limit 1) detail_stage,
  col.tier collection_tier, col.stage collection_stage, mob.tier mobile_tier, mob.stage mobile_stage, lv.tier level_tier, lv.stage level_stage,
  public.passport_hearts(p.app_user_id, p.celebrity_id) hearts,
  coalesce((select sum(points)::integer from public.fan_score_ledger l where l.app_user_id = p.app_user_id and l.celebrity_id = p.celebrity_id), 0) points
from passports p
left join my on my.app_user_id = p.app_user_id and my.slug = p.slug
left join collection col on col.passport_id = p.passport_id
left join mobile mob on mob.app_user_id = p.app_user_id and mob.slug = p.slug
left join levels lv on lv.app_user_id = p.app_user_id and lv.slug = p.slug;
do $$ declare u uuid; begin
  if to_regprocedure('public.observe_fan_tiers(uuid,public.content_locale)') is null then return; end if;
  for u in select distinct app_user_id from tier_check loop perform public.observe_fan_tiers(u, 'ko'); end loop;
end $$;
alter table tier_check add column history_tier text;
update tier_check t set history_tier = (select h.tier from public.fan_tier_history h where h.passport_id = t.passport_id order by h.occurred_at desc, h.id desc limit 1)
  where to_regclass('public.fan_tier_history') is not null;
\echo '-- tiers: rows whose tier differs from the fan list (null = the screen has no row for that passport)'
select count(*) passports,
  count(*) filter (where my_tier is distinct from list_tier) my, count(*) filter (where detail_tier is distinct from list_tier) detail,
  count(*) filter (where collection_tier is distinct from list_tier) collection, count(*) filter (where mobile_tier is distinct from list_tier) mobile,
  count(*) filter (where level_tier is distinct from list_tier) mobile_levels, count(*) filter (where stage_tier is distinct from list_tier) passport_stage,
  count(*) filter (where history_tier is distinct from list_tier) history,
  count(*) filter (where my_tier is distinct from list_tier and public.fan_level_rank(my_tier) > public.fan_level_rank(list_tier)) my_higher
from tier_check;
\echo '-- stages: present and different from the passport stage / absent (0 hearts, tier name shown alone)'
select count(*) filter (where my_stage is not null and my_stage <> stage_key) my_diff, count(*) filter (where detail_stage is not null and detail_stage <> stage_key) detail_diff,
  count(*) filter (where collection_stage is not null and collection_stage <> stage_key) collection_diff, count(*) filter (where mobile_stage is not null and mobile_stage <> stage_key) mobile_diff,
  count(*) filter (where level_stage is not null and level_stage <> stage_key) levels_diff,
  count(*) filter (where my_stage is null) my_absent, count(*) filter (where detail_stage is null) detail_absent, count(*) filter (where mobile_stage is null) mobile_absent,
  count(*) filter (where (my_stage is null or detail_stage is null or collection_stage is null or mobile_stage is null or level_stage is null) and hearts > 0) absent_with_hearts
from tier_check;
select slug, list_tier, my_tier, detail_tier, mobile_tier, stage_key, my_stage, detail_stage, collection_stage, mobile_stage, level_stage, hearts, points from tier_check
  where my_tier is distinct from list_tier or detail_tier is distinct from list_tier or collection_tier is distinct from list_tier or mobile_tier is distinct from list_tier
     or level_tier is distinct from list_tier or history_tier is distinct from list_tier
     or (my_stage <> stage_key) or (detail_stage <> stage_key) or (collection_stage <> stage_key) or (mobile_stage <> stage_key) or (level_stage <> stage_key)
  order by slug limit 8;
rollback;
