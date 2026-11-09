-- Home notices: an optional linked fan page (HOME-NEW-CREATOR-NOTICE, 2026-11-06/11-09 request). A notice row on the home and /notices
-- opens that fan page when it is linked; without a link it opens the notice detail as before.
-- Only a fan page that is published and listed, of a published creator that is not archived and has no hidden page, can be chosen, and the
-- public read gives the link only while that still holds (otherwise the row falls back to the notice detail). on delete set null.
-- Adds a 13-argument save_admin_home_notice (the 12-argument one stays, so the web deployed before this keeps resolving by name and keeps
-- any link as it is), replaces list_admin_home_notices and the two public reads, adds list_admin_home_notice_link_targets. Order: this migration, then the web.
-- Rollback: supabase/rollback/20261220021500_home_notice_linked_page.sql (stops while any notice is linked).
begin;
set local lock_timeout = '5s';

alter table public.home_notices add column linked_group_page_id uuid references public.group_pages(id) on delete set null;

create function public.home_notice_link_target_ok(p_group_page_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_pages g join public.celebrities c on c.id = g.celebrity_id
    where g.id = p_group_page_id and g.kind = 'fan' and g.status = 'published' and g.listed
      and c.status = 'published' and c.archived_at is null
      and not exists (select 1 from public.group_pages hp where hp.celebrity_id = c.id and hp.status = 'hidden'));
$$;

-- {"linkHref": "/<creator handle>"} while the page is still a valid target, otherwise null.
create function public.home_notice_link_json(p_group_page_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('linkHref', '/' || c.slug) from public.group_pages g join public.celebrities c on c.id = g.celebrity_id
   where p_group_page_id is not null and g.id = p_group_page_id and public.home_notice_link_target_ok(g.id);
$$;

create function public.save_admin_home_notice(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_slug text,
  p_category text,
  p_pinned boolean,
  p_title_ko text,
  p_body_ko jsonb,
  p_title_en text,
  p_body_en jsonb,
  p_linked_group_page_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_notice_id, extensions.gen_random_uuid()); v public.home_notices; v_before jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true);
  if p_linked_group_page_id is not null and not public.home_notice_link_target_ok(p_linked_group_page_id) then
    raise exception 'HOME_NOTICE_LINK_INVALID' using errcode = '22023';
  end if;
  if p_notice_id is not null then
    select * into v from public.home_notices n where n.id = p_notice_id for update;
    if not found then raise exception 'home notice not found'; end if;
    v_before := to_jsonb(v);
    if v.archived_at is not null or v.publication_status <> 'draft' then raise exception 'home notice is immutable'; end if;
    if p_expected_revision is null or v.revision <> p_expected_revision then raise exception 'home notice revision conflict'; end if;
    update public.home_notices set slug = p_slug, category = p_category, pinned = coalesce(p_pinned, false), linked_group_page_id = p_linked_group_page_id, revision = revision + 1
      where id = v_id;
  else
    insert into public.home_notices(id, slug, category, pinned, linked_group_page_id) values (v_id, p_slug, p_category, coalesce(p_pinned, false), p_linked_group_page_id);
  end if;
  insert into public.home_notice_localizations(notice_id, locale, title, body_json) values
    (v_id, 'ko', trim(p_title_ko), p_body_ko),
    (v_id, 'en', trim(p_title_en), p_body_en)
  on conflict (notice_id, locale) do update set title = excluded.title, body_json = excluded.body_json;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id,
    case when p_notice_id is null then 'home_notice.created' else 'home_notice.updated' end,
    'home_notice', v_id::text, p_correlation_id,
    jsonb_build_object('beforeStatus', v_before->>'publication_status', 'slug', p_slug, 'category', p_category, 'pinned', coalesce(p_pinned, false), 'linkedGroupPageId', p_linked_group_page_id));
  return v_id;
end $$;


create or replace function public.list_admin_home_notices(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'slug', n.slug, 'category', n.category, 'publication_status', n.publication_status, 'pinned', n.pinned,
      'published_at', n.published_at, 'archived_at', n.archived_at, 'archive_reason', n.archive_reason,
      'revision', n.revision, 'created_at', n.created_at, 'linked_group_page_id', n.linked_group_page_id,
      'home_notice_localizations', coalesce((select jsonb_agg(jsonb_build_object('locale', l.locale, 'title', l.title, 'body_json', l.body_json) order by l.locale)
        from public.home_notice_localizations l where l.notice_id = n.id), '[]'::jsonb))
    order by n.created_at desc, n.id desc) from public.home_notices n), '[]'::jsonb);
end $$;


create function public.list_admin_home_notice_link_targets(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', c.slug) order by g.name, g.id)
    from public.group_pages g join public.celebrities c on c.id = g.celebrity_id where public.home_notice_link_target_ok(g.id)), '[]'::jsonb);
