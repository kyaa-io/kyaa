-- Rollback of 20261219030000_public_lists_listed_filter.sql: the home fan board and /api/public/home-feed show posts of unlisted pages
-- again, and read_unlisted_creator_slugs is dropped. Deploy the app without the listListed callers first (they fail closed without it).
-- The read policies the migration may have created (listed_filter_owner_<role> on group_pages and celebrities) are dropped; a select
-- grant it gave an owner stays (grants are not tracked, and the owners already read these tables in other definers).
begin;
set local lock_timeout = '5s';

do $patch$
declare
  creator_rule constant text := E'\n      and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)';
  patches constant text[][] := array[
    array['public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)',
          'and not exists(select 1 from public.group_pages hp where hp.celebrity_id=c.id and hp.status=''hidden'')' || creator_rule,
          'and not exists(select 1 from public.group_pages hp where hp.celebrity_id=c.id and hp.status=''hidden'')'],
    array['public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)',
          'join public.group_pages g on g.id=p.page_id and g.status=''published'' and g.listed',
          'join public.group_pages g on g.id=p.page_id and g.status=''published'''],
    array['public.read_public_home_feed(uuid,public.content_locale)',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''' || creator_rule,
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage'''],
    array['public.read_public_home_feed_page(uuid,public.content_locale,integer)',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''' || creator_rule,
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''']
  ];
  definition text;
  current_sig text := null;
  i integer;
begin
  for i in 1 .. array_length(patches, 1) loop
    if current_sig is distinct from patches[i][1] then
      if current_sig is not null then execute definition; end if;
      current_sig := patches[i][1];
      definition := pg_catalog.pg_get_functiondef(current_sig::regprocedure);
    end if;
    if (length(definition) - length(replace(definition, patches[i][2], ''))) / length(patches[i][2]) <> 1 then
      raise exception 'LISTED_FILTER_ROLLBACK_SHAPE %', i;
    end if;
    definition := replace(definition, patches[i][2], patches[i][3]);
  end loop;
  execute definition;
end
$patch$;

do $policy$
declare p record;
begin
  for p in select polname, polrelid::regclass rel from pg_catalog.pg_policy
            where polrelid in ('public.group_pages'::regclass, 'public.celebrities'::regclass) and polname like 'listed\_filter\_owner\_%' loop
    execute format('drop policy %I on %s', p.polname, p.rel);
  end loop;
end
$policy$;

drop function if exists public.read_unlisted_creator_slugs();

notify pgrst, 'reload schema';
commit;
