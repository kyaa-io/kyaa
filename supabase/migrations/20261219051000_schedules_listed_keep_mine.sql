-- On top of 20261219050000 (already on dev): the cross-creator schedule list keeps the viewer's own schedules of an unlisted creator,
-- as the cross-creator LIVE calendar keeps the viewer's reserved LIVE. "Own" is a schedule the viewer subscribed to
-- (schedule_subscriptions) or suggested and got approved (schedule_suggestions.schedule_id). Without a viewer nothing changes.
-- Rollback: supabase/rollback/20261219051000_schedules_listed_keep_mine.sql (back to the 20261219050000 rule).
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  needle constant text := '((p_celebrity_slug is null and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)) or c.slug=p_celebrity_slug)';
  patched constant text := '((p_celebrity_slug is null and (not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)'
    || ' or (p_app_user_id is not null and (exists(select 1 from public.schedule_subscriptions mine where mine.schedule_id=s.id and mine.app_user_id=p_app_user_id)'
    || ' or exists(select 1 from public.schedule_suggestions mine where mine.schedule_id=s.id and mine.app_user_id=p_app_user_id))))) or c.slug=p_celebrity_slug)';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if pg_catalog.strpos(definition, patched) > 0 then return; end if; -- already applied
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then raise exception 'SCHEDULES_KEEP_MINE_SHAPE'; end if;
  execute replace(definition, needle, patched);
end
$patch$;

-- The owner now also reads schedule_subscriptions and schedule_suggestions (both FORCE row security). Same access check as 20261219050000.
do $access$
declare r record; c pg_catalog.pg_class; t text; gaps text[] := '{}';
begin
  select o.oid role_oid, o.rolname, o.rolsuper, o.rolbypassrls into r from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
   where f.oid = 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  if r.rolsuper then return; end if;
  if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then raise exception 'SCHEDULES_KEEP_MINE_OWNER_GAP: % may not own it', r.rolname; end if;
  foreach t in array array['schedule_subscriptions', 'schedule_suggestions'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if c.relowner <> r.role_oid and not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then
      begin execute format('grant select on table public.%I to %I', t, r.rolname); exception when insufficient_privilege then null; end;
    end if;
    if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin execute format('create policy %I on public.%I for select to %I using (true)', 'schedules_keep_mine_owner_' || r.rolname, t, r.rolname);
      exception when insufficient_privilege then null; end;
    end if;
    if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', r.rolname, t); end if;
    if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
      gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
    end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'SCHEDULES_KEEP_MINE_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
