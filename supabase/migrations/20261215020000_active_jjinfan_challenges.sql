-- 261107-2 feedback C7: the home "진행 중 챌린지" module, the challenge tag on group cards and the home ranking read which 찐팬 100 challenges are on.
-- One public reader. Only campaigns an administrator turned on (jjinfan_challenge_campaigns.enabled) on pages the platform rankings may name:
-- published, not archived, not anonymous, not hidden, not the wave page (platform_fan_heart_counted) and not unlisted (creator_listed).
-- 찐팬 count (coordination 2026-11-08): one definition everywhere, creator_jjinfan_count() from 20261215010000 = active fans whose
-- passport_hearts on the creator is positive (the hearts the header ♥N and the fan list show). The gauge, the administrator's list, this reader and
-- the /rankings jjinfanCount switch from active jjinfan_titles to it. Titles stay what they were for room entry and claims; only the count changes.
-- The target stays 100. Newest switched on first. Depends on 20261215010000.
-- Draft wording of a campaign that is off never leaves the server, as in read_jjinfan_challenge.
-- An end date (ends_on, KST, inclusive) lets the gauge card say "11. 30.까지" and turns the campaign off after that day on its own:
-- every public reader answers an ended campaign as off. The administrator sets it; empty means no end date (as before).
-- set_jjinfan_challenge_campaign gains p_ends_on and p_set_ends_on (both defaulted), so the old web's seven-argument save still resolves
-- and leaves a stored end date as it was.
-- Web and database may ship in either order: the old web never calls the new reader and ignores endsOn; the new web hides the module and tags when the call fails.
--
-- Rollback: supabase/rollback/20261215020000_active_jjinfan_challenges.sql
begin;
set local lock_timeout = '5s';

alter table public.jjinfan_challenge_campaigns add column ends_on date;

-- Open on p_at (KST): switched on and not past its end date.
create function public.jjinfan_campaign_open(p_enabled boolean, p_ends_on date, p_at timestamptz default pg_catalog.clock_timestamp())
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_enabled, false) and (p_ends_on is null or p_ends_on >= (p_at at time zone 'Asia/Seoul')::date)
$$;
revoke all on function public.jjinfan_campaign_open(boolean, date, timestamptz) from public, anon, authenticated, service_role;

-- 20261212081000 gave the gauge reader's owner four columns when it differs from the table owner; it now reads the end date as well.
do $owner$
declare reader record;
begin
  select o.rolname, o.rolsuper, pg_catalog.pg_has_role(o.oid, c.relowner, 'USAGE') as acts_as_table_owner into reader
    from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner cross join pg_catalog.pg_class c
   where p.oid = 'public.read_jjinfan_challenge(uuid)'::regprocedure and c.oid = 'public.jjinfan_challenge_campaigns'::regclass;
  if reader.rolsuper or reader.acts_as_table_owner then return; end if;
  execute format('grant select (ends_on) on public.jjinfan_challenge_campaigns to %I', reader.rolname);
  execute format('grant execute on function public.jjinfan_campaign_open(boolean, date, timestamptz) to %I', reader.rolname);
end $owner$;

-- Same signature, same count; an ended campaign answers null like a switched-off one.
create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
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

create or replace function public.list_jjinfan_challenge_campaigns(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(row_to_json(r)::jsonb order by r.enabled desc, r.name, r."celebrityId")
    from (
      select c.id as "celebrityId", c.slug, coalesce(
          (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id order by (l.locale = 'ko') desc, l.locale limit 1), c.slug) as name,
        coalesce(j.enabled, false) as enabled, coalesce(j.title, '') as title, coalesce(j.description, '') as description, j.updated_at as "updatedAt",
        j.ends_on as "endsOn",
        public.creator_jjinfan_count(c.id) as count
      from public.celebrities c
      left join public.jjinfan_challenge_campaigns j on j.celebrity_id = c.id
      where c.status = 'published' and c.archived_at is null
    ) r), '[]'::jsonb));
end $$;

drop function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text);
create function public.set_jjinfan_challenge_campaign(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_enabled boolean, p_title text, p_description text,
  p_ends_on date default null, p_set_ends_on boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := pg_catalog.btrim(coalesce(p_description, ''));
  v_before public.jjinfan_challenge_campaigns%rowtype;
  v_row public.jjinfan_challenge_campaigns%rowtype;
begin
  if p_actor_admin_allowlist_id is null or public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true) is distinct from 'admin' then
    raise exception 'full admin required';
  end if;
  if p_correlation_id is null or p_enabled is null or p_set_ends_on is null then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if pg_catalog.char_length(v_title) > 80 or pg_catalog.char_length(v_description) > 300 or (p_enabled and v_title = '') then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity_id and c.status = 'published' and c.archived_at is null) then raise exception 'CREATOR_NOT_FOUND'; end if;
  select * into v_before from public.jjinfan_challenge_campaigns where celebrity_id = p_celebrity_id for update;
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, description, ends_on, updated_by_admin_allowlist_id)
  values (p_celebrity_id, p_enabled, v_title, v_description, case when p_set_ends_on then p_ends_on end, p_actor_admin_allowlist_id)
  on conflict (celebrity_id) do update set enabled = excluded.enabled, title = excluded.title, description = excluded.description,
    ends_on = case when p_set_ends_on then excluded.ends_on else public.jjinfan_challenge_campaigns.ends_on end,
    updated_by_admin_allowlist_id = excluded.updated_by_admin_allowlist_id, updated_at = now()
  returning * into v_row;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'jjinfan_campaign.updated', 'jjinfan_campaign', p_celebrity_id::text, p_correlation_id,
    pg_catalog.jsonb_build_object('celebrityId', p_celebrity_id, 'beforeEnabled', coalesce(v_before.enabled, false), 'afterEnabled', v_row.enabled, 'beforeTitle', v_before.title, 'afterTitle', v_row.title,
      'beforeDescription', v_before.description, 'afterDescription', v_row.description, 'beforeEndsOn', v_before.ends_on, 'afterEndsOn', v_row.ends_on));
  return pg_catalog.jsonb_build_object('celebrityId', v_row.celebrity_id, 'enabled', v_row.enabled, 'title', v_row.title, 'description', v_row.description, 'endsOn', v_row.ends_on, 'updatedAt', v_row.updated_at);
