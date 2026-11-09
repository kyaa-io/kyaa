-- Ranking stage 2 (TK-RANK-IMPL plan 3판, decision 2026-11-09 15:52): a second metric for each home ranking block, movement against the
-- previous built day of the same metric, and an honest head for an empty or late day. Builds on the day table of 20261215010000.
--   kinds        fan_hearts (existing)      fans by hearts
--                fan_points (new)           fans by fan score points (fan_score_ledger, counted creators only). While the 덕질 policy is on, new
--                                           activity is written as 0 points (20261210060000), so this list keeps the score from before the policy.
--                creator_jjinfan (existing) creators by 찐팬
--                creator_hearts (new)       creators by hearts: the same creators as creator_jjinfan, ranked again
--   home_ranking_kind_builds  one row per kind per built day, written even when the kind has no rows. The newest record is the kind's day, so
--                an empty day no longer reads as the last non-empty day, and the day before is the previous record of that kind (a day with no
--                read is skipped). Movement shows from the second record (no seven-day rule); a row absent from the previous record is new.
--   fan favorite (D-4)  the creator the fan named on MY when that page can be named here (counted, listed, with a fan page), else null; a fan who
--                named nobody keeps the most-hearts rule. Both fan kinds.
--   points tie   the moment the fan reached the current total and has held it since (0-point rows are left out, deductions count).
--   readers      read_home_fan_ranking_v2(viewer, metric, limit) and read_home_creator_ranking_v2(locale, metric, limit), up to 50 rows, with
--                state (ready | empty | stale | none), the metric and named values (fans, hearts, points). The old two readers keep their
--                signatures and answer through v2 with the old metric and at most 20 rows.
--   ensure       still builds a missing day under the lock; a day older than ten minutes is rebuilt by whoever gets a try-lock, the rest answer busy.
-- The four tables are FORCE row level security with a policy for the functions' owner; their FORCE state and comment before this file are kept
-- in the table comment so the rollback restores exactly that.
-- Order: database first, then web. The old web reads the old readers (same keys and more); the new web needs v2 and answers 503 without it.
--
-- Rollback: supabase/rollback/20261220010000_home_ranking_metrics.sql
begin;
set local lock_timeout = '5s';

