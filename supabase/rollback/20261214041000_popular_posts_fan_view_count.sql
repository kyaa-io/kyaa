-- Rollback for 20261214041000_popular_posts_fan_view_count.sql: fan posts answer viewCount null again. The owner's column grant stays
-- (as in 20261213030000); the owner policy this migration added is dropped.
begin;
set local lock_timeout='5s';
do $$
declare definition text; reader name; patches constant text[][] := array[
    array['''viewCount'',(select count(*) from public.fan_post_views v where v.post_id=p.id),
          ''assets'',coalesce((public.fan_web_post_json(null,p.id,p_locale)->''assets'')->0,''null''::jsonb))',
          '''assets'',coalesce((public.fan_web_post_json(null,p.id,p_locale)->''assets'')->0,''null''::jsonb))'],
    array['''viewCount'',detail->''viewCount'',',
          '''viewCount'',case when source=''group'' then detail->''viewCount'' else ''null''::jsonb end,']
  ]; i integer;
begin
  definition := pg_catalog.pg_get_functiondef('public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure);
  for i in 1 .. array_length(patches, 1) loop
    if position(patches[i][1] in definition) = 0 then raise exception 'POPULAR_POSTS_VIEW_ROLLBACK_SHAPE %', i; end if;
    definition := replace(definition, patches[i][1], patches[i][2]);
  end loop;
  execute definition;
  select o.rolname into reader from pg_proc p join pg_roles o on o.oid = p.proowner
   where p.oid = 'public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure;
  execute format('drop policy if exists %I on public.fan_post_views', 'popular_posts_view_read_owner_' || reader);
end $$;
drop function public.popular_posts_view_owner_access();
commit;
