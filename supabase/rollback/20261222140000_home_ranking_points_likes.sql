-- Rolls back 20261222140000_home_ranking_points_likes. Web first (it must stop asking for metric=points / likes), then this file.
begin;
set local lock_timeout = '5s';

do $patch$
declare def text;
  plain constant text := $a$  insert into public.home_ranking_builds(day, computed_at) values (d, p_now)$a$;
  patched constant text := $b$  perform public.build_home_metric_rankings(d, p_now);
  insert into public.home_ranking_builds(day, computed_at) values (d, p_now)$b$;
  ref_plain constant text := $c$  if k is null then return null; end if;$c$;
  ref_patched constant text := $d$  if k is null then return null; end if;
  if k = 'fan_points' then return public.home_ranking_points_subject(p_viewer, p_ref); end if;$d$;
begin
  def := pg_catalog.pg_get_functiondef('public.refresh_home_rankings(timestamptz)'::regprocedure);
  if position(patched in def) > 0 then execute replace(def, patched, plain); end if;
  def := pg_catalog.pg_get_functiondef('public.home_ranking_profile_subject(uuid,jsonb)'::regprocedure);
  if position(ref_patched in def) > 0 then execute replace(def, ref_patched, ref_plain); end if;
end $patch$;

drop function if exists public.read_home_fan_ranking_v3(uuid, text, integer);
drop function if exists public.read_home_creator_ranking_v3(text, text, integer);
drop function if exists public.home_ranking_points_subject(uuid, jsonb);
drop function if exists public.home_ranking_ticket_balance(uuid);
drop function if exists public.build_home_metric_rankings(date, timestamptz);

delete from public.home_ranking_daily where kind in ('fan_point_all', 'fan_point_day', 'fan_point_week', 'creator_like_all', 'creator_like_day', 'creator_like_week');
delete from public.home_ranking_kind_builds where kind in ('fan_point_all', 'fan_point_day', 'fan_point_week', 'creator_like_all', 'creator_like_day', 'creator_like_week');
alter table public.home_ranking_daily drop constraint home_ranking_daily_kind_check;
alter table public.home_ranking_daily add constraint home_ranking_daily_kind_check check (kind = any (array['fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts']::text[]));
alter table public.home_ranking_kind_builds drop constraint home_ranking_kind_builds_kind_check;
alter table public.home_ranking_kind_builds add constraint home_ranking_kind_builds_kind_check check (kind = any (array['fan_hearts', 'fan_points', 'creator_jjinfan', 'creator_hearts']::text[]));
commit;

notify pgrst, 'reload schema';
