-- Rollback for 20261215010000_home_ranking_daily.sql. Roll the web back first: the new home card reads /api/rankings/home, which answers 503 without these functions.
begin;
set local lock_timeout = '5s';
do $cron$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'home-ranking-daily';
  end if;
end $cron$;
drop function public.ensure_home_rankings(timestamptz);
drop function public.list_unlisted_creator_slugs();
drop function public.read_home_creator_ranking(text, integer);
drop function public.read_home_fan_ranking(uuid, integer);
drop function public.home_ranking_days(text);
drop function public.fan_heart_scores();
drop function public.creator_jjinfan_count(uuid);
drop function public.heart_totals();
drop function public.refresh_home_rankings(timestamptz);
drop table public.home_ranking_daily;
drop table public.home_ranking_builds;
commit;
