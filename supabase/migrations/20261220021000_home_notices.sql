-- Home notices (R8-DATA N1, plan 4th edition §3): kyaa's own notices for the home notice block, /notices and /notices/[slug].
-- Admin-only writes through definer RPCs with audit logs; service_role-only public reads. Everything is public once published, so
-- there is no visibility, post type, notice kind or source field. Body images are checked by the web route (private assets refused);
-- SQL checks the document shape only.
-- Order: this migration first, then the web. Rollback: stop if any home notice exists (HOME_NOTICES_ROLLBACK_HAS_ROWS), otherwise drop
-- the functions and tables; only policies named home_n1_owner_% on existing tables are removed.
begin;
set local lock_timeout = '5s';

create table public.home_notices (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null check (category in ('guide','creator','event','update')),
  publication_status public.content_status not null default 'draft',
  pinned boolean not null default false,
  published_at timestamptz,
  ever_published_at timestamptz,
  archived_at timestamptz,
  archived_by_admin_allowlist_id uuid references public.admin_allowlist(id) on delete restrict,
  archive_reason text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_notices_publication_shape check (
    (publication_status = 'draft' and published_at is null)
    or (publication_status = 'published' and published_at is not null)),
  constraint home_notices_archive_shape check (
    (archived_at is null and archived_by_admin_allowlist_id is null and archive_reason is null)
    or (archived_at is not null and archived_by_admin_allowlist_id is not null
        and archive_reason is not null and length(trim(archive_reason)) >= 10
        and publication_status = 'draft'))
);

create table public.home_notice_localizations (
  notice_id uuid not null references public.home_notices(id) on delete cascade,
  locale public.content_locale not null,
  title text not null check (length(trim(title)) between 1 and 160),
  body_json jsonb not null check (jsonb_typeof(body_json) = 'object' and body_json->>'type' = 'doc'
                                  and jsonb_typeof(body_json->'content') = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notice_id, locale)
);

create index home_notices_public_idx on public.home_notices (pinned desc, published_at desc, id desc)
  where publication_status = 'published' and archived_at is null;

create trigger home_notices_set_updated_at before update on public.home_notices
for each row execute function public.set_updated_at();
create trigger home_notice_localizations_set_updated_at before update on public.home_notice_localizations
for each row execute function public.set_updated_at();

alter table public.home_notices enable row level security;
alter table public.home_notices force row level security;
alter table public.home_notice_localizations enable row level security;
alter table public.home_notice_localizations force row level security;
revoke all on public.home_notices, public.home_notice_localizations from public, anon, authenticated, service_role;

create function public.assert_home_notice_publishable(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.home_notices;
begin
  select * into v from public.home_notices where id = p_notice_id;
  if not found or v.publication_status <> 'published' then return; end if;
  if v.archived_at is not null then raise exception 'archived home notice cannot be published'; end if;
  if (select count(*) from public.home_notice_localizations l
       where l.notice_id = p_notice_id and length(trim(l.title)) > 0
         and jsonb_array_length(l.body_json->'content') > 0
         and jsonb_path_exists(l.body_json,
           '$.** ? ((@.type == "text" && @.text like_regex "\\S") || @.type == "image" || @.type == "video" || @.type == "externalVideo")')) <> 2 then
    raise exception 'published home notice requires complete ko and en localizations';
  end if;
end $$;

create function public.validate_home_notice_publication()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.assert_home_notice_publishable(new.id);
  return new;
end $$;

create constraint trigger home_notices_validate_publication
after insert or update on public.home_notices deferrable initially deferred
for each row execute function public.validate_home_notice_publication();

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
  p_body_en jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_notice_id, extensions.gen_random_uuid()); v public.home_notices; v_before jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true);
  if p_notice_id is not null then
    select * into v from public.home_notices n where n.id = p_notice_id for update;
    if not found then raise exception 'home notice not found'; end if;
    v_before := to_jsonb(v);
    if v.archived_at is not null or v.publication_status <> 'draft' then raise exception 'home notice is immutable'; end if;
    if p_expected_revision is null or v.revision <> p_expected_revision then raise exception 'home notice revision conflict'; end if;
    update public.home_notices set slug = p_slug, category = p_category, pinned = coalesce(p_pinned, false), revision = revision + 1
      where id = v_id;
  else
    insert into public.home_notices(id, slug, category, pinned) values (v_id, p_slug, p_category, coalesce(p_pinned, false));
  end if;
  insert into public.home_notice_localizations(notice_id, locale, title, body_json) values
    (v_id, 'ko', trim(p_title_ko), p_body_ko),
    (v_id, 'en', trim(p_title_en), p_body_en)
  on conflict (notice_id, locale) do update set title = excluded.title, body_json = excluded.body_json;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id,
    case when p_notice_id is null then 'home_notice.created' else 'home_notice.updated' end,
    'home_notice', v_id::text, p_correlation_id,
    jsonb_build_object('beforeStatus', v_before->>'publication_status', 'slug', p_slug, 'category', p_category, 'pinned', coalesce(p_pinned, false)));
  return v_id;
