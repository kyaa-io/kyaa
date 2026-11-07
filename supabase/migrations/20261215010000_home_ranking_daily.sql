-- 261107-2 feedback C3: the home ranking card shows day-over-day movement (▲▼—).
-- ranking_snapshots keeps one row per open period and is overwritten in place, so it has no yesterday. This file adds a per-day table instead:
--   home_ranking_daily  kind fan_hearts       subject = fan,       score = that fan's passport_page_claim hearts across every counted creator (all time)
--                       kind creator_jjinfan  subject = celebrity, score = fans holding at least one counted heart there, hearts = heart total
-- Counted pages and members are the same as the existing platform rankings: platform_fan_heart_counted (published, not archived, not anonymous,
-- not the wave page), creator_listed (fan page not unlisted), a fan group page exists, members active. Sanctioned members leave the fan rows when
-- the day is written and again at read time; blocks with the viewer leave at read time. Ranks are counted again after the read-time filters.
-- refresh_home_rankings(p_now) rewrites today's (KST) rows; the last write of a day is that day's standing. Yesterday = the day before the newest day.
-- Movement shows only after seven days of history (decision C3); before that, and for a row not ranked yesterday, delta is null (shown as —).
-- Schedule: pg_cron every 10 minutes where pg_cron exists (dev, production); local databases without it rely on the dev read-time refresh.
-- Web and database may ship in either order: the old web never calls these functions; the new web answers 503 on the home card until this file is in.
--
-- Rollback: supabase/rollback/20261215010000_home_ranking_daily.sql
begin;
set local lock_timeout = '5s';

create table public.home_ranking_daily (
  kind text not null check (kind in ('fan_hearts', 'creator_jjinfan')),
  day date not null,
  subject_id uuid not null,
  rank integer not null check (rank between 1 and 100),
  score bigint not null check (score >= 0),
  hearts bigint not null check (hearts >= 0),
  achieved_at timestamptz not null,
  computed_at timestamptz not null,
  primary key (kind, day, subject_id),
  unique (kind, day, rank)
);
alter table public.home_ranking_daily enable row level security;
revoke all on public.home_ranking_daily from public, anon, authenticated, service_role;