-- 1. FORCE state and comment before this file, once: a second apply finds the key and leaves the record alone.
do $state$
declare t text; c pg_catalog.pg_class; prior text; j jsonb;
begin
  foreach t in array array['home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    prior := pg_catalog.obj_description(c.oid, 'pg_class');
    begin j := prior::jsonb; exception when others then j := null; end;
    if j is not null and pg_catalog.jsonb_typeof(j) = 'object' and j ? 'home_ranking_metrics' then continue; end if;
    execute format('comment on table public.%I is %L', t,
      pg_catalog.jsonb_build_object('home_ranking_metrics', pg_catalog.jsonb_build_object('force_before', c.relforcerowsecurity, 'comment_before', prior))::text);
  end loop;
end $state$;

-- 2. Four kinds.
alter table public.home_ranking_daily drop constraint if exists home_ranking_daily_kind_check;
alter table public.home_ranking_daily add constraint home_ranking_daily_kind_check check (kind in ('fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts'));

-- 3. One record per kind per built day. A record with row_count 0 is a built day with nobody ranked.
create table if not exists public.home_ranking_kind_builds (
  kind text not null check (kind in ('fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts')),
  day date not null,
  computed_at timestamptz not null,
  row_count integer not null check (row_count >= 0),
  primary key (kind, day)
);
alter table public.home_ranking_kind_builds enable row level security;
revoke all on public.home_ranking_kind_builds from public, anon, authenticated, service_role;
-- Every build so far wrote both existing kinds together, empty ones included. The new kinds start on the day this file writes.
insert into public.home_ranking_kind_builds(kind, day, computed_at, row_count)
select k.kind, b.day, b.computed_at, (select count(*) from public.home_ranking_daily h where h.kind = k.kind and h.day = b.day)
  from public.home_ranking_builds b cross join (values ('fan_hearts'), ('creator_jjinfan')) as k(kind)
on conflict (kind, day) do nothing;

-- 4. The day's build: the two existing kinds as before, the two new kinds, the favorite rule and the per-kind records.
create or replace function public.refresh_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := (p_now at time zone 'Asia/Seoul')::date; keep date := (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date - 35;
  fans integer; points integer; creators integer; creator_hearts integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily'));
  -- Retention follows the clock, not p_now, so a rebuild of a past or test day never removes the real days.
  delete from public.home_ranking_daily where day = d or day < keep;
  delete from public.home_ranking_builds where day < keep;
  delete from public.home_ranking_kind_builds where day < keep;
  -- Creators whose hearts and points count, checked once per creator.
  drop table if exists pg_temp.home_counted_creators;
  create temporary table home_counted_creators on commit drop as
    select c.id as celebrity_id from public.celebrities c where public.platform_fan_heart_counted(c.id);
  -- The whole heart count runs once per build; every list reads this copy.
  drop table if exists pg_temp.home_heart_totals;
  create temporary table home_heart_totals (app_user_id uuid, celebrity_id uuid, hearts bigint, achieved_at timestamptz, counted boolean) on commit drop;
  insert into pg_temp.home_heart_totals
  select t.app_user_id, t.celebrity_id, t.hearts, t.achieved_at, exists (select 1 from pg_temp.home_counted_creators k where k.celebrity_id = t.celebrity_id)
    from public.heart_totals() t;
  -- Points per fan over counted creators, active members, rows that change the sum. reached = the first row after the last row whose running
  -- sum was below today's total: the moment the fan reached the total and has held it since. Same created_at goes by id.
  drop table if exists pg_temp.home_points;
  create temporary table home_points on commit drop as
    select r.app_user_id, max(r.total)::bigint as score, min(r.created_at) filter (where not r.below_later) as achieved_at
      from (select q.app_user_id, q.created_at, q.total,
                   pg_catalog.bool_or(q.cum < q.total) over (partition by q.app_user_id order by q.created_at desc, q.id desc rows between unbounded preceding and current row) as below_later
              from (select l.app_user_id, l.created_at, l.id,
                           sum(l.points::bigint) over (partition by l.app_user_id order by l.created_at, l.id rows between unbounded preceding and current row) as cum,
                           sum(l.points::bigint) over (partition by l.app_user_id) as total
                      from public.fan_score_ledger l
                      join pg_temp.home_counted_creators k on k.celebrity_id = l.celebrity_id
                      join public.app_users u on u.id = l.app_user_id and u.status = 'active'
                     where l.points <> 0) q) r
     group by r.app_user_id
    having max(r.total) > 0;
  -- The creator named on MY, for every fan who named one.
  drop table if exists pg_temp.home_chosen;
  create temporary table home_chosen on commit drop as
    select f.app_user_id, f.favorite_celebrity_id as celebrity_id from public.fan_profile_public_fields f where f.favorite_celebrity_id is not null;
  -- Creators the creator list may name (counted, listed, with a fan page): creators holding hearts and creators named on MY (a named one may have none).
  drop table if exists pg_temp.home_named_creators;
  create temporary table home_named_creators on commit drop as
    select x.celebrity_id from (select t.celebrity_id from pg_temp.home_heart_totals t where t.counted union select ch.celebrity_id from pg_temp.home_chosen ch) x
     where exists (select 1 from pg_temp.home_counted_creators k where k.celebrity_id = x.celebrity_id) and public.creator_listed(x.celebrity_id)
       and exists (select 1 from public.group_pages g where g.celebrity_id = x.celebrity_id and g.kind = 'fan');
  -- Per fan of either list: counted hearts, the highest grade held with a counted creator, and the favorite (D-4). A fan who named a creator
  -- keeps that one or none; only a fan who named nobody gets the creator given the most hearts. Grouped once (no per-row scan of the copy).
  drop table if exists pg_temp.home_fan_facts;
  create temporary table home_fan_facts on commit drop as
    with held as (
      select t.app_user_id, sum(t.hearts)::bigint as hearts,
             case max(public.fan_level_rank(public.get_fan_effective_tier(t.app_user_id, t.celebrity_id)))
               when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' when 5 then 'Diamond' end as tier
        from pg_temp.home_heart_totals t where t.counted group by t.app_user_id
    ), most as (
      select distinct on (t.app_user_id) t.app_user_id, t.celebrity_id
        from pg_temp.home_heart_totals t join pg_temp.home_named_creators n on n.celebrity_id = t.celebrity_id
       where t.counted order by t.app_user_id, t.hearts desc, t.achieved_at asc, t.celebrity_id asc
    )
    select s.app_user_id, coalesce(hd.hearts, 0)::bigint as hearts, hd.tier,
           case when ch.app_user_id is not null then (select n.celebrity_id from pg_temp.home_named_creators n where n.celebrity_id = ch.celebrity_id) else m.celebrity_id end as favorite
      from (select h.app_user_id from held h union select p.app_user_id from pg_temp.home_points p) s
      left join held hd on hd.app_user_id = s.app_user_id
      left join most m on m.app_user_id = s.app_user_id
      left join pg_temp.home_chosen ch on ch.app_user_id = s.app_user_id;
  create index on pg_temp.home_fan_facts (app_user_id);
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, favorite_celebrity_id, achieved_at, computed_at)
  select 'fan_hearts', d, r.subject_id, r.rn, r.score, r.score, f.tier, f.favorite, r.achieved_at, p_now
    from (select s.subject_id, s.score, s.achieved_at, pg_catalog.row_number() over (order by s.score desc, s.achieved_at asc, s.subject_id asc) as rn
            from (select t.app_user_id as subject_id, sum(t.hearts)::bigint as score, max(t.achieved_at) as achieved_at from pg_temp.home_heart_totals t where t.counted group by t.app_user_id) s
           where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = s.subject_id and mr.revoked_at is null)) r
    join pg_temp.home_fan_facts f on f.app_user_id = r.subject_id;
  get diagnostics fans = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, favorite_celebrity_id, achieved_at, computed_at)
  select 'fan_points', d, r.app_user_id, r.rn, r.score, f.hearts, f.tier, f.favorite, r.achieved_at, p_now
    from (select p.app_user_id, p.score, p.achieved_at, pg_catalog.row_number() over (order by p.score desc, p.achieved_at asc, p.app_user_id asc) as rn
            from pg_temp.home_points p
           where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = p.app_user_id and mr.revoked_at is null)) r
    join pg_temp.home_fan_facts f on f.app_user_id = r.app_user_id;
  get diagnostics points = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'creator_jjinfan', d, r.celebrity_id, r.rn, r.fans, r.hearts, r.achieved_at, p_now
    from (select x.celebrity_id, x.fans, x.hearts, x.achieved_at,
                 pg_catalog.row_number() over (order by x.fans desc, x.hearts desc, x.achieved_at asc, x.celebrity_id asc) as rn
            from (select t.celebrity_id, count(*) as fans, sum(t.hearts) as hearts, max(t.achieved_at) as achieved_at
                    from pg_temp.home_heart_totals t
                   where t.counted
                   group by t.celebrity_id) x
           where public.creator_listed(x.celebrity_id)
             and exists (select 1 from public.group_pages g where g.celebrity_id = x.celebrity_id and g.kind = 'fan')) r;
  get diagnostics creators = row_count;
  -- The same creators by hearts: no new count, today's 찐팬 rows ranked again.
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'creator_hearts', d, t.subject_id,
         pg_catalog.row_number() over (order by t.hearts desc, t.score desc, t.achieved_at asc, t.subject_id asc), t.hearts, t.hearts, t.achieved_at, p_now
    from public.home_ranking_daily t where t.kind = 'creator_jjinfan' and t.day = d;
  get diagnostics creator_hearts = row_count;
  insert into public.home_ranking_builds(day, computed_at) values (d, p_now) on conflict (day) do update set computed_at = excluded.computed_at;
  insert into public.home_ranking_kind_builds(kind, day, computed_at, row_count)
  values ('fan_hearts', d, p_now, fans), ('fan_points', d, p_now, points), ('creator_jjinfan', d, p_now, creators), ('creator_hearts', d, p_now, creator_hearts)
  on conflict (kind, day) do update set computed_at = excluded.computed_at, row_count = excluded.row_count;
  return pg_catalog.jsonb_build_object('day', d, 'fans', fans, 'points', points, 'creators', creators, 'creatorHearts', creator_hearts, 'computedAt', p_now);