end $$;

create function public.set_admin_home_notice_state(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_action text,
  p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.home_notices;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true);
  select * into v from public.home_notices n where n.id = p_notice_id for update;
  if not found then raise exception 'home notice not found'; end if;
  if p_expected_revision is null or v.revision <> p_expected_revision then raise exception 'home notice revision conflict'; end if;
  if v.archived_at is not null then raise exception 'home notice archived'; end if;
  if p_action = 'publish' then
    if v.publication_status = 'published' then raise exception 'home notice already published'; end if;
    update public.home_notices set publication_status = 'published', published_at = now(),
      ever_published_at = coalesce(ever_published_at, now()), revision = revision + 1 where id = p_notice_id;
  elsif p_action = 'unpublish' then
    update public.home_notices set publication_status = 'draft', published_at = null, revision = revision + 1 where id = p_notice_id;
  elsif p_action = 'archive' then
    if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'archive reason required'; end if;
    update public.home_notices set publication_status = 'draft', published_at = null, archived_at = now(),
      archived_by_admin_allowlist_id = p_actor_admin_allowlist_id, archive_reason = trim(p_reason), revision = revision + 1
      where id = p_notice_id;
  else raise exception 'invalid home notice action'; end if;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'home_notice.' || p_action, 'home_notice', p_notice_id::text, p_correlation_id,
    jsonb_build_object('from', v.publication_status, 'reason', p_reason));
end $$;

-- Row keys match the creator notice admin list (NoticeManager normalizes both) plus category.
create function public.list_admin_home_notices(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'slug', n.slug, 'category', n.category, 'publication_status', n.publication_status, 'pinned', n.pinned,
      'published_at', n.published_at, 'archived_at', n.archived_at, 'archive_reason', n.archive_reason,
      'revision', n.revision, 'created_at', n.created_at,
      'home_notice_localizations', coalesce((select jsonb_agg(jsonb_build_object('locale', l.locale, 'title', l.title, 'body_json', l.body_json) order by l.locale)
        from public.home_notice_localizations l where l.notice_id = n.id), '[]'::jsonb))
    order by n.created_at desc, n.id desc) from public.home_notices n), '[]'::jsonb);
end $$;

-- Pinned first, then newest. Keyset cursor (pinned, published_at, id), all three or none.
create function public.read_public_home_notices(
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
      'publishedAt', n.published_at, 'title', l.title) item
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

create function public.read_public_home_notice(p_locale public.content_locale, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
    'publishedAt', n.published_at, 'title', l.title, 'body', l.body_json)
  from public.home_notices n
  join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
  where n.slug = p_slug and n.publication_status = 'published' and n.archived_at is null;
$$;

revoke all on function
  public.assert_home_notice_publishable(uuid),
  public.validate_home_notice_publication(),
  public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb),
  public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text),
  public.list_admin_home_notices(uuid,uuid),
  public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer),
  public.read_public_home_notice(public.content_locale,text)
from public, anon, authenticated, service_role;
grant execute on function
  public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb),
  public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text),
  public.list_admin_home_notices(uuid,uuid),
  public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer),
  public.read_public_home_notice(public.content_locale,text)
to service_role;
-- The deferred publication trigger fires at commit as the caller (service_role), like assert_notice_publishable.
grant execute on function public.assert_home_notice_publishable(uuid) to service_role;

