-- 261107-2 feedback C3: the home ranking card shows day-over-day movement (▲▼—).
-- ranking_snapshots keeps one row per open period and is overwritten in place, so it has no yesterday. This file adds a per-day table instead:
--   home_ranking_daily  kind fan_hearts       subject = fan,       score = that fan's hearts across every counted creator (all time)
--                       kind creator_jjinfan  subject = celebrity, score = 찐팬 = active fans holding at least one heart there, hearts = heart total
-- Every ranked subject is stored (not only the top), with the fan's grade, so a read never counts hearts: it reads the day's rows.
-- One heart count for the product (coordination 2026-11-08): the same sum passport_hearts(user, creator) gives the header ♥N and the fan list,
-- i.e. passport_page_claim ledger amounts plus the one-time stamp conversion (fan_heart_conversions.hearts). heart_totals() is that sum per pair,
-- and creator_jjinfan_count() counts the fans whose sum is positive, which the 찐팬 100 gauge also reads (20261215020000).
-- Counted pages and members are the same as the existing platform rankings: platform_fan_heart_counted (published, not archived, not anonymous,
-- not the wave page), creator_listed (fan page not unlisted), a fan group page exists, members active. Sanctioned members leave the fan rows when
-- the day is written and again at read time; blocks with the viewer leave at read time. Ranks are counted again after the read-time filters.
-- refresh_home_rankings(p_now) rewrites today's (KST) rows; the last write of a day is that day's standing. Yesterday = the day before the newest day.
-- Movement shows only after seven days of history (decision C3); before that, and for a row not ranked yesterday, delta is null (shown as —).
-- Who writes the day: the reader's caller. The home ranking API calls ensure_home_rankings() when the answer is not from today (KST); it takes the
-- same advisory lock as the refresh, checks the day's build mark again under the lock and builds only if it is still missing, so two first readers
-- of a day build once. Later reads of the day only read. The mark (home_ranking_builds) also covers a day with no scores, which has no rows.
-- pg_cron, where installed, rewrites today every 10 minutes as well; it is optional, and dev, local and production run the same read-time path.
-- Web and database may ship in either order: the old web never calls these functions; the new web answers 503 on the home card until this file is in.
--
-- Rollback: supabase/rollback/20261215010000_home_ranking_daily.sql
begin;
set local lock_timeout = '5s';

