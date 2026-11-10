-- Roll back the period readers only; the cumulative readers and the tables were not changed by 20261221010000.
-- The web asks for a period only after that file is applied: roll the web back first, then this.
-- Reapply: supabase/migrations/20261221010000_home_ranking_periods.sql
begin;
set local lock_timeout = '5s';
drop function if exists public.read_home_fan_ranking_period(uuid, text, integer);
drop function if exists public.read_home_creator_ranking_period(text, text, integer);
commit;

notify pgrst, 'reload schema';