-- Function owner access (plan §6.2). The new tables force row security, so every ordinary owner of these definer functions, table
-- owner included, needs grants and its own home_n1_owner_* policies. Policies of other bundles or migrations never count.
-- The block is re-run verbatim by scripts/verify-home-notices.sh against a nologin nobypassrls owner.
do $access$
declare
  r record; t text; c pg_catalog.pg_class; gaps text[] := '{}';
  fns regprocedure[] := array[
    'public.assert_home_notice_publishable(uuid)',
    'public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb)',
    'public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text)',
    'public.list_admin_home_notices(uuid,uuid)',
    'public.read_public_home_notices(public.content_locale,boolean,timestamptz,uuid,integer)',
    'public.read_public_home_notice(public.content_locale,text)']::regprocedure[];
  new_tables text[] := array['home_notices', 'home_notice_localizations'];
  writers regprocedure[] := array[
    'public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb)',
    'public.set_admin_home_notice_state(uuid,uuid,uuid,uuid,integer,text,text)']::regprocedure[];
  helpers regprocedure[] := array['public.assert_active_admin(uuid,uuid,boolean)', 'public.assert_home_notice_publishable(uuid)']::regprocedure[];
  h regprocedure;
  cmd record;
begin
  for r in
    select distinct o.oid role_oid, o.rolname::text rolname, o.rolsuper, o.rolbypassrls,
           bool_or(f.oid = any (writers)) as writes
      from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
     where f.oid = any (fns)
     group by o.oid, o.rolname, o.rolsuper, o.rolbypassrls
  loop
    continue when r.rolsuper;
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then
      gaps := gaps || format('%s may not own home notice functions', r.rolname); continue;
    end if;
    foreach t in array new_tables loop
      execute format('grant select, insert, update on table public.%I to %I', t, r.rolname);
      if not r.rolbypassrls then
        for cmd in select * from (values ('r', 'select'), ('a', 'insert'), ('w', 'update')) v(code, verb) loop
          if not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = ('public.' || t)::regclass
                           and p.polname = format('home_n1_owner_%s_%s', r.rolname, cmd.code)) then
            execute format('create policy %I on public.%I for %s to %I %s', format('home_n1_owner_%s_%s', r.rolname, cmd.code), t, cmd.verb, r.rolname,
              case cmd.code when 'r' then 'using (true)' when 'a' then 'with check (true)' else 'using (true) with check (true)' end);
          end if;
        end loop;
      end if;
    end loop;
    if r.writes then
      select * into c from pg_catalog.pg_class where oid = 'public.audit_logs'::regclass;
      if c.relowner <> r.role_oid then execute format('grant insert on table public.audit_logs to %I', r.rolname); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polname = format('home_n1_owner_%s_a', r.rolname)) then
        execute format('create policy %I on public.audit_logs for insert to %I with check (true)', format('home_n1_owner_%s_a', r.rolname), r.rolname);
      end if;
    end if;
    foreach h in array helpers loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then execute format('grant execute on function %s to %I', h, r.rolname); end if;
    end loop;
  end loop;

  -- checks: fail the migration instead of hiding a gap
  for r in
    select distinct o.oid role_oid, o.rolname::text rolname, o.rolbypassrls, bool_or(f.oid = any (writers)) as writes
      from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
     where f.oid = any (fns) and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
     group by o.oid, o.rolname, o.rolbypassrls
  loop
    foreach t in array new_tables loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not (pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') and pg_catalog.has_table_privilege(r.role_oid, c.oid, 'insert')
              and pg_catalog.has_table_privilege(r.role_oid, c.oid, 'update')) then
        gaps := gaps || format('%s lacks select/insert/update on %s', r.rolname, t);
      end if;
      if not r.rolbypassrls then
        for cmd in select * from (values ('r'), ('a'), ('w')) v(code) loop
          if not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and r.role_oid = any (p.polroles)
                           and p.polcmd in (cmd.code::"char", '*') and p.polname = format('home_n1_owner_%s_%s', r.rolname, cmd.code)) then
            gaps := gaps || format('%s has no %s policy on %s', r.rolname, cmd.code, t);
          end if;
        end loop;
      end if;
    end loop;
    if r.writes then
      select * into c from pg_catalog.pg_class where oid = 'public.audit_logs'::regclass;
      if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'insert') then gaps := gaps || format('%s lacks insert on audit_logs', r.rolname); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and p.polpermissive and r.role_oid = any (p.polroles)
                           and p.polcmd in ('a', '*') and p.polname = format('home_n1_owner_%s_a', r.rolname)) then
        gaps := gaps || format('%s has no insert policy on audit_logs', r.rolname);
      end if;
    end if;
    foreach h in array helpers loop
      if not pg_catalog.has_function_privilege(r.role_oid, h, 'EXECUTE') then gaps := gaps || format('%s cannot execute %s', r.rolname, h); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'HOME_CONTENT_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
