-- Rollback for 20261220010000_home_ranking_metrics.sql. Order: web first (the new web reads v2), then this file.
-- Restores the FORCE state and comment each table had before that file (kept in the table comment), drops the policies it made, v2 and the
-- per-kind records, the two new kinds' rows, and puts back the bodies of 20261215010000 / 20261216020000 / 20261217010000 and their grants.
-- The new kinds' history is lost; applying the file again starts them on that day.
begin;
set local lock_timeout = '5s';

do $restore$
declare t text; j jsonb; pol record;
begin
  foreach t in array array['home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures'] loop
    begin j := pg_catalog.obj_description(('public.' || t)::regclass, 'pg_class')::jsonb -> 'home_ranking_metrics'; exception when others then j := null; end;
    if j is null or not (j ? 'force_before') then raise exception 'HOME_RANKING_METRICS_STATE_MISSING: %', t; end if;
    if not (j ->> 'force_before')::boolean then execute format('alter table public.%I no force row level security', t); end if;
    execute format('comment on table public.%I is %L', t, j ->> 'comment_before');
  end loop;
  for pol in select p.polname, c.relname from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
              where (c.relname in ('home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures', 'home_ranking_kind_builds') and p.polname like 'home\_ranking\_owner\_%')
                 or (c.relname in ('fan_score_ledger', 'fan_profile_public_fields') and p.polname like 'home\_ranking\_read\_%') loop
    execute format('drop policy %I on public.%I', pol.polname, pol.relname);
  end loop;
end $restore$;

drop function if exists public.read_home_fan_ranking_v2(uuid, text, integer);
drop function if exists public.read_home_creator_ranking_v2(text, text, integer);
drop function if exists public.home_ranking_days(text);

