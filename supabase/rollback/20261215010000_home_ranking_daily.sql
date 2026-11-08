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
drop function public.creator_jjinfan_count(uuid);
drop function public.heart_totals();
drop function public.refresh_home_rankings(timestamptz);
-- Read policies the migration (or 20261215020000) made for its applying role.
do $policies$
declare r record;
begin
  for r in select p.polname, c.relname from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
            where c.relnamespace = 'public'::regnamespace and p.polname like 'r4b\_read\_%' loop
    execute format('drop policy %I on public.%I', r.polname, r.relname);
  end loop;
end $policies$;
drop table public.home_ranking_daily;
drop table public.home_ranking_builds;
drop table public.home_ranking_build_failures;
commit;
notify pgrst, 'reload schema';
