-- Merge checklist 9: every screen's tier for every local passport, from one transaction that rolls back (tier history writes rows).
-- MY summary (with stages), fan list / profile card (get_fan_effective_tier), passport stage (get_fan_passport_stage), tier history.
\set ON_ERROR_STOP on
\pset pager off
begin;
create temporary table tier_check as
with passports as (
  select p.id passport_id, p.app_user_id, p.celebrity_id, c.slug
  from public.fan_passports p join public.celebrities c on c.id = p.celebrity_id join public.app_users u on u.id = p.app_user_id and u.status = 'active'
), users as (select distinct app_user_id from passports),
my as (
  select u.app_user_id, x.value -> 'celebrity' ->> 'slug' slug, x.value -> 'passport' ->> 'tier' tier, x.value -> 'passport' -> 'stageProgress' -> 'current' ->> 'key' stage_key
  from users u, jsonb_array_elements(public.get_owned_my_fan_activity_with_stages(u.app_user_id, 'ko', now()) -> 'creators') x
  where x.value -> 'passport' is not null and jsonb_typeof(x.value -> 'passport') = 'object'
)
select p.passport_id, p.app_user_id, p.slug,
  my.tier my_tier, public.get_fan_effective_tier(p.app_user_id, p.celebrity_id) list_tier,
  public.get_fan_passport_stage(p.app_user_id, p.celebrity_id) ->> 'tier' stage_tier,
  my.stage_key my_stage, public.get_fan_passport_stage(p.app_user_id, p.celebrity_id) ->> 'stageKey' stage_key,
  public.passport_hearts(p.app_user_id, p.celebrity_id) hearts,
  coalesce((select sum(points)::integer from public.fan_score_ledger l where l.app_user_id = p.app_user_id and l.celebrity_id = p.celebrity_id), 0) points
from passports p left join my on my.app_user_id = p.app_user_id and my.slug = p.slug;
-- Tier history: observe every holder once, then the passport's newest row.
do $$ declare u uuid; begin
  if to_regprocedure('public.observe_fan_tiers(uuid,public.content_locale)') is null then return; end if;
  for u in select distinct app_user_id from tier_check loop perform public.observe_fan_tiers(u, 'ko'); end loop;
end $$;
alter table tier_check add column history_tier text;
update tier_check t set history_tier = (select h.tier from public.fan_tier_history h where h.passport_id = t.passport_id order by h.occurred_at desc, h.id desc limit 1)
  where to_regclass('public.fan_tier_history') is not null;
select count(*) passports,
  count(*) filter (where my_tier is distinct from list_tier) my_vs_list,
  count(*) filter (where my_tier is distinct from list_tier and public.fan_tier_rank(my_tier) > public.fan_tier_rank(list_tier)) my_higher,
  count(*) filter (where stage_tier is distinct from list_tier) stage_vs_list,
  count(*) filter (where history_tier is distinct from list_tier) history_vs_list,
  count(*) filter (where my_stage is distinct from stage_key) my_stage_vs_passport_stage,
  count(*) filter (where my_tier is null) my_missing
from tier_check;
select slug, my_tier, list_tier, stage_tier, history_tier, my_stage, stage_key, hearts, points from tier_check
  where my_tier is distinct from list_tier or stage_tier is distinct from list_tier or history_tier is distinct from list_tier or my_stage is distinct from stage_key
  order by slug limit 8;
rollback;
