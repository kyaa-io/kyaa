-- The cross-creator schedule list (/api/schedules without celebritySlug, read by /live/calendar) showed '[P1 시험] 일정' of an unlisted
-- test creator: fan_web_list_schedules had no listed rule. Same rule as 20261219030000: without a creator slug, schedules of a creator
-- whose fan page is unlisted (group_pages.listed=false, the public.creator_listed rule) drop out. A creator's own calendar passes its
-- slug and keeps them, and fan_web_get_schedule (the schedule's own page) is unchanged, so an unlisted page stays usable by link.
-- The creator rule is inline (the owner is not granted creator_listed) and uses group_pages_celebrity_id_key.
-- Rollback: supabase/rollback/20261219050000_schedules_listed_filter.sql.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  needle constant text := '(p_celebrity_slug is null or c.slug=p_celebrity_slug)';
  patched constant text := '((p_celebrity_slug is null and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)) or c.slug=p_celebrity_slug)';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if pg_catalog.strpos(definition, patched) > 0 then return; end if; -- already applied
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then raise exception 'SCHEDULES_LISTED_FILTER_SHAPE'; end if;
  execute replace(definition, needle, patched);
end
$patch$;

-- The owner did not read group_pages before. Under forced row security an owner without a read policy sees no rows and the filter would
-- pass every creator: give an ordinary owner what it needs, as 20261219030000 does, then fail if a gap remains.
do $access$
declare r record; c pg_catalog.pg_class; gaps text[] := '{}';
begin
  select * into c from pg_catalog.pg_class where oid = 'public.group_pages'::regclass;
  select o.oid role_oid, o.rolname, o.rolsuper, o.rolbypassrls into r from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
   where f.oid = 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  if r.rolsuper then return; end if;
  if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then raise exception 'SCHEDULES_LISTED_FILTER_OWNER_GAP: % may not own it', r.rolname; end if;
  if c.relowner <> r.role_oid and not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then
    begin execute format('grant select on table public.group_pages to %I', r.rolname); exception when insufficient_privilege then null; end;
  end if;
  if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
     and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
    begin execute format('create policy %I on public.group_pages for select to %I using (true)', 'schedules_listed_owner_' || r.rolname, r.rolname);
    exception when insufficient_privilege then null; end;
  end if;
  if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on group_pages', r.rolname); end if;
  if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
     and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
    gaps := gaps || format('%s has no read policy on group_pages', r.rolname);
  end if;
  if cardinality(gaps) > 0 then raise exception 'SCHEDULES_LISTED_FILTER_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
