-- Rollback for 20261214042000_creator_fan_ranking_listed.sql: the creator fan-count ranking lists unlisted creators again.
begin;
set local lock_timeout='5s';
do $$
declare definition text; needle constant text := 'where public.platform_fan_heart_counted(c.id) and f.fans > 0 and public.creator_listed(c.id)';
begin
  definition := pg_catalog.pg_get_functiondef('public.read_creator_fan_ranking(text,integer)'::regprocedure);
  if position(needle in definition) = 0 then raise exception 'CREATOR_FAN_RANKING_LISTED_ROLLBACK_SHAPE'; end if;
  execute replace(definition, needle, 'where public.platform_fan_heart_counted(c.id) and f.fans > 0');
end $$;
commit;
