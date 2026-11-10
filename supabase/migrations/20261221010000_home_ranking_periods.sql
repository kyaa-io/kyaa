-- RANK-HOME-V3: the home ranking by hearts gained in a period, "day" (today) and "week" (rolling seven days), beside the existing cumulative list.
-- Two new readers; the cumulative readers (read_home_fan_ranking_v2, read_home_creator_ranking_v2) and every table are untouched.
--   gain      hearts now minus the same subject's hearts on the base day. day: the preceding KST calendar day (needs its build record, else no rows);
--             week: the oldest record of the kind within the seven days before the day (home_ranking_days.base, else no rows). A subject absent from
--             the base day held nothing there, so it counts from 0. Only gain > 0 is ranked; zero and negative are not rows.
--   rank      row_number by gain desc, then the cumulative stored rank. score and hearts of a row are the gain; delta is null and comparable false
--             (no movement for a period list). profileRef keeps the cumulative stored rank and metric 'hearts', so the same locator resolves.
--   filters   the readers of v2: active member, no open sanction, no block with the viewer; creators counted and listed.
-- No ledger writes, no new refresh path: the day table is still built by ensure_home_rankings / refresh_home_rankings.
-- Order: database first, then web. The web asks for a period only after this file is applied.
-- Rollback: supabase/rollback/20261221010000_home_ranking_periods.sql
begin;
set local lock_timeout = '5s';

create or replace function public.read_home_fan_ranking_period(p_viewer uuid, p_period text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k constant text := 'fan_hearts';
  h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb; me jsonb; base date;
begin
  if p_period is null or p_period not in ('day', 'week') then raise exception 'RANKING_PERIOD_INVALID' using errcode = '22023'; end if;
  select * into h from public.home_ranking_days(k);
  base := case p_period
    when 'day' then case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = k and b.day = h.day - 1) then h.day - 1 end
    else h.base end;
  with visible as (
    select t.subject_id, t.hearts as total, t.jjinfan_count, t.rank as stored_rank, t.tier, t.favorite_celebrity_id,
           t.hearts - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = k and y.day = base and y.subject_id = t.subject_id), 0) as gain
      from public.home_ranking_daily t
      join public.app_users au on au.id = t.subject_id and au.status = 'active'
     where base is not null and t.kind = k and t.day = h.day
       and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = t.subject_id and mr.revoked_at is null)
       and (p_viewer is null or not exists (select 1 from public.user_blocks b
             where (b.app_user_id = p_viewer and b.blocked_app_user_id = t.subject_id) or (b.app_user_id = t.subject_id and b.blocked_app_user_id = p_viewer)))
  ), ranked as (
    select v.*, pg_catalog.row_number() over (order by v.gain desc, v.stored_rank asc) as rn from visible v where v.gain > 0
  )
  select coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', v.rn, 'score', v.gain, 'hearts', v.gain, 'points', null, 'tier', v.tier,
      'isMe', p_viewer is not null and v.subject_id = p_viewer,
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink'),
      'delta', null,
      'dayGain', case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = k and b.day = h.day - 1)
        then v.total - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = k and y.day = h.day - 1 and y.subject_id = v.subject_id), 0) end,
      'fans', v.jjinfan_count,
      'weekGain', case when h.base is not null then v.total - coalesce((select w.score from public.home_ranking_daily w where w.kind = k and w.day = h.base and w.subject_id = v.subject_id), 0) end,
      'favorite', (select pg_catalog.jsonb_build_object('slug', c.slug,
                     'names', coalesce((select pg_catalog.jsonb_object_agg(l.locale::text, l.name) from public.celebrity_localizations l where l.celebrity_id = c.id and nullif(pg_catalog.btrim(l.name), '') is not null), '{}'::jsonb))
                     from public.celebrities c
                    where c.id = v.favorite_celebrity_id and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id))
    ) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'home_ranking', 'day', h.day,
          'computedAt', h.computed_at, 'metric', 'hearts', 'rank', v.stored_rank)) else '{}'::jsonb end order by v.rn)
      from ranked v
      left join public.user_profiles pr on pr.app_user_id = v.subject_id
      left join public.app_user_avatars av on av.app_user_id = v.subject_id
     where v.rn <= lim), '[]'::jsonb),
    (select pg_catalog.jsonb_build_object('rank', m.rn, 'score', m.gain, 'hearts', m.gain, 'points', null, 'inTop', m.rn <= lim, 'delta', null)
       from ranked m where p_viewer is not null and m.subject_id = p_viewer)
    into items, me;
  return pg_catalog.jsonb_build_object('state', h.state, 'day', h.day, 'today', h.today, 'previousDay', h.previous,
    'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'failedAt', h.failed_at,
    'comparable', false, 'weekGainDays', h.day - base, 'metric', 'hearts', 'period', p_period, 'rows', items, 'me', me);