end $$;
revoke all on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text, date, boolean) from public, anon, authenticated;
grant execute on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text, date, boolean) to service_role;

create function public.read_active_jjinfan_challenges(p_locale text default 'ko', p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'slug', r.slug, 'name', r.name, 'imageUrl', r.image_url, 'title', r.title, 'description', r.description, 'endsOn', r.ends_on, 'count', r.n, 'target', 100
    ) order by r.updated_at desc, r.slug), '[]'::jsonb))
    from (select c.slug, c.image_url, j.title, j.description, j.ends_on, j.updated_at, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 public.creator_jjinfan_count(c.id) as n
            from public.jjinfan_challenge_campaigns j
            join public.celebrities c on c.id = j.celebrity_id and c.status = 'published' and c.archived_at is null
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where public.jjinfan_campaign_open(j.enabled, j.ends_on) and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
           order by j.updated_at desc, c.slug
           limit least(greatest(coalesce(p_limit, 10), 1), 10)) r
$$;
revoke all on function public.read_active_jjinfan_challenges(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_active_jjinfan_challenges(text, integer) to service_role;

-- /rankings shows the same 찐팬 count: read_creator_ranking and read_creator_fan_ranking count through creator_jjinfan_count as well.
-- Their owners may differ from the applying role (dev: postgres): they get execute on the counter, which reads as its own owner.
do $patch$
declare def text; f regprocedure; owner name;
begin
  foreach f in array array['public.read_creator_ranking(text,uuid,text,timestamptz)'::regprocedure, 'public.read_creator_fan_ranking(text,integer)'::regprocedure] loop
    def := pg_catalog.pg_get_functiondef(f);
    if position('creator_jjinfan_count' in def) = 0 then
      -- Replacing a function needs its owner or a member of it (dev: postgres owns read_creator_ranking, byus_admin is a member).
      if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles me on me.rolname = current_user
                      where p.oid = f and (me.rolsuper or pg_catalog.pg_has_role(me.oid, p.proowner, 'USAGE'))) then
        raise exception 'JJINFAN_COUNT_OWNER: % cannot replace % (owner %)', current_user, f, (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = f);
      end if;
      if position($a$(select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = $a$ in def) = 0 then
        raise exception 'JJINFAN_COUNT_UNPATCHED: %', f;
      end if;
      def := pg_catalog.regexp_replace(def, $a$\(select count\(\*\) from public\.jjinfan_titles t join public\.app_users tu on tu\.id = t\.app_user_id and tu\.status = 'active' where t\.celebrity_id = ([a-z]+)\.id and t\.revoked_at is null\)$a$, $a$public.creator_jjinfan_count(\1.id)$a$, 'g');
      if position('creator_jjinfan_count' in def) = 0 then raise exception 'JJINFAN_COUNT_UNPATCHED: % (shape changed)', f; end if;
      execute def;
    end if;
  end loop;
  for owner in select distinct o.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner
                where p.oid in ('public.read_jjinfan_challenge(uuid)'::regprocedure, 'public.read_creator_ranking(text,uuid,text,timestamptz)'::regprocedure, 'public.read_creator_fan_ranking(text,integer)'::regprocedure)
                  and not o.rolsuper and o.rolname <> current_user loop
    execute format('grant execute on function public.creator_jjinfan_count(uuid) to %I', owner);
  end loop;
end $patch$;

-- The function belongs to the applying role. Fail here rather than at the first home read when that role cannot see what it reads.
do $check$
declare t text; f text; c pg_catalog.pg_class; me pg_catalog.pg_roles; gaps text[] := '{}';
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if me.rolsuper then return; end if;
  foreach t in array array['jjinfan_challenge_campaigns', 'celebrities', 'celebrity_localizations', 'app_users', 'group_pages', 'creator_heart_ledger', 'fan_heart_conversions'] loop
    select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') and not (t = 'jjinfan_challenge_campaigns' and pg_catalog.has_column_privilege(me.oid, c.oid, 'enabled', 'select')) then
      gaps := gaps || format('select on %s', t);
      continue;
    end if;
    -- Row security binds this role unless it bypasses it, or owns the table (directly or as a member of the owner, as byus_admin of postgres on dev)
    -- and the table is not FORCE. Where it binds and no policy lets it read, give it its own read policy, as 20261213060000 does for its owners.
    -- The campaign table stays limited to switched-on rows, so an administrator's draft is never readable through these functions.
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, c.relowner, 'USAGE'))
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin
        execute format('create policy %I on public.%I for select to %I using (%s)', 'r4b_read_' || me.rolname, t, me.rolname, case when t = 'jjinfan_challenge_campaigns' then 'enabled' else 'true' end);
      exception when insufficient_privilege then gaps := gaps || format('read policy on %s', t);
      end;
    end if;
  end loop;
  foreach f in array array['public.platform_fan_heart_counted(uuid)', 'public.creator_listed(uuid)', 'public.creator_jjinfan_count(uuid)'] loop
    if not pg_catalog.has_function_privilege(me.oid, f, 'execute') then gaps := gaps || format('execute %s', f); end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'ACTIVE_JJINFAN_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;
commit;

-- PostgREST learns the new reader and the nine-argument save without a restart.
notify pgrst, 'reload schema';