-- As 20261215010000.
create function public.home_ranking_days(p_kind text)
returns table (day date, previous date, comparable boolean, computed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.day, t.day - 1, t.day - (select min(h.day) from public.home_ranking_daily h where h.kind = p_kind) >= 7,
         (select max(h.computed_at) from public.home_ranking_daily h where h.kind = p_kind and h.day = t.day)
    from (select max(h.day) as day from public.home_ranking_daily h where h.kind = p_kind) t
$$;

-- As 20261216020000.
create or replace function public.refresh_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := (p_now at time zone 'Asia/Seoul')::date; fans integer; creators integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily'));
  -- Retention follows the clock, not p_now, so a rebuild of a past or test day never removes the real days.
  delete from public.home_ranking_daily where day = d or day < (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date - 35;
  delete from public.home_ranking_builds where day < (pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date - 35;
  -- The whole heart count runs once per build; both lists read this copy.
  drop table if exists pg_temp.home_heart_totals;
  create temporary table home_heart_totals (app_user_id uuid, celebrity_id uuid, hearts bigint, achieved_at timestamptz, counted boolean) on commit drop;
  insert into pg_temp.home_heart_totals select t.app_user_id, t.celebrity_id, t.hearts, t.achieved_at, public.platform_fan_heart_counted(t.celebrity_id) from public.heart_totals() t;
  -- Creators the creator list may name, checked once per creator: the fan rows' favorite is one of these.
  drop table if exists pg_temp.home_named_creators;
  create temporary table home_named_creators on commit drop as
    select x.celebrity_id from (select distinct t.celebrity_id from pg_temp.home_heart_totals t where t.counted) x
     where public.creator_listed(x.celebrity_id) and exists (select 1 from public.group_pages g where g.celebrity_id = x.celebrity_id and g.kind = 'fan');
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, favorite_celebrity_id, achieved_at, computed_at)
  select 'fan_hearts', d, r.subject_id, r.rn, r.score, r.score,
         (select case max(public.fan_level_rank(public.get_fan_effective_tier(r.subject_id, t.celebrity_id)))
                   when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' when 5 then 'Diamond' end
            from pg_temp.home_heart_totals t where t.app_user_id = r.subject_id and t.counted),
         (select t.celebrity_id from pg_temp.home_heart_totals t join pg_temp.home_named_creators n on n.celebrity_id = t.celebrity_id
           where t.app_user_id = r.subject_id and t.counted order by t.hearts desc, t.achieved_at asc, t.celebrity_id asc limit 1),
         r.achieved_at, p_now
    from (select s.subject_id, s.score, s.achieved_at, pg_catalog.row_number() over (order by s.score desc, s.achieved_at asc, s.subject_id asc) as rn
            from (select t.app_user_id as subject_id, sum(t.hearts)::bigint as score, max(t.achieved_at) as achieved_at from pg_temp.home_heart_totals t where t.counted group by t.app_user_id) s
           where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = s.subject_id and mr.revoked_at is null)) r;
  get diagnostics fans = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'creator_jjinfan', d, r.celebrity_id, r.rn, r.fans, r.hearts, r.achieved_at, p_now
    from (select x.celebrity_id, x.fans, x.hearts, x.achieved_at,
                 pg_catalog.row_number() over (order by x.fans desc, x.hearts desc, x.achieved_at asc, x.celebrity_id asc) as rn
            from (select t.celebrity_id, count(*) as fans, sum(t.hearts) as hearts, max(t.achieved_at) as achieved_at
                    from pg_temp.home_heart_totals t
                   group by t.celebrity_id) x
           where public.platform_fan_heart_counted(x.celebrity_id) and public.creator_listed(x.celebrity_id)
             and exists (select 1 from public.group_pages g where g.celebrity_id = x.celebrity_id and g.kind = 'fan')) r;
  get diagnostics creators = row_count;
  insert into public.home_ranking_builds(day, computed_at) values (d, p_now) on conflict (day) do update set computed_at = excluded.computed_at;
  return pg_catalog.jsonb_build_object('day', d, 'fans', fans, 'creators', creators, 'computedAt', p_now);
end $$;

-- As 20261215010000.
create or replace function public.ensure_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := (p_now at time zone 'Asia/Seoul')::date;
begin
  if exists (select 1 from public.home_ranking_builds b where b.day = d) then return pg_catalog.jsonb_build_object('day', d, 'built', false); end if;
  if exists (select 1 from public.home_ranking_build_failures f where f.day = d and f.failed_at > pg_catalog.clock_timestamp() - interval '5 minutes') then
    return pg_catalog.jsonb_build_object('day', d, 'built', false, 'waiting', true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily'));
  if exists (select 1 from public.home_ranking_builds b where b.day = d) then return pg_catalog.jsonb_build_object('day', d, 'built', false); end if;
  begin
    perform public.refresh_home_rankings(p_now);
  exception when others then
    -- The day's writes are undone with this block; the mark stays so readers keep yesterday for five minutes.
    insert into public.home_ranking_build_failures(day, failed_at) values (d, pg_catalog.clock_timestamp())
      on conflict (day) do update set failed_at = excluded.failed_at;
    return pg_catalog.jsonb_build_object('day', d, 'built', false, 'failed', true);
  end;
  delete from public.home_ranking_build_failures where day = d;
  return pg_catalog.jsonb_build_object('day', d, 'built', true);
end $$;

-- As 20261217010000.
create or replace function public.read_home_fan_ranking(p_viewer uuid default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb; me jsonb; base date;
begin
  select * into h from public.home_ranking_days('fan_hearts');
  -- Rolling seven days, as the creator list: the oldest built day within the last seven before today (20261216020000).
  select min(b.day) into base from public.home_ranking_builds b where b.day >= h.day - 7 and b.day < h.day;
  -- Stored values only: rank, score, grade and favorite come from the day's rows. Read-time filters (sanction now, blocks with the viewer) close the ranks up.
  with visible as (
    select t.subject_id, t.score, t.rank as stored_rank, t.tier, t.favorite_celebrity_id, pg_catalog.row_number() over (order by t.rank) as rn
      from public.home_ranking_daily t
      join public.app_users au on au.id = t.subject_id and au.status = 'active'
     where t.kind = 'fan_hearts' and t.day = h.day
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = t.subject_id and mr.revoked_at is null)
       and (p_viewer is null or not exists (select 1 from public.user_blocks b
             where (b.app_user_id = p_viewer and b.blocked_app_user_id = t.subject_id) or (b.app_user_id = t.subject_id and b.blocked_app_user_id = p_viewer)))
  )
  select coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', v.rn, 'score', v.score, 'tier', v.tier, 'isMe', p_viewer is not null and v.subject_id = p_viewer,
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink'),
      'delta', case when h.comparable then (select y.rank - v.stored_rank from public.home_ranking_daily y where y.kind = 'fan_hearts' and y.day = h.previous and y.subject_id = v.subject_id) end,
      -- Hearts gained over the rolling seven days. A fan not ranked on that day held no counted heart there, so it counts from 0.
      'weekGain', case when base is not null then v.score - coalesce((select w.score from public.home_ranking_daily w where w.kind = 'fan_hearts' and w.day = base and w.subject_id = v.subject_id), 0) end,
      -- The favorite is named only while its page is still one the creator list may name. Names in every stored language; the route picks one.
      'favorite', (select pg_catalog.jsonb_build_object('slug', c.slug,
                     'names', coalesce((select pg_catalog.jsonb_object_agg(l.locale::text, l.name) from public.celebrity_localizations l where l.celebrity_id = c.id and nullif(pg_catalog.btrim(l.name), '') is not null), '{}'::jsonb))
                     from public.celebrities c
                    where c.id = v.favorite_celebrity_id and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id))
    ) order by v.rn)
      from visible v
      left join public.user_profiles pr on pr.app_user_id = v.subject_id
      left join public.app_user_avatars av on av.app_user_id = v.subject_id
     where v.rn <= lim), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.score, 'inTop', m.rn <= lim) from visible m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me;
  return pg_catalog.jsonb_build_object('day', h.day, 'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false),
    'weekGainDays', h.day - base, 'rows', items, 'me', me);
