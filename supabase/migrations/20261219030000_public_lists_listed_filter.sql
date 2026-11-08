-- Posts of unlisted pages leaked into the cross-page public lists: the home fan board (read_public_popular_posts_page) showed a
-- '[시험] …' post of an unlisted test page. 20261214030000 took unlisted pages (group_pages.listed=false) out of the directory and the
-- creator ranking only; the readers that gather posts across pages kept no such filter. Same rule here:
--   * a creator's fan posts and cheers drop out when the creator's fan page is unlisted (the public.creator_listed rule),
--   * a group's posts drop out when the group page is unlisted.
-- Lists inside one page (slug or page id) stay as they are: an unlisted page is still reachable by its link.
-- read_public_mobile_profile_activities (one creator slug, no API grant), read_owned_mobile_profile_activities (the member's own record)
-- and read_social_fan_profile_before_social_states (no caller) are left unchanged.
-- The creator rule is written inline rather than as a call to creator_listed: the readers have other owners (dev: postgres, byus_admin)
-- that are not granted that function, and the inline subquery uses group_pages_celebrity_id_key.
-- /community, /api/public/celebrities and the sitemap read published_celebrities, which has no listed rule; that view also serves the
-- fan page by slug, so it stays as it is. The app leaves out list_unlisted_creator_slugs() (20261215010000) on those list paths.
-- Rollback: supabase/rollback/20261219030000_public_lists_listed_filter.sql.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  creator_rule constant text := E'\n      and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)';
  patches constant text[][] := array[
    -- Home fan board, fan part: after the hidden-page check.
    array['public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)',
          'and not exists(select 1 from public.group_pages hp where hp.celebrity_id=c.id and hp.status=''hidden'')',
          'and not exists(select 1 from public.group_pages hp where hp.celebrity_id=c.id and hp.status=''hidden'')' || creator_rule],
    -- Home fan board, group part.
    array['public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)',
          'join public.group_pages g on g.id=p.page_id and g.status=''published''',
          'join public.group_pages g on g.id=p.page_id and g.status=''published'' and g.listed'],
    -- /api/public/home-feed: the creator filter covers both fan posts and cheers.
    array['public.read_public_home_feed(uuid,public.content_locale)',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''' || creator_rule],
    array['public.read_public_home_feed_page(uuid,public.content_locale,integer)',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''',
          'where c.status=''published'' and c.archived_at is null and c.slug<>''kyaa-wave-fanpage''' || creator_rule]
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
    continue when pg_catalog.strpos(definition, patches[i][3]) > 0; -- already applied
    if (length(definition) - length(replace(definition, patches[i][2], ''))) / length(patches[i][2]) <> 1 then
      raise exception 'LISTED_FILTER_SHAPE %', i;
    end if;
    definition := replace(definition, patches[i][2], patches[i][3]);
  end loop;
  execute definition;
end
$patch$;

-- read_public_home_feed(_page) did not read group_pages before. Under forced row security an owner without a read policy sees no rows,
-- and the filter would pass every creator. Give each ordinary owner what it needs, as 20261211400000 does, then fail if a gap remains.
do $access$
declare r record; c pg_catalog.pg_class; t text; gaps text[] := '{}';
begin
  for r in
    select distinct o.oid role_oid, o.rolname, o.rolsuper, o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
     where f.oid in ('public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure,
                     'public.read_public_home_feed(uuid,public.content_locale)'::regprocedure,
                     'public.read_public_home_feed_page(uuid,public.content_locale,integer)'::regprocedure)
  loop
    continue when r.rolsuper;
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then gaps := gaps || format('%s may not own these functions', r.rolname); continue; end if;
    foreach t in array array['group_pages', 'celebrities'] loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> r.role_oid and not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then
        begin execute format('grant select on table public.%I to %I', t, r.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
        begin execute format('create policy %I on public.%I for select to %I using (true)', 'listed_filter_owner_' || r.rolname, t, r.rolname);
        exception when insufficient_privilege then null; end;
      end if;
      if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', r.rolname, t); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
        gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
      end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'LISTED_FILTER_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
