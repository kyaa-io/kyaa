-- Rollback for 20261228160000_platform_follower_collector.sql. Roll the web back first: the new
-- /api/internal/platform-followers route calls this function. Collected rows stay (the ranking keeps showing them).
begin;
set local lock_timeout = '5s';
drop function if exists public.save_collected_platform_followers(uuid,text,text,bigint,smallint,text,timestamptz);
commit;
