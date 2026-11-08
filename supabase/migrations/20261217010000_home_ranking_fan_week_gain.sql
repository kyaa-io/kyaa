-- 2026-11-09 r5 (plan-ux-r5 3.5 ③, R18): the home fan ranking rows carry weekGain as the creator rows already do (20261216020000),
-- so a row with no yesterday to compare with still shows a movement (`+N` hearts over the rolling seven days) instead of an empty slot.
--   fans  weekGain     = today's hearts minus the hearts on the oldest built day in the last seven; a fan absent that day counts from 0.
--         weekGainDays = how many days that comparison spans (7 once a week of days is kept). Both null on the first day.
-- Read only: no table, column or write path changes; the same stored day rows are compared. Signature unchanged (old web keeps calling it).
-- Web and database may ship in either order: the old web drops the unknown keys; the new web reads weekGain and weekGainDays as optional.
-- Depends on 20261216020000.
--
-- Rollback: supabase/rollback/20261217010000_home_ranking_fan_week_gain.sql
begin;
set local lock_timeout = '5s';

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

-- create or replace keeps the grants (service role only); stated again so a reader of this file sees them.
revoke all on function public.read_home_fan_ranking(uuid, integer) from public, anon, authenticated;
grant execute on function public.read_home_fan_ranking(uuid, integer) to service_role;
commit;

-- PostgREST learns the new answer shape without a restart.
notify pgrst, 'reload schema';