end $$;

create or replace function public.read_public_home_notices(
  p_locale public.content_locale,
  p_before_pinned boolean default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid home notice page' using errcode = '22023'; end if;
  if (p_before_pinned is null) <> (p_before is null) or (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid home notice cursor' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x.item order by x.pinned desc, x.published_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select n.pinned, n.published_at, n.id, jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
      'publishedAt', n.published_at, 'title', l.title) || coalesce(public.home_notice_link_json(n.linked_group_page_id), '{}'::jsonb) item
    from public.home_notices n
    join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
    where n.publication_status = 'published' and n.archived_at is null
      and (p_before is null or (n.pinned, n.published_at, n.id) < (p_before_pinned, p_before, p_before_id))
    order by n.pinned desc, n.published_at desc, n.id desc
    limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit);
end $$;


create or replace function public.read_public_home_notice(p_locale public.content_locale, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
    'publishedAt', n.published_at, 'title', l.title, 'body', l.body_json) || coalesce(public.home_notice_link_json(n.linked_group_page_id), '{}'::jsonb)
  from public.home_notices n
  join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
  where n.slug = p_slug and n.publication_status = 'published' and n.archived_at is null;
$$;


revoke all on function public.home_notice_link_target_ok(uuid), public.home_notice_link_json(uuid),
  public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid),
  public.list_admin_home_notice_link_targets(uuid,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid),
  public.list_admin_home_notice_link_targets(uuid,uuid) to service_role;

-- Function owner access (plan §6.2). The new and replaced functions read group_pages and celebrities; their ordinary owners get select and
-- a home_n1link_owner_<role>_r policy where row security applies. The notice tables keep the N1 policies (home_n1_owner_*), which this
-- block only checks. Re-run verbatim by supabase/tests/home_notice_links.sh against a nologin nobypassrls owner.
do $access$
declare
  r record; t text; c pg_catalog.pg_class; gaps text[] := '{}'; h regprocedure; cmd record;
  fns regprocedure[] := array['public.home_notice_link_target_ok(uuid)', 'public.home_notice_link_json(uuid)',
    'public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid)',
    'public.list_admin_home_notices(uuid,uuid)', 'public.list_admin_home_notice_link_targets(uuid,uuid)',
    'public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer)',
    'public.read_public_home_notice(public.content_locale,text)']::regprocedure[];
  read_tables text[] := array['group_pages', 'celebrities'];
  notice_tables text[] := array['home_notices', 'home_notice_localizations'];
  helpers regprocedure[] := array['public.assert_active_admin(uuid,uuid,boolean)', 'public.assert_home_notice_publishable(uuid)',
    'public.home_notice_link_target_ok(uuid)', 'public.home_notice_link_json(uuid)']::regprocedure[];
begin
  for r in select distinct o.oid role_oid, o.rolname::text rolname, o.rolsuper, o.rolbypassrls
             from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner where f.oid = any (fns)
  loop
    continue when r.rolsuper;
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then
      gaps := gaps || format('%s may not own home notice functions', r.rolname); continue;
    end if;
    foreach t in array read_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> r.role_oid and not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then
        execute format('grant select on table public.%I to %I', t, r.rolname);
      end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polname = format('home_n1link_owner_%s_r', r.rolname)) then
        execute format('create policy %I on public.%I for select to %I using (true)', format('home_n1link_owner_%s_r', r.rolname), t, r.rolname);
      end if;
    end loop;
    foreach h in array helpers loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then execute format('grant execute on function %s to %I', h, r.rolname); end if;
    end loop;
  end loop;

  -- checks: fail the migration instead of hiding a gap
  for r in select distinct o.oid role_oid, o.rolname::text rolname, o.rolbypassrls
             from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
            where f.oid = any (fns) and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
  loop
    foreach t in array read_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', r.rolname, t); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and r.role_oid = any (p.polroles)
                           and p.polcmd in ('r', '*') and p.polname = format('home_n1link_owner_%s_r', r.rolname)) then
        gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
      end if;
    end loop;
    foreach t in array notice_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not r.rolbypassrls then
        for cmd in select * from (values ('r'), ('a'), ('w')) v(code) loop
          if not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles)
                           and p.polname = format('home_n1_owner_%s_%s', r.rolname, cmd.code)) then
            gaps := gaps || format('%s has no N1 %s policy on %s (run the 20261220021000 access block)', r.rolname, cmd.code, t);
          end if;
        end loop;
      end if;
    end loop;
    foreach h in array helpers loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then gaps := gaps || format('%s cannot execute %s', r.rolname, h); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'HOME_CONTENT_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