end $$;

-- As 20261216020000.
create or replace function public.read_home_creator_ranking(p_locale text default 'ko', p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb; base date;
begin
  select * into h from public.home_ranking_days('creator_jjinfan');
  -- Rolling seven days: the oldest built day within the last seven before today. A built day with no creator rows still counts (everyone was 0).
  select min(b.day) into base from public.home_ranking_builds b where b.day >= h.day - 7 and b.day < h.day;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'slug', s.slug, 'name', s.name, 'imageUrl', s.image_url, 'score', s.score, 'hearts', s.hearts,
      'challenge', exists (select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id = s.subject_id and j.enabled),
      'delta', case when h.comparable then (select y.rank - s.stored_rank from public.home_ranking_daily y where y.kind = 'creator_jjinfan' and y.day = h.previous and y.subject_id = s.subject_id) end,
      'weekGain', case when base is not null then s.score - coalesce((select w.score from public.home_ranking_daily w where w.kind = 'creator_jjinfan' and w.day = base and w.subject_id = s.subject_id), 0) end
    ) order by s.rn), '[]'::jsonb) into items
    from (select t.subject_id, t.score, t.hearts, t.rank as stored_rank, c.slug, c.image_url, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 pg_catalog.row_number() over (order by t.rank) as rn
            from public.home_ranking_daily t
            join public.celebrities c on c.id = t.subject_id
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where t.kind = 'creator_jjinfan' and t.day = h.day and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)) s
   where s.rn <= lim;
  return pg_catalog.jsonb_build_object('day', h.day, 'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at,
    'comparable', coalesce(h.comparable, false), 'weekGainDays', h.day - base, 'rows', items);
end $$;

revoke all on function public.heart_totals(), public.home_ranking_days(text) from public, anon, authenticated, service_role;
revoke all on function public.ensure_home_rankings(timestamptz), public.refresh_home_rankings(timestamptz),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.ensure_home_rankings(timestamptz), public.refresh_home_rankings(timestamptz),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) to service_role;

delete from public.home_ranking_daily where kind in ('fan_points', 'creator_hearts');
drop table if exists public.home_ranking_kind_builds;
alter table public.home_ranking_daily drop constraint if exists home_ranking_daily_kind_check;
alter table public.home_ranking_daily add constraint home_ranking_daily_kind_check check (kind in ('fan_hearts', 'creator_jjinfan'));
commit;

notify pgrst, 'reload schema';
