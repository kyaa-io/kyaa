-- Rollback of 20261219082000_group_mission_stats.sql: mission-stats goes away, the dispatcher is the one before it.
begin;
set local lock_timeout = '5s';
drop function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid);
alter function public.group_activities_dispatch_before_mission_stats(text,uuid,uuid,uuid,uuid,jsonb,uuid) rename to group_activities_dispatch;
grant execute on function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid) to service_role;
drop function public.group_mission_stats_read(uuid,uuid,jsonb);
drop index public.group_mission_submissions_mission_created;
drop index public.group_mission_submission_reviews_submission_created;
notify pgrst, 'reload schema';
commit;
