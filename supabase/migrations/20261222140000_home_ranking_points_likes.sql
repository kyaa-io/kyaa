-- RANK-METRIC-0520 (대표 11/11 01:55): the home ranking ranks fans by points earned and creators by page likes, for today, seven days and all time.
--   fans      points earned = the fan_point rows of mobile_fan_economy_ledger with amount > 0 (spending and corrections are left out), by active,
--             unsanctioned members. all: every row up to the build; day: since today 00:00 KST; week: since 00:00 KST six days before today.
--   creators  page likes = fan_reactions rows ("Leave a like", one per fan and page) of active members, for the creators the hearts list may name
--             (counted, listed, with a fan page). Same windows. Every such creator is a row, so a quiet day still lists them (0 likes, then hearts).
--   stats     a fan row keeps hearts and 찐팬 count of the same build; tickets are read live. A creator row keeps hearts and 찐팬 count.
--             No SNS follower count is stored anywhere, so none is answered.
--   movement  the snapshot rule of the other kinds: previous built day's stored rank minus today's, per kind.
-- Six new kinds, written by refresh_home_rankings (patched to call build_home_metric_rankings before it records the build), so ensure_home_rankings,
-- the 10-minute rebuild on read and the release data step 35 build them with the hearts lists. Old kinds and readers stay as they are.
-- Readers: read_home_fan_ranking_v3 / read_home_creator_ranking_v3 (period all | day | week). Operator and test accounts stay out of the fan list
-- (20261221160000 rule). A points profile reference now resolves against fan_point_all.
-- Order: database first, then web. Rollback: supabase/rollback/20261222140000_home_ranking_points_likes.sql
begin;
set local lock_timeout = '5s';

alter table public.home_ranking_daily drop constraint home_ranking_daily_kind_check;
alter table public.home_ranking_daily add constraint home_ranking_daily_kind_check check (kind = any (array['fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts',
  'fan_point_all', 'fan_point_day', 'fan_point_week', 'creator_like_all', 'creator_like_day', 'creator_like_week']::text[]));
alter table public.home_ranking_kind_builds drop constraint home_ranking_kind_builds_kind_check;
alter table public.home_ranking_kind_builds add constraint home_ranking_kind_builds_kind_check check (kind = any (array['fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts',
  'fan_point_all', 'fan_point_day', 'fan_point_week', 'creator_like_all', 'creator_like_day', 'creator_like_week']::text[]));

