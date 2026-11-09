-- Rollback of 20261220070000_admin_weekly_metrics.sql: the weekly table of the admin traffic screen loses its reader (the screen then shows
-- its error state for that table only). The app needs no change first. Select policies the migration created for a non-superuser owner
-- (metrics_weekly_owner_<role>) are dropped; table grants it may have made stay, as they cannot be told from earlier ones.
begin;
set local lock_timeout = '5s';

drop function if exists public.read_admin_weekly_metrics(uuid, uuid);
drop index if exists public.metrics_weekly_attendance_created_idx, public.metrics_weekly_fan_posts_created_idx,
  public.metrics_weekly_fan_post_comments_created_idx, public.metrics_weekly_lounge_created_idx, public.metrics_weekly_group_posts_created_idx,
  public.metrics_weekly_group_comments_created_idx, public.metrics_weekly_points_created_idx, public.metrics_weekly_hearts_created_idx,
  public.metrics_weekly_conversions_converted_idx;

do $policies$
declare p record;
begin
  for p in select pol.polname, c.relname from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
      where c.relnamespace = 'public'::regnamespace and pol.polname like 'metrics\_weekly\_owner\_%' loop
    execute pg_catalog.format('drop policy %I on public.%I', p.polname, p.relname);
  end loop;
end
$policies$;

notify pgrst, 'reload schema';
commit;
