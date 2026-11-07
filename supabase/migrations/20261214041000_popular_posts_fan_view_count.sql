-- 261107-2 F2: the popular board showed no view count for fan posts. read_public_popular_posts_page answered viewCount null for every
-- fan post although fan_post_views records them; group posts already counted group_post_views. Fan posts now count fan_post_views.
-- Rollback: supabase/rollback/20261214041000_popular_posts_fan_view_count.sql.
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

-- The function now reads fan_post_views (row security forced, no policy). Same access step as 20261213030000, for this function's owner:
-- a superuser reads it already; any other owner gets column select unless it owns the table, and an owner without bypassrls gets a select
-- policy for itself even when it owns the table, since forced row security would otherwise count 0 silently.
create or replace function public.popular_posts_view_owner_access() returns void language plpgsql set search_path = '' as $f$
declare reader record;
begin
  select o.oid, o.rolname, o.rolsuper, o.rolbypassrls into reader
    from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner
   where p.oid = 'public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure;
  if reader.rolsuper then return; end if;
  if not pg_catalog.pg_has_role(reader.oid, (select relowner from pg_catalog.pg_class where oid = 'public.fan_post_views'::regclass), 'USAGE') then
    execute format('grant select (post_id) on public.fan_post_views to %I', reader.rolname);
  end if;
  if not reader.rolbypassrls then
    execute format('drop policy if exists %I on public.fan_post_views', 'popular_posts_view_read_owner_' || reader.rolname);
    execute format('create policy %I on public.fan_post_views for select to %I using (true)', 'popular_posts_view_read_owner_' || reader.rolname, reader.rolname);
  end if;
  if not pg_catalog.has_column_privilege(reader.rolname, 'public.fan_post_views', 'post_id', 'select') then
    raise exception 'POPULAR_POSTS_VIEW_READ_PRIVILEGE_MISSING: %', reader.rolname;
  end if;
end $f$;
revoke all on function public.popular_posts_view_owner_access() from public, anon, authenticated, service_role;
select public.popular_posts_view_owner_access();

notify pgrst, 'reload schema';
