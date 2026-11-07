-- 261107-2 feedback C7: the home "진행 중 챌린지" module, the challenge tag on group cards and the home ranking read which 찐팬 100 challenges are on.
-- One public reader. Only campaigns an administrator turned on (jjinfan_challenge_campaigns.enabled) on pages the platform rankings may name:
-- published, not archived, not anonymous, not hidden, not the wave page (platform_fan_heart_counted) and not unlisted (creator_listed).
-- The count is the same live count read_jjinfan_challenge answers (active jjinfan_titles), the target stays 100. Newest switched on first.
-- Draft wording of a campaign that is off never leaves the server, as in read_jjinfan_challenge.
-- Web and database may ship in either order: the old web never calls it; the new web hides the module and tags when the call fails.
--
-- Rollback: supabase/rollback/20261215020000_active_jjinfan_challenges.sql
begin;
set local lock_timeout = '5s';

create function public.read_active_jjinfan_challenges(p_locale text default 'ko', p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'slug', r.slug, 'name', r.name, 'imageUrl', r.image_url, 'title', r.title, 'description', r.description, 'count', r.n, 'target', 100
    ) order by r.updated_at desc, r.slug), '[]'::jsonb))
    from (select c.slug, c.image_url, j.title, j.description, j.updated_at, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 (select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active'
                   where t.celebrity_id = c.id and t.revoked_at is null) as n
            from public.jjinfan_challenge_campaigns j
            join public.celebrities c on c.id = j.celebrity_id and c.status = 'published' and c.archived_at is null
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where j.enabled and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
           order by j.updated_at desc, c.slug
           limit least(greatest(coalesce(p_limit, 10), 1), 10)) r
$$;
revoke all on function public.read_active_jjinfan_challenges(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_active_jjinfan_challenges(text, integer) to service_role;

-- The function belongs to the applying role. Fail here rather than at the first home read when that role cannot see what it reads.
do $check$
declare t text; me pg_catalog.pg_roles; c pg_catalog.pg_class; gaps text[] := '{}';
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if me.rolsuper then return; end if;
  foreach t in array array['jjinfan_challenge_campaigns', 'celebrities', 'celebrity_localizations', 'jjinfan_titles', 'app_users', 'group_pages'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') then gaps := gaps || format('select on %s', t); end if;
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> me.oid)
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and me.oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
      gaps := gaps || format('read policy on %s', t);
    end if;
  end loop;
  if not pg_catalog.has_function_privilege(me.oid, 'public.platform_fan_heart_counted(uuid)', 'execute') then gaps := gaps || 'execute platform_fan_heart_counted'::text; end if;
  if not pg_catalog.has_function_privilege(me.oid, 'public.creator_listed(uuid)', 'execute') then gaps := gaps || 'execute creator_listed'::text; end if;
  if cardinality(gaps) > 0 then raise exception 'ACTIVE_JJINFAN_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;
commit;
