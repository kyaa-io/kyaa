-- Rollback of 20261215060000_fan_tier_history. Roll the web back first (it calls these functions). The recorded history is lost.
begin;
set local lock_timeout = '5s';
drop function if exists public.read_fan_tier_history(uuid, uuid);
drop function if exists public.mark_fan_tier_changes_seen(uuid, uuid[]);
drop function if exists public.observe_fan_tiers(uuid, public.content_locale);
drop function if exists public.fan_tier_rank(text);
drop table if exists public.fan_tier_history;
commit;