create function public.refresh_home_rankings(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := (p_now at time zone 'Asia/Seoul')::date; fans integer; creators integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('home_ranking_daily'));
  delete from public.home_ranking_daily where day = d or day < d - 35;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'fan_hearts', d, r.subject_id, r.rn, r.score, r.score, r.achieved_at, p_now
    from (select s.subject_id, s.score, s.achieved_at, pg_catalog.row_number() over (order by s.score desc, s.achieved_at asc, s.subject_id asc) as rn
            from public.ranking_scores('fan_hearts', null, '-infinity'::timestamptz, 'infinity'::timestamptz) s
           where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = s.subject_id and mr.revoked_at is null)) r
   where r.rn <= 100;
  get diagnostics fans = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'creator_jjinfan', d, r.celebrity_id, r.rn, r.fans, r.hearts, r.achieved_at, p_now
    from (select x.celebrity_id, x.fans, x.hearts, x.achieved_at,
                 pg_catalog.row_number() over (order by x.fans desc, x.hearts desc, x.achieved_at asc, x.celebrity_id asc) as rn
            from (select l.celebrity_id, count(distinct l.app_user_id) as fans, count(*) as hearts, max(l.created_at) as achieved_at
                    from public.creator_heart_ledger l
                    join public.app_users u on u.id = l.app_user_id and u.status = 'active'
                   where l.source_type = 'passport_page_claim'
                   group by l.celebrity_id) x
           where public.platform_fan_heart_counted(x.celebrity_id) and public.creator_listed(x.celebrity_id)
             and exists (select 1 from public.group_pages g where g.celebrity_id = x.celebrity_id and g.kind = 'fan')) r
   where r.rn <= 100;
  get diagnostics creators = row_count;
  return pg_catalog.jsonb_build_object('day', d, 'fans', fans, 'creators', creators, 'computedAt', p_now);
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
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb; me jsonb; mine record;
begin
  select * into h from public.home_ranking_days('fan_hearts');
  with shown as (
    select t.subject_id, t.score, t.rank as stored_rank, coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan') as nickname,
           coalesce(av.selected_character_id, 'star-pink') as character_id,
           pg_catalog.row_number() over (order by t.rank) as rn
      from public.home_ranking_daily t
      join public.app_users au on au.id = t.subject_id and au.status = 'active'
      left join public.user_profiles pr on pr.app_user_id = au.id
      left join public.app_user_avatars av on av.app_user_id = au.id
     where t.kind = 'fan_hearts' and t.day = h.day
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = au.id and mr.revoked_at is null)
       and (p_viewer is null or not exists (select 1 from public.user_blocks b
             where (b.app_user_id = p_viewer and b.blocked_app_user_id = au.id) or (b.app_user_id = au.id and b.blocked_app_user_id = p_viewer)))
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'score', s.score, 'nickname', s.nickname, 'characterId', s.character_id, 'isMe', p_viewer is not null and s.subject_id = p_viewer,
      'delta', case when h.comparable then (select y.rank - s.stored_rank from public.home_ranking_daily y where y.kind = 'fan_hearts' and y.day = h.previous and y.subject_id = s.subject_id) end,
      'tier', (select case max(public.fan_level_rank(public.get_fan_effective_tier(s.subject_id, x.celebrity_id)))
                        when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' when 5 then 'Diamond' end
                 from (select distinct l.celebrity_id from public.creator_heart_ledger l
                        where l.app_user_id = s.subject_id and l.source_type = 'passport_page_claim' and public.platform_fan_heart_counted(l.celebrity_id)) x)
    ) order by s.rn), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.score, 'inTop', m.rn <= lim) from shown m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me
    from shown s where s.rn <= lim;
  -- Outside the stored hundred: the live rank over all time, the same count the platform ranking uses.
  if me is null and p_viewer is not null then
    select * into mine from public.ranking_scores('fan_hearts', null, '-infinity'::timestamptz, 'infinity'::timestamptz) s where s.subject_id = p_viewer;
    if mine.subject_id is not null then
      me := pg_catalog.jsonb_build_object('rank', 1 + (select count(*) from public.ranking_scores('fan_hearts', null, '-infinity'::timestamptz, 'infinity'::timestamptz) s
              where s.score > mine.score or (s.score = mine.score and (s.achieved_at < mine.achieved_at or (s.achieved_at = mine.achieved_at and s.subject_id < mine.subject_id)))),
        'score', mine.score, 'inTop', false);
    end if;
  end if;
  return pg_catalog.jsonb_build_object('day', h.day, 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false), 'rows', items, 'me', me);
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
  return pg_catalog.jsonb_build_object('day', h.day, 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false), 'rows', items);
end $$;

revoke all on function public.refresh_home_rankings(timestamptz), public.home_ranking_days(text),
  public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_home_fan_ranking(uuid, integer), public.read_home_creator_ranking(text, integer), public.refresh_home_rankings(timestamptz) to service_role;

-- The new functions belong to the applying role. Fail here, not at the first home read, when that role cannot see what they read.
do $check$
declare t text; f text; c pg_catalog.pg_class; me pg_catalog.pg_roles; gaps text[] := '{}';
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if me.rolsuper then return; end if;
  foreach t in array array['creator_heart_ledger', 'celebrities', 'celebrity_localizations', 'group_pages', 'app_users', 'user_profiles', 'app_user_avatars',
                           'app_user_moderation_restrictions', 'user_blocks', 'jjinfan_challenge_campaigns'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') and not (t = 'jjinfan_challenge_campaigns' and pg_catalog.has_column_privilege(me.oid, c.oid, 'enabled', 'select')) then
      gaps := gaps || format('select on %s', t);
    end if;
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> me.oid)
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and me.oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
      gaps := gaps || format('read policy on %s', t);
    end if;
  end loop;
  foreach f in array array['public.platform_fan_heart_counted(uuid)', 'public.creator_listed(uuid)', 'public.ranking_scores(text,uuid,timestamptz,timestamptz)',
                           'public.get_fan_effective_tier(uuid,uuid)', 'public.fan_level_rank(text)'] loop
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

-- Write today now, so the card is not empty until the first scheduled run.
select public.refresh_home_rankings();
commit;