end $$;

-- 5. The head shared by the readers, per kind. The answer has more columns now, so the function is made again (the readers below are too).
drop function if exists public.home_ranking_days(text);
create function public.home_ranking_days(p_kind text)
returns table (day date, previous date, comparable boolean, computed_at timestamptz, row_count integer, base date, today date, state text, failed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with last as (select k.day, k.computed_at, k.row_count from public.home_ranking_kind_builds k where k.kind = p_kind order by k.day desc limit 1),
       clock as (select (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date as today)
  select l.day,
         p.previous,
         p.previous is not null,
         l.computed_at,
         l.row_count,
         -- weekGain compares with the oldest record of this kind within the seven days before the day; a kind newer than that starts on its first record.
         (select min(k.day) from public.home_ranking_kind_builds k where k.kind = p_kind and k.day >= l.day - 7 and k.day < l.day),
         c.today,
         case when l.day is null then 'none' when l.day < c.today then 'stale' when l.row_count = 0 then 'empty' else 'ready' end,
         (select f.failed_at from public.home_ranking_build_failures f where f.day = c.today)
    from clock c
    left join last l on true
    left join lateral (select max(k.day) as previous from public.home_ranking_kind_builds k where k.kind = p_kind and k.day < l.day) p on true
$$;

-- 6. Readers. Stored values only: rank, score, grade and favorite come from the day's rows; read-time filters (sanction now, blocks with the viewer,
-- pages that went private, unlisted or archived) close the ranks up. No member id leaves.
create or replace function public.read_home_fan_ranking_v2(p_viewer uuid, p_metric text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text := case p_metric when 'hearts' then 'fan_hearts' when 'points' then 'fan_points' end;
  h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb; me jsonb;
begin
  if k is null then raise exception 'RANKING_METRIC_INVALID' using errcode = '22023'; end if;
  select * into h from public.home_ranking_days(k);
  with visible as (
    select t.subject_id, t.score, t.hearts, t.rank as stored_rank, t.tier, t.favorite_celebrity_id, pg_catalog.row_number() over (order by t.rank) as rn
      from public.home_ranking_daily t
      join public.app_users au on au.id = t.subject_id and au.status = 'active'
     where t.kind = k and t.day = h.day
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = t.subject_id and mr.revoked_at is null)
       and (p_viewer is null or not exists (select 1 from public.user_blocks b
             where (b.app_user_id = p_viewer and b.blocked_app_user_id = t.subject_id) or (b.app_user_id = t.subject_id and b.blocked_app_user_id = p_viewer)))
  ), moved as (
    select v.*, (select y.rank - v.stored_rank from public.home_ranking_daily y where y.kind = k and y.day = h.previous and y.subject_id = v.subject_id) as delta
      from visible v
  )
  select coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', v.rn, 'score', v.score, 'hearts', v.hearts, 'points', case when k = 'fan_points' then v.score end, 'tier', v.tier,
      'isMe', p_viewer is not null and v.subject_id = p_viewer,
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink'),
      'delta', v.delta,
      -- Gain over the rolling seven days. A fan not ranked on that day held nothing there, so it counts from 0.
      'weekGain', case when h.base is not null then v.score - coalesce((select w.score from public.home_ranking_daily w where w.kind = k and w.day = h.base and w.subject_id = v.subject_id), 0) end,
      -- Named only while its page is still one the creator list may name. Names in every stored language; the route picks one.
      'favorite', (select pg_catalog.jsonb_build_object('slug', c.slug,
                     'names', coalesce((select pg_catalog.jsonb_object_agg(l.locale::text, l.name) from public.celebrity_localizations l where l.celebrity_id = c.id and nullif(pg_catalog.btrim(l.name), '') is not null), '{}'::jsonb))
                     from public.celebrities c
                    where c.id = v.favorite_celebrity_id and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id))
    ) order by v.rn)
      from moved v
      left join public.user_profiles pr on pr.app_user_id = v.subject_id
      left join public.app_user_avatars av on av.app_user_id = v.subject_id
     where v.rn <= lim), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.score, 'hearts', m.hearts, 'points', case when k = 'fan_points' then m.score end,
              'inTop', m.rn <= lim, 'delta', m.delta)
       from moved m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me;
  return pg_catalog.jsonb_build_object('state', h.state, 'day', h.day, 'today', h.today, 'previousDay', h.previous,
    'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'failedAt', h.failed_at,
    'comparable', coalesce(h.comparable, false), 'weekGainDays', h.day - h.base, 'metric', p_metric, 'rows', items, 'me', me);
