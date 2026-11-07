-- The home card's creator tab (/api/rankings/creators?metric=fans, read_creator_fan_ranking) still listed creators whose fan page is
-- unlisted; 20261214030000 filtered only the hearts ranking and the directory. Same filter here. The function owner already reaches
-- creator_listed through the platform ranking owner set (20261214030000 lists read_creator_fan_ranking and creator_listed).
-- Rollback: supabase/rollback/20261214042000_creator_fan_ranking_listed.sql.
do $$
declare definition text; needle constant text := 'where public.platform_fan_heart_counted(c.id) and f.fans > 0';
begin
  definition := pg_catalog.pg_get_functiondef('public.read_creator_fan_ranking(text,integer)'::regprocedure);
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then raise exception 'CREATOR_FAN_RANKING_LISTED_SHAPE'; end if;
  execute replace(definition, needle, needle || ' and public.creator_listed(c.id)');
end $$;
select public.platform_fan_ranking_owner_access();
select public.platform_fan_ranking_owner_check();

notify pgrst, 'reload schema';