-- Runs inside refresh_home_rankings only: it reads that build's temporary heart copy (pg_temp.home_heart_totals, pg_temp.home_fan_facts).
create or replace function public.build_home_metric_rankings(p_day date, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare day_start constant timestamptz := (p_day::timestamp at time zone 'Asia/Seoul');
  week_start constant timestamptz := ((p_day - 6)::timestamp at time zone 'Asia/Seoul');
  per text; n integer; counts jsonb := '{}'::jsonb;
begin
  drop table if exists pg_temp.home_metric_points;
  create temporary table home_metric_points on commit drop as
    select l.app_user_id, sum(l.amount)::bigint as total,
           coalesce(sum(l.amount) filter (where l.created_at >= day_start), 0)::bigint as day_points,
           coalesce(sum(l.amount) filter (where l.created_at >= week_start), 0)::bigint as week_points,
           max(l.created_at) as last_at
      from public.mobile_fan_economy_ledger l
      join public.app_users u on u.id = l.app_user_id and u.status = 'active'
     where l.asset = 'fan_point' and l.amount > 0 and l.created_at <= p_now
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = l.app_user_id and mr.revoked_at is null)
     group by l.app_user_id;
  drop table if exists pg_temp.home_metric_likes;
  create temporary table home_metric_likes on commit drop as
    select c.id as celebrity_id, c.created_at,
           count(r.id)::bigint as total,
           (count(r.id) filter (where r.completed_at >= day_start))::bigint as day_likes,
           (count(r.id) filter (where r.completed_at >= week_start))::bigint as week_likes,
           max(r.completed_at) as last_at
      from public.celebrities c
      left join public.fan_reactions r on r.celebrity_id = c.id and r.completed_at <= p_now
        and exists (select 1 from public.app_users u where u.id = r.app_user_id and u.status = 'active')
     where public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
       and exists (select 1 from public.group_pages g where g.celebrity_id = c.id and g.kind = 'fan')
     group by c.id, c.created_at;
  drop table if exists pg_temp.home_metric_creator_hearts;
  create temporary table home_metric_creator_hearts on commit drop as
    select t.celebrity_id, sum(t.hearts)::bigint as hearts, count(*)::bigint as fans from pg_temp.home_heart_totals t where t.counted group by t.celebrity_id;

  foreach per in array array['all', 'day', 'week'] loop
    insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, favorite_celebrity_id, achieved_at, computed_at, jjinfan_count)
    select 'fan_point_' || per, p_day, x.app_user_id,
           pg_catalog.row_number() over (order by x.score desc, x.total desc, x.hearts desc, x.last_at asc, x.app_user_id asc),
           x.score, x.hearts, x.tier, x.favorite, x.last_at, p_now, x.jjinfan_count
      from (select p.app_user_id, p.total, p.last_at, case per when 'all' then p.total when 'day' then p.day_points else p.week_points end as score,
                   coalesce(f.hearts, 0) as hearts, f.tier, f.favorite, coalesce(f.jjinfan_count, 0) as jjinfan_count
              from pg_temp.home_metric_points p left join pg_temp.home_fan_facts f on f.app_user_id = p.app_user_id) x;
    get diagnostics n = row_count;
    counts := counts || pg_catalog.jsonb_build_object('fan_point_' || per, n);
    insert into public.home_ranking_kind_builds(kind, day, computed_at, row_count) values ('fan_point_' || per, p_day, p_now, n)
      on conflict (kind, day) do update set computed_at = excluded.computed_at, row_count = excluded.row_count;

    insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at, jjinfan_count)
    select 'creator_like_' || per, p_day, x.celebrity_id,
           pg_catalog.row_number() over (order by x.score desc, x.total desc, x.hearts desc, x.fans desc, x.celebrity_id asc),
           x.score, x.hearts, coalesce(x.last_at, x.created_at), p_now, x.fans
      from (select l.celebrity_id, l.created_at, l.last_at, l.total, case per when 'all' then l.total when 'day' then l.day_likes else l.week_likes end as score,
                   coalesce(h.hearts, 0) as hearts, coalesce(h.fans, 0) as fans
              from pg_temp.home_metric_likes l left join pg_temp.home_metric_creator_hearts h on h.celebrity_id = l.celebrity_id) x;
    get diagnostics n = row_count;
    counts := counts || pg_catalog.jsonb_build_object('creator_like_' || per, n);
    insert into public.home_ranking_kind_builds(kind, day, computed_at, row_count) values ('creator_like_' || per, p_day, p_now, n)
      on conflict (kind, day) do update set computed_at = excluded.computed_at, row_count = excluded.row_count;
  end loop;
  return counts;
end $$;

-- refresh_home_rankings builds the new kinds in the same transaction, after the hearts lists and before it records the build.
do $patch$
declare def text; owner_name name;
  old_text constant text := $a$  insert into public.home_ranking_builds(day, computed_at) values (d, p_now)$a$;
  new_text constant text := $b$  perform public.build_home_metric_rankings(d, p_now);
  insert into public.home_ranking_builds(day, computed_at) values (d, p_now)$b$;
begin
  select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = 'public.refresh_home_rankings(timestamptz)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
    raise exception 'RANK_METRIC_OWNER_GAP: cannot replace refresh_home_rankings owned by %', owner_name;
  end if;
  def := pg_catalog.pg_get_functiondef('public.refresh_home_rankings(timestamptz)'::regprocedure);
  if position('build_home_metric_rankings' in def) = 0 then
    if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then raise exception 'RANK_METRIC_SHAPE: refresh_home_rankings'; end if;
    execute replace(def, old_text, new_text);
  end if;
end $patch$;