end $$;

create or replace function public.read_home_creator_ranking_period(p_locale text, p_period text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k constant text := 'creator_hearts';
  h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 50); items jsonb; base date;
begin
  if p_period is null or p_period not in ('day', 'week') then raise exception 'RANKING_PERIOD_INVALID' using errcode = '22023'; end if;
  select * into h from public.home_ranking_days(k);
  base := case p_period
    when 'day' then case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = k and b.day = h.day - 1) then h.day - 1 end
    else h.base end;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', s.rn, 'slug', s.slug, 'name', s.name, 'imageUrl', s.image_url, 'score', s.gain, 'hearts', s.gain, 'points', null,
      'dayGain', case when exists (select 1 from public.home_ranking_kind_builds b where b.kind = k and b.day = h.day - 1)
        then s.total - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = k and y.day = h.day - 1 and y.subject_id = s.subject_id), 0) end,
      'fans', coalesce((select j.score from public.home_ranking_daily j where j.kind = 'creator_jjinfan' and j.day = h.day and j.subject_id = s.subject_id), 0),
      'liveNow', public.home_ranking_live_now(s.subject_id),
      'challenge', exists (select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id = s.subject_id and j.enabled),
      'delta', null,
      'weekGain', case when h.base is not null then s.total - coalesce((select w.score from public.home_ranking_daily w where w.kind = k and w.day = h.base and w.subject_id = s.subject_id), 0) end
    ) order by s.rn), '[]'::jsonb) into items
    from (select g.*, pg_catalog.row_number() over (order by g.gain desc, g.stored_rank asc) as rn
            from (select t.subject_id, t.hearts as total, t.rank as stored_rank, c.slug, c.image_url, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                         t.hearts - coalesce((select y.hearts from public.home_ranking_daily y where y.kind = k and y.day = base and y.subject_id = t.subject_id), 0) as gain
                    from public.home_ranking_daily t
                    join public.celebrities c on c.id = t.subject_id
                    left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
                    left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
                    left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
                   where base is not null and t.kind = k and t.day = h.day and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)) g
           where g.gain > 0) s
   where s.rn <= lim;
  return pg_catalog.jsonb_build_object('state', h.state, 'day', h.day, 'today', h.today, 'previousDay', h.previous,
    'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'failedAt', h.failed_at,
    'comparable', false, 'weekGainDays', h.day - base, 'metric', 'hearts', 'period', p_period, 'rows', items);
end $$;

-- Grants like the v2 readers: the service role only. Same owner as the v2 readers (they read the day tables under FORCE row level security
-- with a policy for that owner).
revoke all on function public.read_home_fan_ranking_period(uuid, text, integer), public.read_home_creator_ranking_period(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_home_fan_ranking_period(uuid, text, integer), public.read_home_creator_ranking_period(text, text, integer) to service_role;

do $owner$
declare fn_owner name := pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure));
  f text;
begin
  foreach f in array array['public.read_home_fan_ranking_period(uuid,text,integer)', 'public.read_home_creator_ranking_period(text,text,integer)'] loop
    if pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid = f::regprocedure)) <> fn_owner then
      execute format('alter function %s owner to %I', f, fn_owner);
    end if;
  end loop;
end $owner$;

do $check$
declare f text; r name; fp pg_catalog.pg_proc;
  owner oid := (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure);
begin
  foreach f in array array['public.read_home_fan_ranking_period(uuid,text,integer)', 'public.read_home_creator_ranking_period(text,text,integer)'] loop
    select * into fp from pg_catalog.pg_proc where oid = f::regprocedure;
    if fp.proowner <> owner then raise exception 'HOME_RANKING_PERIOD_CHECK: % has another owner', f; end if;
    if not fp.prosecdef or not coalesce(fp.proconfig @> array['search_path=""'], false) then raise exception 'HOME_RANKING_PERIOD_CHECK: % is not definer with an empty search_path', f; end if;
    if not pg_catalog.has_function_privilege('service_role', f, 'execute') then raise exception 'HOME_RANKING_PERIOD_CHECK: service_role cannot execute %', f; end if;
    foreach r in array array['anon', 'authenticated']::name[] loop
      if pg_catalog.has_function_privilege(r, f, 'execute') then raise exception 'HOME_RANKING_PERIOD_CHECK: % may execute %', r, f; end if;
    end loop;
  end loop;
end $check$;
commit;

notify pgrst, 'reload schema';