end $$;

create or replace function public.read_home_creator_ranking_v2(p_locale text, p_metric text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text := case p_metric when 'fans' then 'creator_jjinfan' when 'hearts' then 'creator_hearts' end;
  h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb;
begin
  if k is null then raise exception 'RANKING_METRIC_INVALID' using errcode = '22023'; end if;
  select * into h from public.home_ranking_days(k);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'slug', s.slug, 'name', s.name, 'imageUrl', s.image_url, 'score', s.score, 'hearts', s.hearts,
      'fans', case when k = 'creator_jjinfan' then s.score
                   else coalesce((select j.score from public.home_ranking_daily j where j.kind = 'creator_jjinfan' and j.day = h.day and j.subject_id = s.subject_id), 0) end,
      'challenge', exists (select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id = s.subject_id and j.enabled),
      'delta', (select y.rank - s.stored_rank from public.home_ranking_daily y where y.kind = k and y.day = h.previous and y.subject_id = s.subject_id),
      'weekGain', case when h.base is not null then s.score - coalesce((select w.score from public.home_ranking_daily w where w.kind = k and w.day = h.base and w.subject_id = s.subject_id), 0) end
    ) order by s.rn), '[]'::jsonb) into items
    from (select t.subject_id, t.score, t.hearts, t.rank as stored_rank, c.slug, c.image_url, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 pg_catalog.row_number() over (order by t.rank) as rn
            from public.home_ranking_daily t
            join public.celebrities c on c.id = t.subject_id
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where t.kind = k and t.day = h.day and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)) s
   where s.rn <= lim;
  return pg_catalog.jsonb_build_object('state', h.state, 'day', h.day, 'today', h.today, 'previousDay', h.previous,
    'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'failedAt', h.failed_at,
    'comparable', coalesce(h.comparable, false), 'weekGainDays', h.day - h.base, 'metric', p_metric, 'rows', items);