-- Tickets of a fan now: the shared wallet when it is on, else the latest balance with each creator, summed.
create or replace function public.home_ranking_ticket_balance(p_app_user_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select case when public.group_wallet_enabled() then public.group_wallet_balance(p_app_user_id, 'ticket')
    else coalesce((select sum(x.balance) from (select distinct on (l.celebrity_id) l.resulting_balance as balance from public.fan_ticket_ledger l
                   where l.app_user_id = p_app_user_id order by l.celebrity_id, l.owner_sequence desc) x), 0)::bigint end
$$;

create or replace function public.read_home_fan_ranking_v3(p_viewer uuid, p_period text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text; h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb; me jsonb;
begin
  if p_period is null or p_period not in ('all', 'day', 'week') then raise exception 'RANKING_PERIOD_INVALID' using errcode = '22023'; end if;
  k := 'fan_point_' || p_period;
  select * into h from public.home_ranking_days(k);
  with visible as (
    select t.subject_id, t.score, t.hearts, t.jjinfan_count, t.rank as stored_rank, t.tier, t.favorite_celebrity_id,
           a.rank as ref_rank, a.score as total_points, pg_catalog.row_number() over (order by t.rank) as rn
      from public.home_ranking_daily t
      join public.app_users au on au.id = t.subject_id and au.status = 'active'
        and not exists (select 1 from public.admin_allowlist aa where aa.active and pg_catalog.lower(aa.email) = pg_catalog.lower(au.verified_email))
        and coalesce(pg_catalog.lower(au.verified_email), '') not like 'test-%@privy.io'
      join public.home_ranking_daily a on a.kind = 'fan_point_all' and a.day = t.day and a.subject_id = t.subject_id
     where t.kind = k and t.day = h.day
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = t.subject_id and mr.revoked_at is null)
       and (p_viewer is null or not exists (select 1 from public.user_blocks b
             where (b.app_user_id = p_viewer and b.blocked_app_user_id = t.subject_id) or (b.app_user_id = t.subject_id and b.blocked_app_user_id = p_viewer)))
  ), moved as (
    select v.*, (select y.rank - v.stored_rank from public.home_ranking_daily y where y.kind = k and y.day = h.previous and y.subject_id = v.subject_id) as delta
      from visible v
  )
  select coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', v.rn, 'score', v.score, 'points', v.score, 'totalPoints', v.total_points, 'hearts', v.hearts,
      'tickets', public.home_ranking_ticket_balance(v.subject_id), 'tier', v.tier,
      'isMe', p_viewer is not null and v.subject_id = p_viewer,
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink'),
      'delta', v.delta, 'fans', v.jjinfan_count, 'isNew', public.home_ranking_recent_entry(k, v.subject_id, h.day),
      'favorite', (select pg_catalog.jsonb_build_object('slug', c.slug,
                     'names', coalesce((select pg_catalog.jsonb_object_agg(l.locale::text, l.name) from public.celebrity_localizations l where l.celebrity_id = c.id and nullif(pg_catalog.btrim(l.name), '') is not null), '{}'::jsonb))
                     from public.celebrities c
                    where c.id = v.favorite_celebrity_id and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id))
    ) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'home_ranking', 'day', h.day,
          'computedAt', h.computed_at, 'metric', 'points', 'rank', v.ref_rank)) else '{}'::jsonb end order by v.rn)
      from moved v
      left join public.user_profiles pr on pr.app_user_id = v.subject_id
      left join public.app_user_avatars av on av.app_user_id = v.subject_id
     where v.rn <= lim), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.score, 'hearts', m.hearts, 'points', m.score, 'inTop', m.rn <= lim, 'delta', m.delta)
       from moved m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me;
  return pg_catalog.jsonb_build_object('state', h.state, 'day', h.day, 'today', h.today, 'previousDay', h.previous,
    'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'failedAt', h.failed_at,
    'comparable', coalesce(h.comparable, false), 'weekGainDays', null, 'metric', 'points', 'period', p_period, 'rows', items, 'me', me);
end $$;

create or replace function public.read_home_creator_ranking_v3(p_locale text, p_period text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k text; h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb;
begin
  if p_period is null or p_period not in ('all', 'day', 'week') then raise exception 'RANKING_PERIOD_INVALID' using errcode = '22023'; end if;
  k := 'creator_like_' || p_period;
  select * into h from public.home_ranking_days(k);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'slug', s.slug, 'name', s.name, 'imageUrl', s.image_url, 'score', s.score, 'likes', s.score, 'totalLikes', s.total_likes,
      'hearts', s.hearts, 'fans', s.fans, 'points', null,
      'liveNow', public.home_ranking_live_now(s.subject_id),
      'isNew', public.home_ranking_recent_entry(k, s.subject_id, h.day),
      'challenge', exists (select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id = s.subject_id and j.enabled),
      'delta', (select y.rank - s.stored_rank from public.home_ranking_daily y where y.kind = k and y.day = h.previous and y.subject_id = s.subject_id),
      'weekGain', null, 'dayGain', null
    ) order by s.rn), '[]'::jsonb) into items
    from (select t.subject_id, t.score, t.hearts, t.jjinfan_count as fans, t.rank as stored_rank, c.slug, c.image_url, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 (select a.score from public.home_ranking_daily a where a.kind = 'creator_like_all' and a.day = t.day and a.subject_id = t.subject_id) as total_likes,
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
    'comparable', coalesce(h.comparable, false), 'weekGainDays', null, 'metric', 'likes', 'period', p_period, 'rows', items);