create table public.home_ranking_daily (
  kind text not null check (kind in ('fan_hearts', 'creator_jjinfan')),
  day date not null,
  subject_id uuid not null,
  -- Every ranked subject is kept, not only the shown twenty, so "my rank" is a stored read too.
  rank integer not null check (rank >= 1),
  score bigint not null check (score >= 0),
  -- Fans only: the highest grade held with a creator the score counts, worked out once when the day is written.
  tier text check (tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  hearts bigint not null check (hearts >= 0),
  achieved_at timestamptz not null,
  computed_at timestamptz not null,
  primary key (kind, day, subject_id),
  unique (kind, day, rank)
);
alter table public.home_ranking_daily enable row level security;
revoke all on public.home_ranking_daily from public, anon, authenticated, service_role;

-- A failed build of the day, so the next readers wait five minutes instead of each retrying the whole count behind the lock.
create table public.home_ranking_build_failures (
  day date primary key,
  failed_at timestamptz not null
);
alter table public.home_ranking_build_failures enable row level security;
revoke all on public.home_ranking_build_failures from public, anon, authenticated, service_role;

-- One row per built day, written with the day's rows. A day with no scores is still built, so it is not rebuilt on every read.
create table public.home_ranking_builds (
  day date primary key,
  computed_at timestamptz not null
);
alter table public.home_ranking_builds enable row level security;
revoke all on public.home_ranking_builds from public, anon, authenticated, service_role;

-- passport_hearts for every (fan, creator) with a positive sum, active members only. Same terms as passport_hearts(uuid, uuid).
create function public.heart_totals()
returns table (app_user_id uuid, celebrity_id uuid, hearts bigint, achieved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.app_user_id, x.celebrity_id, sum(x.n)::bigint, max(x.at)
    from (select l.app_user_id, l.celebrity_id, l.amount::bigint as n, l.created_at as at from public.creator_heart_ledger l where l.source_type = 'passport_page_claim'
          union all
          select c.app_user_id, c.celebrity_id, c.hearts::bigint, c.converted_at from public.fan_heart_conversions c where c.hearts > 0) x
    join public.app_users u on u.id = x.app_user_id and u.status = 'active'
   group by x.app_user_id, x.celebrity_id
  having sum(x.n) > 0
$$;

-- 찐팬 of one creator: active fans whose passport_hearts there is positive (하트 1개 = 찐팬 1명).
create function public.creator_jjinfan_count(p_celebrity uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select x.app_user_id
      from (select l.app_user_id, l.amount::bigint as n from public.creator_heart_ledger l where l.celebrity_id = p_celebrity and l.source_type = 'passport_page_claim'
            union all
            select c.app_user_id, c.hearts::bigint from public.fan_heart_conversions c where c.celebrity_id = p_celebrity) x
      join public.app_users u on u.id = x.app_user_id and u.status = 'active'
     group by x.app_user_id
    having sum(x.n) > 0) f
$$;

create function public.refresh_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
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
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, achieved_at, computed_at)
  select 'fan_hearts', d, r.subject_id, r.rn, r.score, r.score,
         (select case max(public.fan_level_rank(public.get_fan_effective_tier(r.subject_id, t.celebrity_id)))
                   when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' when 5 then 'Diamond' end
            from pg_temp.home_heart_totals t where t.app_user_id = r.subject_id and t.counted),
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

-- Read-time build (decision 2026-11-08 08:25): build the day once if it is missing. The first check skips the lock on an ordinary read;
-- the second, under the lock, makes a concurrent first reader that waited return without building again.
create function public.ensure_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
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

-- Shared head of both readers: the newest day, the day before it, and whether seven days of history exist.
create function public.home_ranking_days(p_kind text)
returns table (day date, previous date, comparable boolean, computed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.day, t.day - 1, t.day - (select min(h.day) from public.home_ranking_daily h where h.kind = p_kind) >= 7,
         (select max(h.computed_at) from public.home_ranking_daily h where h.kind = p_kind and h.day = t.day)
    from (select max(h.day) as day from public.home_ranking_daily h where h.kind = p_kind) t
$$;

-- Platform fans for the home card: nickname, character, grade, hearts and movement. No member id leaves; the viewer's own row is flagged.
create function public.read_home_fan_ranking(p_viewer uuid default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb; me jsonb;
begin
  select * into h from public.home_ranking_days('fan_hearts');
  -- Stored values only: rank, score and grade come from the day's rows. Read-time filters (sanction now, blocks with the viewer) close the ranks up.
  with visible as (
    select t.subject_id, t.score, t.rank as stored_rank, t.tier, pg_catalog.row_number() over (order by t.rank) as rn
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
      'delta', case when h.comparable then (select y.rank - v.stored_rank from public.home_ranking_daily y where y.kind = 'fan_hearts' and y.day = h.previous and y.subject_id = v.subject_id) end
    ) order by v.rn)
      from visible v
      left join public.user_profiles pr on pr.app_user_id = v.subject_id
      left join public.app_user_avatars av on av.app_user_id = v.subject_id
     where v.rn <= lim), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.score, 'inTop', m.rn <= lim) from visible m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me;
  return pg_catalog.jsonb_build_object('day', h.day, 'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false), 'rows', items, 'me', me);
end $$;

-- Creators for the home card by fans holding hearts, then heart total. Pages that went private, unlisted or archived since the write leave at read time.
create function public.read_home_creator_ranking(p_locale text default 'ko', p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb;
begin
  select * into h from public.home_ranking_days('creator_jjinfan');
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'slug', s.slug, 'name', s.name, 'imageUrl', s.image_url, 'score', s.score, 'hearts', s.hearts,
      'challenge', exists (select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id = s.subject_id and j.enabled),
      'delta', case when h.comparable then (select y.rank - s.stored_rank from public.home_ranking_daily y where y.kind = 'creator_jjinfan' and y.day = h.previous and y.subject_id = s.subject_id) end
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
  return pg_catalog.jsonb_build_object('day', h.day, 'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false), 'rows', items);
end $$;

-- The home "당신의 최애" rail lists every published creator. Its discovery chips (all, by role) follow the same `listed` flag as the rankings;
-- the viewer's own chip (내 최애) keeps unlisted pages. Slugs only: the flag is not secret, the page stays reachable by its link.
create function public.list_unlisted_creator_slugs()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(c.slug order by c.slug), '{}')
    from public.celebrities c
   where c.status = 'published' and c.archived_at is null and not public.creator_listed(c.id)
$$;

revoke all on function public.list_unlisted_creator_slugs() from public, anon, authenticated, service_role;
grant execute on function public.list_unlisted_creator_slugs() to service_role;
revoke all on function public.heart_totals(), public.creator_jjinfan_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ensure_home_rankings(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.ensure_home_rankings(timestamptz) to service_role;
revoke all on function public.refresh_home_rankings(timestamptz), public.home_ranking_days(text),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer), public.refresh_home_rankings(timestamptz) to service_role;

-- The new functions belong to the applying role (dev: byus_admin, a member of postgres). Make sure it can read what they read, then fail here,
-- not at the first home read, if it still cannot. Policies made here are named r4b_read_<role>; the rollback of this file drops them.
do $check$
declare t text; f text; c pg_catalog.pg_class; me pg_catalog.pg_roles; gaps text[] := '{}';
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if me.rolsuper then return; end if;
  foreach t in array array['creator_heart_ledger', 'fan_heart_conversions', 'celebrities', 'celebrity_localizations', 'group_pages', 'app_users', 'user_profiles', 'app_user_avatars', 'app_user_moderation_restrictions', 'user_blocks', 'jjinfan_challenge_campaigns'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') and not (t = 'jjinfan_challenge_campaigns' and pg_catalog.has_column_privilege(me.oid, c.oid, 'enabled', 'select')) then
      gaps := gaps || format('select on %s', t);
      continue;
    end if;
    -- Row security binds this role unless it bypasses it, or owns the table (directly or as a member of the owner, as byus_admin of postgres on dev)
    -- and the table is not FORCE. Where it binds and no policy lets it read, give it its own read policy, as 20261213060000 does for its owners.
    -- The campaign table stays limited to switched-on rows, so an administrator's draft is never readable through these functions.
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, c.relowner, 'USAGE'))
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin
        execute format('create policy %I on public.%I for select to %I using (%s)', 'r4b_read_' || me.rolname, t, me.rolname, case when t = 'jjinfan_challenge_campaigns' then 'enabled' else 'true' end);
      exception when insufficient_privilege then gaps := gaps || format('read policy on %s', t);
      end;
    end if;
  end loop;
  foreach f in array array['public.platform_fan_heart_counted(uuid)', 'public.creator_listed(uuid)', 'public.get_fan_effective_tier(uuid,uuid)', 'public.fan_level_rank(text)'] loop
    if not pg_catalog.has_function_privilege(me.oid, f, 'execute') then gaps := gaps || format('execute %s', f); end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'HOME_RANKING_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;

-- Every 10 minutes where pg_cron is installed. A second run replaces the job instead of adding one.
do $cron$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'home-ranking-daily';
    perform cron.schedule('home-ranking-daily', '*/10 * * * *', 'select public.refresh_home_rankings()');
  end if;
end $cron$;

-- Write today now, so the first reader does not wait for the build.
select public.refresh_home_rankings();
commit;

-- PostgREST learns the new functions without a restart.
notify pgrst, 'reload schema';