end $$;

-- The old readers keep their signatures for the old web: the old metric, at most 20 rows, v2's answer (the old web drops the keys it does not know).
create or replace function public.read_home_fan_ranking(p_viewer uuid default null, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.read_home_fan_ranking_v2(p_viewer, 'hearts', least(greatest(coalesce(p_limit, 20), 1), 20))
$$;
create or replace function public.read_home_creator_ranking(p_locale text default 'ko', p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.read_home_creator_ranking_v2(p_locale, 'fans', least(greatest(coalesce(p_limit, 20), 1), 20))
$$;

-- 7. Read-time build. A missing day: as before (wait for the lock, check again, build). A day older than ten minutes: one reader that gets the
-- try-lock rebuilds it, the others answer busy at once and keep the snapshot they read. A failed build leaves the snapshot (its writes are undone)
-- and a mark that makes readers wait five minutes before trying again.
create or replace function public.ensure_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := (p_now at time zone 'Asia/Seoul')::date; built_at timestamptz;
begin
  select b.computed_at into built_at from public.home_ranking_builds b where b.day = d;
  if built_at is not null and p_now - built_at <= interval '10 minutes' then return pg_catalog.jsonb_build_object('day', d, 'built', false); end if;
  if exists (select 1 from public.home_ranking_build_failures f where f.day = d and f.failed_at > pg_catalog.clock_timestamp() - interval '5 minutes') then
    return pg_catalog.jsonb_build_object('day', d, 'built', false, 'waiting', true);
  end if;
  if built_at is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily'));
    if exists (select 1 from public.home_ranking_builds b where b.day = d) then return pg_catalog.jsonb_build_object('day', d, 'built', false); end if;
  else
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily')) then return pg_catalog.jsonb_build_object('day', d, 'built', false, 'busy', true); end if;
    select b.computed_at into built_at from public.home_ranking_builds b where b.day = d;
    if p_now - built_at <= interval '10 minutes' then return pg_catalog.jsonb_build_object('day', d, 'built', false); end if;
  end if;
  begin
    perform public.refresh_home_rankings(p_now);
  exception when others then
    insert into public.home_ranking_build_failures(day, failed_at) values (d, pg_catalog.clock_timestamp())
      on conflict (day) do update set failed_at = excluded.failed_at;
    return pg_catalog.jsonb_build_object('day', d, 'built', false, 'failed', true);
  end;
  delete from public.home_ranking_build_failures where day = d;
  return pg_catalog.jsonb_build_object('day', d, 'built', true);
end $$;

-- 8. Grants: the readers and ensure for the service role; the build, the head and the count for nobody but the owner (pg_cron runs as the owner).
revoke all on function public.refresh_home_rankings(timestamptz), public.home_ranking_days(text), public.heart_totals(), public.ensure_home_rankings(timestamptz),
  public.read_home_fan_ranking_v2(uuid, text, integer), public.read_home_creator_ranking_v2(text, text, integer),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.ensure_home_rankings(timestamptz), public.read_home_fan_ranking_v2(uuid, text, integer), public.read_home_creator_ranking_v2(text, text, integer),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) to service_role;

-- 9. One owner. The functions made again here belong to the applying role; give them and the new table to the owners of what they replace, then
-- FORCE row level security on the four tables with a policy for that owner (named home_ranking_owner_<role>; the rollback drops it). The same
-- owner must read the point ledger and the MY favorite; where row security binds it there, it gets a read policy (home_ranking_read_<role>).
do $owner$
declare fn_owner name := pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.refresh_home_rankings(timestamptz)'::regprocedure));
  tbl_owner name := pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'public.home_ranking_daily'::regclass));
  f text; t text; cls pg_catalog.pg_class; me pg_catalog.pg_roles; gaps text[] := '{}';