end $$;

-- A points reference from the v3 list: today's fan_point_all build, the same filters as the list, the viewer's blocks both ways.
create or replace function public.home_ranking_points_subject(p_viewer uuid, p_ref jsonb)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.subject_id
    from public.home_ranking_days('fan_point_all') h
    join public.home_ranking_daily t on t.kind = 'fan_point_all' and t.day = h.day and t.computed_at = h.computed_at
    join public.app_users au on au.id = t.subject_id and au.status = 'active'
      and not exists (select 1 from public.admin_allowlist aa where aa.active and pg_catalog.lower(aa.email) = pg_catalog.lower(au.verified_email))
      and coalesce(pg_catalog.lower(au.verified_email), '') not like 'test-%@privy.io'
   where p_viewer is not null
     and h.day::text = p_ref->>'day' and pg_catalog.to_jsonb(h.computed_at) = p_ref->'computedAt'
     and t.rank::numeric = (p_ref->>'rank')::numeric
     and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = t.subject_id and mr.revoked_at is null)
     and not exists (select 1 from public.user_blocks b
           where (b.app_user_id = p_viewer and b.blocked_app_user_id = t.subject_id) or (b.app_user_id = t.subject_id and b.blocked_app_user_id = p_viewer))
$$;

do $patch$
declare def text; owner_name name;
  old_text constant text := $a$  if k is null then return null; end if;$a$;
  new_text constant text := $b$  if k is null then return null; end if;
  if k = 'fan_points' then return public.home_ranking_points_subject(p_viewer, p_ref); end if;$b$;
begin
  select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = 'public.home_ranking_profile_subject(uuid,jsonb)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
    raise exception 'RANK_METRIC_OWNER_GAP: cannot replace home_ranking_profile_subject owned by %', owner_name;
  end if;
  def := pg_catalog.pg_get_functiondef('public.home_ranking_profile_subject(uuid,jsonb)'::regprocedure);
  if position('home_ranking_points_subject' in def) = 0 then
    if (length(def) - length(replace(def, old_text, ''))) / length(old_text) <> 1 then raise exception 'RANK_METRIC_SHAPE: home_ranking_profile_subject'; end if;
    execute replace(def, old_text, new_text);
  end if;
end $patch$;

revoke all on function public.build_home_metric_rankings(date, timestamptz), public.home_ranking_ticket_balance(uuid), public.home_ranking_points_subject(uuid, jsonb),
  public.read_home_fan_ranking_v3(uuid, text, integer), public.read_home_creator_ranking_v3(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_home_fan_ranking_v3(uuid, text, integer), public.read_home_creator_ranking_v3(text, text, integer) to service_role;

do $owner$
declare fn_owner name := pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.refresh_home_rankings(timestamptz)'::regprocedure));
  f text; fp pg_catalog.pg_proc; r name;
begin
  foreach f in array array['public.build_home_metric_rankings(date,timestamptz)', 'public.home_ranking_ticket_balance(uuid)', 'public.home_ranking_points_subject(uuid,jsonb)',
                           'public.read_home_fan_ranking_v3(uuid,text,integer)', 'public.read_home_creator_ranking_v3(text,text,integer)'] loop
    if pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = f::regprocedure)) <> fn_owner then
      execute format('alter function %s owner to %I', f, fn_owner);
    end if;
    select * into fp from pg_catalog.pg_proc where oid = f::regprocedure;
    if not fp.prosecdef or not coalesce(fp.proconfig @> array['search_path=""'], false) then raise exception 'HOME_RANKING_METRIC_CHECK: % is not definer with an empty search_path', f; end if;
    foreach r in array array['anon', 'authenticated']::name[] loop
      if pg_catalog.has_function_privilege(r, f, 'execute') then raise exception 'HOME_RANKING_METRIC_CHECK: % may execute %', r, f; end if;
    end loop;
  end loop;
end $owner$;
commit;

notify pgrst, 'reload schema';
