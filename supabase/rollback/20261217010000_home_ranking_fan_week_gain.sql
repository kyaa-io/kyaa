-- Rollback for 20261217010000_home_ranking_fan_week_gain.sql: read_home_fan_ranking as 20261216020000 wrote it (no weekGain, no weekGainDays).
-- The web reads both as optional, so the web may stay on the new version.
begin;
set local lock_timeout = '5s';

create or replace function public.read_home_fan_ranking(p_viewer uuid default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h record; lim integer := least(greatest(coalesce(p_limit, 20), 1), 20); items jsonb; me jsonb;
begin
  select * into h from public.home_ranking_days('fan_hearts');
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
  return pg_catalog.jsonb_build_object('day', h.day, 'builtDay', (select max(b.day) from public.home_ranking_builds b), 'computedAt', h.computed_at, 'comparable', coalesce(h.comparable, false), 'rows', items, 'me', me);
end $$;

revoke all on function public.read_home_fan_ranking(uuid, integer) from public, anon, authenticated;
grant execute on function public.read_home_fan_ranking(uuid, integer) to service_role;
commit;

notify pgrst, 'reload schema';