begin
  foreach f in array array['public.home_ranking_days(text)', 'public.read_home_fan_ranking_v2(uuid,text,integer)', 'public.read_home_creator_ranking_v2(text,text,integer)'] loop
    if pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = f::regprocedure)) <> fn_owner then
      execute format('alter function %s owner to %I', f, fn_owner);
    end if;
  end loop;
  if pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'public.home_ranking_kind_builds'::regclass)) <> tbl_owner then
    execute format('alter table public.home_ranking_kind_builds owner to %I', tbl_owner);
  end if;
  foreach t in array array['home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures', 'home_ranking_kind_builds'] loop
    execute format('drop policy if exists %I on public.%I', 'home_ranking_owner_' || fn_owner, t);
    execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'home_ranking_owner_' || fn_owner, t, fn_owner);
    execute format('alter table public.%I force row level security', t);
  end loop;
  select * into me from pg_catalog.pg_roles where rolname = fn_owner;
  if me.rolsuper or me.rolbypassrls then return; end if;
  foreach t in array array['fan_score_ledger', 'fan_profile_public_fields'] loop
    select * into cls from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, cls.oid, 'select') then gaps := gaps || format('select on %s', t); continue; end if;
    if cls.relrowsecurity and (cls.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, cls.relowner, 'USAGE'))
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = cls.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin
        execute format('create policy %I on public.%I for select to %I using (true)', 'home_ranking_read_' || fn_owner, t, fn_owner);
      exception when insufficient_privilege then gaps := gaps || format('read policy on %s', t);
      end;
    end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'HOME_RANKING_OWNER_GAP: % lacks %', fn_owner, array_to_string(gaps, '; '); end if;
