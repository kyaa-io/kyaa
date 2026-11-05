-- PASSPORT-RENEWAL P2 (5/8): heart based Tier policy v3 (contract.md section 3.7). Rows and functions only: this migration does NOT activate
-- v3 (activation is a separate audited step, tested inside rolled-back transactions). v1/v2 rows and behaviour are unchanged.
-- Hearts H = creator_heart_ledger (passport_page_claim) + fan_heart_conversions.hearts. Stage minimums: gold-1 H>=1, gold-2 8, gold-3 11,
-- platinum-1 14, platinum-2 17, platinum-3 20, platinum-4 24, diamond-1 28 (user-decisions.md). With H = 0 and an issued passport the
-- Tier is Silver once 3 stamp slots are filled (silver-2 from 6); both slot counts are DRAFT values. No Tier cap for members without the jjinfan title:
-- the title only gates room entry (migration 135000). v3 versions row copies the v2 mission/journey ranges (DRAFT, to be confirmed).

-- One-time stamp -> heart conversion record (written only by heart_conversion_apply in migration 136000).
create table public.fan_heart_conversions (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  stamps_counted integer not null check (stamps_counted >= 0),
  hearts integer not null check (hearts >= 0),
  remainder smallint not null check (remainder between 0 and 8),
  source text not null default 'stamp_conversion_v1',
  cutoff_at timestamptz not null,
  converted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (app_user_id, celebrity_id)
);
alter table public.fan_heart_conversions enable row level security;
revoke all on public.fan_heart_conversions from public, anon, authenticated, service_role;
create trigger fan_heart_conversions_append_only before update or delete on public.fan_heart_conversions
  for each row execute function public.reject_passport_page_mutation();
create trigger fan_heart_conversions_no_truncate before truncate on public.fan_heart_conversions
  for each statement execute function public.reject_passport_page_mutation();

-- v3 has equal minimum scores (Bronze/Silver at 0): the unique constraints stay for v1/v2 only.
do $migration$
declare c record;
begin
  for c in select con.conname, con.conrelid::regclass::text rel from pg_constraint con
            where con.contype = 'u'
              and con.conrelid in ('public.reward_policy_tier_milestones'::regclass, 'public.reward_policy_tier_stages'::regclass)
              and (select array_agg(att.attname::text order by att.attname) from pg_attribute att
                    where att.attrelid = con.conrelid and att.attnum = any(con.conkey)) = array['minimum_score', 'policy_version']
  loop
    execute format('alter table %s drop constraint %I', c.rel, c.conname);
  end loop;
end $migration$;
create unique index reward_policy_tier_milestones_score_v12_key on public.reward_policy_tier_milestones(policy_version, minimum_score) where policy_version < 3;
create unique index reward_policy_tier_stages_score_v12_key on public.reward_policy_tier_stages(policy_version, minimum_score) where policy_version < 3;

-- v3 rows. The policy tables force row level security without a policy, so the owner bypass is lifted only for this insert.
alter table public.reward_policy_versions no force row level security;
alter table public.reward_policy_tier_milestones no force row level security;
alter table public.reward_policy_tier_stages no force row level security;
alter table public.reward_policy_tier_stages disable trigger reward_policy_tier_stages_immutable;
insert into public.reward_policy_versions values (3, 0, 3, 1, 0, 2, 1, 0, 5, 3, '2026-11-06 00:00:00+00');
insert into public.reward_policy_tier_milestones(policy_version, tier_name, minimum_score, tier_rank) values
  (3, 'Bronze', 0, 1), (3, 'Silver', 0, 2), (3, 'Gold', 1, 3), (3, 'Platinum', 14, 4), (3, 'Diamond', 28, 5);
insert into public.reward_policy_tier_stages(policy_version, stage_key, tier_name, subdivision, stage_rank, minimum_score) values
  (3, 'bronze-1',   'Bronze',   1,  1,  0),
  (3, 'silver-1',   'Silver',   1,  2,  0),
  (3, 'silver-2',   'Silver',   2,  3,  0),
  (3, 'gold-1',     'Gold',     1,  4,  1),
  (3, 'gold-2',     'Gold',     2,  5,  8),
  (3, 'gold-3',     'Gold',     3,  6, 11),
  (3, 'platinum-1', 'Platinum', 1,  7, 14),
  (3, 'platinum-2', 'Platinum', 2,  8, 17),
  (3, 'platinum-3', 'Platinum', 3,  9, 20),
  (3, 'platinum-4', 'Platinum', 4, 10, 24),
  (3, 'diamond-1',  'Diamond',  1, 11, 28);
