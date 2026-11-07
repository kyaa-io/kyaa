-- 261107-2 F2: the popular board showed no view count for fan posts. read_public_popular_posts_page answered viewCount null for every
-- fan post although fan_post_views records them; group posts already counted group_post_views. Fan posts now count fan_post_views.
-- Patch the live definition (same method as 20261129003000): each needle must be found exactly once or the migration stops.
do $$
declare
  definition text;
  patches constant text[][] := array[
    array['''assets'',coalesce((public.fan_web_post_json(null,p.id,p_locale)->''assets'')->0,''null''::jsonb))',
          '''viewCount'',(select count(*) from public.fan_post_views v where v.post_id=p.id),
          ''assets'',coalesce((public.fan_web_post_json(null,p.id,p_locale)->''assets'')->0,''null''::jsonb))'],
    array['''viewCount'',case when source=''group'' then detail->''viewCount'' else ''null''::jsonb end,',
          '''viewCount'',detail->''viewCount'','] 
  ];
  i integer;
begin
  select pg_catalog.pg_get_functiondef('public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure) into definition;
  for i in 1 .. array_length(patches, 1) loop
    if (length(definition) - length(replace(definition, patches[i][1], ''))) / length(patches[i][1]) <> 1 then
      raise exception 'POPULAR_POSTS_VIEW_PATCH_CONTRACT_CHANGED %', i;
    end if;
    definition := replace(definition, patches[i][1], patches[i][2]);
  end loop;
  execute definition;
end $$;

notify pgrst, 'reload schema';
