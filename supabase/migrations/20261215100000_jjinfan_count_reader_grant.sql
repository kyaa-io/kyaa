-- 찐팬 100 gauge, CI fix (release r4 dev 2): read_jjinfan_challenge must keep answering whoever owns it.
--
-- 20261215020000 made read_jjinfan_challenge count through creator_jjinfan_count(), a definer function the applying role owns with EXECUTE
-- given only to the owners seen at that time (dev: byus_admin, postgres). Any later owner of read_jjinfan_challenge - the 20261212081000
-- pattern reassigns it, supabase/tests/jjinfan_campaign_function_owner.sql does exactly that - answers "permission denied for function
-- creator_jjinfan_count". Granting each new owner by hand would break again on the next change, and the counter must not be opened to
-- PUBLIC (anon, authenticated).
--
-- So the gauge gets its own reader, owned by the applying role like the counter and the campaign helper it calls: read_jjinfan_gauge()
-- answers what read_jjinfan_challenge answered since 20261215020000 (찐팬 = fans holding a heart, campaign with endsOn, ended campaigns off).
-- It calls only functions of its own owner, so it needs no grant. The web reads the gauge through it.
-- read_jjinfan_challenge goes back to its 20261212080000 body, which calls no other function: the old count of active jjinfan titles and the
-- switched-on campaign without the end date. Only an old web and old tests call it; its owner and grants stay as they are.
-- Order: this file, notify, then the web that calls read_jjinfan_gauge. Between the two the old web's gauge shows the title count.
--
-- Rollback: supabase/rollback/20261215100000_jjinfan_count_reader_grant.sql
begin;
set local lock_timeout = '5s';

create function public.read_jjinfan_gauge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  n := public.creator_jjinfan_count(p_celebrity);
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description, 'endsOn', c.ends_on) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and public.jjinfan_campaign_open(c.enabled, c.ends_on);
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;
revoke all on function public.read_jjinfan_gauge(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_jjinfan_gauge(uuid) to service_role;

-- The 20261212080000 body: no call to another function, so any owner that can read the three tables (20261212081000 grants the campaign columns) answers.
create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select count(*) into n from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = p_celebrity and t.revoked_at is null;
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and c.enabled;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;

-- The new reader belongs to the applying role. It must be able to call the counter and the campaign helper (normally its own) and read what
-- they read; a table that binds it by row security gets its own read policy, as in 20261215010000 (r4b_read_<role>, campaigns: switched-on rows).
do $check$
declare t text; f text; c pg_catalog.pg_class; me pg_catalog.pg_roles; gaps text[] := '{}';
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if me.rolsuper then return; end if;
  foreach t in array array['jjinfan_challenge_campaigns', 'celebrities'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') and not (t = 'jjinfan_challenge_campaigns' and pg_catalog.has_column_privilege(me.oid, c.oid, 'ends_on', 'select')) then
      gaps := gaps || format('select on %s', t);
      continue;
    end if;
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, c.relowner, 'USAGE'))
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin
        execute format('create policy %I on public.%I for select to %I using (%s)', 'r4b_read_' || me.rolname, t, me.rolname, case when t = 'jjinfan_challenge_campaigns' then 'enabled' else 'true' end);
      exception when insufficient_privilege then gaps := gaps || format('read policy on %s', t);
      end;
    end if;
  end loop;
  foreach f in array array['public.creator_jjinfan_count(uuid)', 'public.jjinfan_campaign_open(boolean,date,timestamptz)'] loop
    if not pg_catalog.has_function_privilege(me.oid, f, 'execute') then gaps := gaps || format('execute %s', f); end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'JJINFAN_GAUGE_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;
commit;

-- PostgREST learns the new reader without a restart.
notify pgrst, 'reload schema';