alter table public.reward_policy_tier_stages enable trigger reward_policy_tier_stages_immutable;
alter table public.reward_policy_versions force row level security;
alter table public.reward_policy_tier_milestones force row level security;
alter table public.reward_policy_tier_stages force row level security;

-- activate_reward_policy: from v3 on the next Tier may start at the same minimum (Bronze 0 / Silver 0).
do $migration$
declare
  def text;
  a constant text := 'or (tier_rank > 1 and minimum_score <= previous_minimum_score)';
  b constant text := 'or (tier_rank > 1 and minimum_score <= previous_minimum_score and (p_policy_version < 3 or minimum_score < previous_minimum_score))';
begin
  select pg_get_functiondef('public.activate_reward_policy(integer,timestamptz,uuid,text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a, ''))) / length(a) <> 1 then raise exception 'REWARD_POLICY_V3_ANCHOR_CHANGED: activate'; end if;
  execute replace(def, a, b);
end $migration$;

create function public.passport_hearts(p_user uuid, p_celebrity uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (coalesce((select sum(l.amount) from public.creator_heart_ledger l
                     where l.app_user_id = p_user and l.celebrity_id = p_celebrity and l.source_type = 'passport_page_claim'), 0)
        + coalesce((select c.hearts from public.fan_heart_conversions c where c.app_user_id = p_user and c.celebrity_id = p_celebrity), 0))::integer
$$;

-- v3 Tier: hearts decide from 1 up; at 0 hearts a passport with 3+ filled slots is Silver, else Bronze. Never below a v3-era level event.
create function public.passport_v3_tier(p_user uuid, p_celebrity uuid, p_hearts integer) returns text
language sql stable security definer set search_path = '' as $$
  with base as (
    select case
      when greatest(coalesce(p_hearts, 0), 0) > 0 then public.fan_level_rank(public.fan_level_for_score(p_hearts, 3))
      when (select count(*) from public.passport_page_slots s join public.fan_passports p on p.id = s.passport_id
             where p.app_user_id = p_user and p.celebrity_id = p_celebrity and s.stamp_id is not null) >= 3 then 2
      else 1 end as r
  ), ev as (
    select coalesce(max(public.fan_level_rank(e.current_level)), 1) as r from public.fan_level_events e
     where e.app_user_id = p_user and e.celebrity_id = p_celebrity and e.policy_version >= 3
  )
  select case greatest(base.r, ev.r) when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' else 'Diamond' end
    from base, ev
$$;

create or replace function public.fan_level_for_score(p_score integer, p_policy_version integer)
returns text language sql stable parallel safe set search_path = '' as $$
  select milestone.tier_name
  from public.reward_policy_tier_milestones milestone
  where milestone.policy_version = p_policy_version and milestone.minimum_score <= greatest(p_score, 0)
    and (p_policy_version < 3 or milestone.minimum_score > 0 or milestone.tier_rank = 1)
  order by milestone.tier_rank desc limit 1;
$$;

create or replace function public.get_fan_effective_tier_for_score(
  p_app_user_id uuid, p_celebrity_id uuid, p_score integer, p_policy_version integer
) returns text language sql stable set search_path = '' as $$
  select case when p_policy_version >= 3 then public.passport_v3_tier(p_app_user_id, p_celebrity_id, p_score) else (
    with candidates as (
      select public.fan_level_rank(public.fan_level_for_score(p_score, p_policy_version)) tier_rank
      union all
      select snapshot.attained_tier_rank from public.fan_tier_cutover_snapshots snapshot
        where snapshot.app_user_id = p_app_user_id and snapshot.celebrity_id = p_celebrity_id
      union all
      select max(public.fan_level_rank(event.current_level)) from public.fan_level_events event
        where event.app_user_id = p_app_user_id and event.celebrity_id = p_celebrity_id
    ), attained as (select greatest(coalesce(max(tier_rank), 1), 1) tier_rank from candidates)
    select milestone.tier_name from attained
    join public.reward_policy_tier_milestones milestone
      on milestone.policy_version = p_policy_version and milestone.tier_rank = attained.tier_rank
  ) end
$$;

create or replace function public.get_fan_effective_tier(p_app_user_id uuid, p_celebrity_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when activation.policy_version >= 3
    then public.passport_v3_tier(p_app_user_id, p_celebrity_id, public.passport_hearts(p_app_user_id, p_celebrity_id))
    else public.get_fan_effective_tier_for_score(
      p_app_user_id, p_celebrity_id,
      coalesce((select sum(ledger.points)::integer from public.fan_score_ledger ledger
        where ledger.app_user_id = p_app_user_id and ledger.celebrity_id = p_celebrity_id), 0),
      activation.policy_version) end
  from public.reward_policy_activation activation where singleton = true;
$$;

create or replace function public.get_fan_score_and_effective_tier(p_app_user_id uuid, p_celebrity_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with active_policy as materialized (
    select policy_version from public.reward_policy_activation where singleton = true
  ), score as materialized (
    select coalesce(sum(ledger.points), 0)::integer value
    from public.fan_score_ledger ledger
    where ledger.app_user_id = p_app_user_id and ledger.celebrity_id = p_celebrity_id
  )
  select jsonb_build_object(
    'score', score.value,
    'effectiveTier', case when active_policy.policy_version >= 3
      then public.passport_v3_tier(p_app_user_id, p_celebrity_id, public.passport_hearts(p_app_user_id, p_celebrity_id))
      else public.get_fan_effective_tier_for_score(p_app_user_id, p_celebrity_id, score.value, active_policy.policy_version) end
  ) from score cross join active_policy;
$$;

-- Stage display for the passport: stage by hearts, never below the Tier's first stage; at 0 hearts silver-2 needs 6+ filled slots (DRAFT).
create function public.get_fan_passport_stage(p_user uuid, p_celebrity uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pol integer; h integer; tier text; slots integer := 0; by_h smallint; floor_rank smallint; pick smallint; st record;
begin
  select policy_version into pol from public.reward_policy_activation where singleton = true;
  h := public.passport_hearts(p_user, p_celebrity);
  tier := case when pol >= 3 then public.passport_v3_tier(p_user, p_celebrity, h) else public.get_fan_effective_tier(p_user, p_celebrity) end;
  select count(*) into slots from public.passport_page_slots s join public.fan_passports p on p.id = s.passport_id
   where p.app_user_id = p_user and p.celebrity_id = p_celebrity and s.stamp_id is not null;
  select max(stage_rank) into by_h from public.reward_policy_tier_stages where policy_version = 3 and minimum_score > 0 and minimum_score <= h;
  select stage_rank into floor_rank from public.reward_policy_tier_stages where policy_version = 3 and tier_name = tier and subdivision = 1;
  pick := greatest(coalesce(by_h, 1), coalesce(floor_rank, 1));
  if h = 0 and tier = 'Silver' and slots >= 6 then pick := 3; end if;
  select stage_key, tier_name, subdivision into st from public.reward_policy_tier_stages where policy_version = 3 and stage_rank = pick;
  return jsonb_build_object('policyVersion', pol, 'hearts', h, 'stageKey', st.stage_key, 'tier', st.tier_name, 'subdivision', st.subdivision,
    'silverSlotCount', case when h = 0 then slots else null end);
end $$;

-- get_fan_stage_progress: in v3 a score of 0 has no matched stage of its own (it follows the Tier's first stage), and equal minimums
-- must not divide by zero.
do $migration$
declare
  def text;
  a constant text := 'where stage.minimum_score <= p_score';
  b constant text := E'where stage.minimum_score <= p_score\n      and (stage.policy_version < 3 or stage.minimum_score > 0)';
  c constant text := '/ (selected.next_minimum_score - selected.minimum_score)';
  d constant text := '/ greatest(selected.next_minimum_score - selected.minimum_score, 1)';
begin
  select pg_get_functiondef('public.get_fan_stage_progress(integer,text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a, ''))) / length(a) <> 1 or (length(def) - length(replace(def, c, ''))) / length(c) <> 1 then
    raise exception 'REWARD_POLICY_V3_ANCHOR_CHANGED: stage progress'; end if;
  execute replace(replace(def, a, b), c, d);
end $migration$;

revoke all on function public.passport_hearts(uuid, uuid), public.passport_v3_tier(uuid, uuid, integer), public.get_fan_passport_stage(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_fan_passport_stage(uuid, uuid), public.passport_hearts(uuid, uuid) to service_role;