end $owner$;

-- 10. Checks; any miss undoes the whole file.
do $check$
declare fns text[] := array['public.refresh_home_rankings(timestamptz)', 'public.ensure_home_rankings(timestamptz)', 'public.home_ranking_days(text)',
    'public.read_home_fan_ranking_v2(uuid,text,integer)', 'public.read_home_creator_ranking_v2(text,text,integer)',
    'public.read_home_fan_ranking(uuid,integer)', 'public.read_home_creator_ranking(text,integer)'];
  served text[] := array['public.ensure_home_rankings(timestamptz)', 'public.read_home_fan_ranking_v2(uuid,text,integer)', 'public.read_home_creator_ranking_v2(text,text,integer)',
    'public.read_home_fan_ranking(uuid,integer)', 'public.read_home_creator_ranking(text,integer)'];
  tables text[] := array['home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures', 'home_ranking_kind_builds'];
  owner oid := (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.refresh_home_rankings(timestamptz)'::regprocedure);
  f text; t text; r name; fp pg_catalog.pg_proc;
begin
  foreach f in array fns loop
    select * into fp from pg_catalog.pg_proc where oid = f::regprocedure;
    if fp.proowner <> owner then raise exception 'HOME_RANKING_CHECK: % has another owner', f; end if;
    if not fp.prosecdef or not coalesce(fp.proconfig @> array['search_path=""'], false) then raise exception 'HOME_RANKING_CHECK: % is not definer with an empty search_path', f; end if;
    if pg_catalog.has_function_privilege('service_role', f, 'execute') <> (f = any (served)) then raise exception 'HOME_RANKING_CHECK: service_role execute on % is wrong', f; end if;
    foreach r in array array['anon', 'authenticated']::name[] loop
      if pg_catalog.has_function_privilege(r, f, 'execute') then raise exception 'HOME_RANKING_CHECK: % may execute %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.heart_totals()'] loop
    foreach r in array array['anon', 'authenticated', 'service_role']::name[] loop
      if pg_catalog.has_function_privilege(r, f, 'execute') then raise exception 'HOME_RANKING_CHECK: % may execute %', r, f; end if;
    end loop;
  end loop;
  foreach t in array tables loop
    if not pg_catalog.pg_has_role(owner, (select c.relowner from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass), 'USAGE') then
      raise exception 'HOME_RANKING_CHECK: the function owner is not an owner of %', t;
    end if;
    if not (select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'HOME_RANKING_CHECK: % is not FORCE', t; end if;
    foreach r in array array['anon', 'authenticated', 'service_role']::name[] loop
      if pg_catalog.has_table_privilege(r, 'public.' || t, 'select') then raise exception 'HOME_RANKING_CHECK: % may read %', r, t; end if;
    end loop;
  end loop;
  foreach t in array array['fan_score_ledger', 'fan_profile_public_fields'] loop
    if not pg_catalog.has_table_privilege(owner, 'public.' || t, 'select') then raise exception 'HOME_RANKING_CHECK: the function owner cannot read %', t; end if;
  end loop;
end $check$;

-- 11. Write today now: the new kinds start today, and a missing policy or grant fails here instead of at the first home read.
select public.refresh_home_rankings();
commit;

-- PostgREST learns the new functions without a restart.
notify pgrst, 'reload schema';
