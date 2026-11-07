-- Rollback for 20261215020000_active_jjinfan_challenges.sql. Roll the web back first: the new home module and card tags read /api/rankings/challenges.
begin;
set local lock_timeout = '5s';
drop function public.read_active_jjinfan_challenges(text, integer);
commit;
