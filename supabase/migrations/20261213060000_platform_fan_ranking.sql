begin;
-- 261107-2 U3 (decision D3): the home ranking card has a platform fan tab (/api/rankings/fans) and a creator tab by fan count (/api/rankings/creators?metric=fans).
-- A new snapshot kind fan_hearts: scope = nil uuid, subject = fan, score = that fan's passport_page_claim hearts across every creator.
-- Hearts given on a page that is anonymous, not published, or the wave page are not counted, so the total never tells which hidden page a fan is in.
-- The reader names fans by nickname, character and grade only. No amount, no id but the viewer's own row flag. Sanctioned and disabled members,
-- and people in a block with the viewer, leave the list at read time, the same as read_page_ranking. Ranks are counted again after those filters.
-- Grade: the highest effective grade the fan holds with any creator counted in the score.
-- The refresh that the scheduler already calls builds the new kind as well. Rollback: supabase/rollback/20261213060000_platform_fan_ranking.sql.
set local lock_timeout='5s';

alter table public.ranking_snapshots drop constraint ranking_snapshots_kind_check;
alter table public.ranking_snapshots add constraint ranking_snapshots_kind_check check (kind in ('creator_hearts', 'fan_contribution', 'dukjil', 'fan_hearts'));
alter table public.ranking_snapshots drop constraint ranking_snapshots_creator_scope;
alter table public.ranking_snapshots add constraint ranking_snapshots_creator_scope
  check ((kind in ('creator_hearts', 'fan_hearts')) = (scope_id = '00000000-0000-0000-0000-000000000000'::uuid));

-- Fan's hearts on the pages the platform list may count. One place, so the score and the grade read the same pages.
create function public.platform_fan_heart_counted(p_celebrity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null and c.slug <> 'kyaa-wave-fanpage')
     and not exists (select 1 from public.group_pages g where g.celebrity_id = p_celebrity and (g.anonymous or g.status <> 'published'))
$$;
revoke all on function public.platform_fan_heart_counted(uuid) from public, anon, authenticated, service_role;

do $patch$
declare def text; anchor text;
begin
  def := pg_catalog.pg_get_functiondef('public.ranking_scores(text,uuid,timestamptz,timestamptz)'::regprocedure);
  anchor := $a$   group by s.celebrity_id, s.app_user_id
$a$;
  if position(anchor in def) = 0 or position('fan_hearts' in def) > 0 then raise exception 'PLATFORM_FAN_RANKING_UNPATCHED: ranking_scores'; end if;
  execute replace(def, anchor, anchor || $a$  union all
  select '00000000-0000-0000-0000-000000000000'::uuid, l.app_user_id, count(*)::bigint, max(l.created_at)
    from public.creator_heart_ledger l
    join public.app_users u on u.id = l.app_user_id and u.status = 'active'
   where p_kind = 'fan_hearts' and l.source_type = 'passport_page_claim' and l.created_at >= p_from and l.created_at < p_to
     and public.platform_fan_heart_counted(l.celebrity_id)
   group by l.app_user_id
$a$);

  def := pg_catalog.pg_get_functiondef('public.refresh_ranking_snapshots(timestamptz)'::regprocedure);
  anchor := $a$array['creator_hearts', 'fan_contribution', 'dukjil']$a$;
  if position(anchor in def) = 0 then raise exception 'PLATFORM_FAN_RANKING_UNPATCHED: refresh_ranking_snapshots'; end if;
  execute replace(def, anchor, $a$array['creator_hearts', 'fan_contribution', 'dukjil', 'fan_hearts']$a$);
end $patch$;

create function public.read_platform_fan_ranking(p_period text, p_viewer uuid default null, p_limit integer default 10, p_at timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record; snap public.ranking_snapshots; items jsonb; lim integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  select * into w from public.ranking_period_window(p_period, p_at);
  select * into snap from public.ranking_snapshots
   where kind = 'fan_hearts' and scope_id = '00000000-0000-0000-0000-000000000000'::uuid and period = p_period and period_start = w.period_start;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', f.rn, 'score', f.score, 'nickname', f.nickname, 'characterId', f.character_id, 'isMe', p_viewer is not null and f.subject_id = p_viewer,
      'tier', (select case max(public.fan_level_rank(public.get_fan_effective_tier(f.subject_id, x.celebrity_id)))
                        when 1 then 'Bronze' when 2 then 'Silver' when 3 then 'Gold' when 4 then 'Platinum' when 5 then 'Diamond' end
                 from (select distinct l.celebrity_id from public.creator_heart_ledger l
                        where l.app_user_id = f.subject_id and l.source_type = 'passport_page_claim' and public.platform_fan_heart_counted(l.celebrity_id)) x)
    ) order by f.rn), '[]'::jsonb) into items
    from (select au.id as subject_id, (e ->> 'score')::bigint as score,
                 coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan') as nickname, coalesce(av.selected_character_id, 'star-pink') as character_id,
                 pg_catalog.row_number() over (order by (e ->> 'rank')::integer) as rn
            from pg_catalog.jsonb_array_elements(coalesce(snap.rows, '[]'::jsonb)) e
            join public.app_users au on au.id = (e ->> 'subjectId')::uuid and au.status = 'active'
            left join public.user_profiles pr on pr.app_user_id = au.id
            left join public.app_user_avatars av on av.app_user_id = au.id
           where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = au.id and mr.revoked_at is null)
             and (p_viewer is null or not exists (select 1 from public.user_blocks b
                   where (b.app_user_id = p_viewer and b.blocked_app_user_id = au.id) or (b.app_user_id = au.id and b.blocked_app_user_id = p_viewer)))) f
   where f.rn <= lim;
  return pg_catalog.jsonb_build_object('period', p_period, 'periodStart', w.period_start, 'computedAt', snap.computed_at, 'rows', items,
    'me', public.ranking_my_rank('fan_hearts', '00000000-0000-0000-0000-000000000000'::uuid, p_period, p_at, snap.rows, p_viewer));
end $$;
revoke all on function public.read_platform_fan_ranking(text, uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.read_platform_fan_ranking(text, uuid, integer, timestamptz) to service_role;

-- Creator tab of the same card: creators by fan count, the active members of the creator's fan page (the page head's "fans" number, group_page_json memberCount).
-- Read live: there is one row per creator. Only creators the platform list may name (published page, not anonymous, not the wave page) are counted.
create function public.read_creator_fan_ranking(p_locale text default 'ko', p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', r.rn, 'slug', r.slug, 'name', r.name, 'imageUrl', r.image_url, 'score', r.fans,
      'jjinfanCount', (select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = r.id and t.revoked_at is null)
    ) order by r.rn), '[]'::jsonb))
    from (select c.id, c.slug, c.image_url, coalesce(nl.name, nk.name, ne.name, c.slug) as name, f.fans,
                 pg_catalog.row_number() over (order by f.fans desc, c.slug) as rn
            from public.celebrities c
            join public.group_pages g on g.celebrity_id = c.id and g.kind = 'fan'
            cross join lateral (select count(*) as fans from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active' where m.page_id = g.id) f
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where public.platform_fan_heart_counted(c.id) and f.fans > 0) r
   where r.rn <= least(greatest(coalesce(p_limit, 10), 1), 50)
$$;
revoke all on function public.read_creator_fan_ranking(text, integer) from public, anon, authenticated;
grant execute on function public.read_creator_fan_ranking(text, integer) to service_role;

-- AWS mixes owners: these definers read FORCE RLS tables imported under another role. Give an ordinary owner what it needs, then fail on any gap.
create function public.platform_fan_ranking_owner_roles()
returns table(role_oid oid, rolname name, rolsuper boolean, rolbypassrls boolean) language sql stable set search_path = '' as $$
  select distinct o.oid, o.rolname, o.rolsuper, o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid = f.proowner
   where f.pronamespace = 'public'::regnamespace
     and f.proname in ('platform_fan_heart_counted', 'ranking_scores', 'refresh_ranking_snapshots', 'ranking_my_rank', 'read_platform_fan_ranking', 'read_creator_fan_ranking')
$$;
create function public.platform_fan_ranking_owner_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['creator_heart_ledger', 'celebrities', 'group_pages', 'app_users', 'user_profiles', 'app_user_avatars',
    'app_user_moderation_restrictions', 'user_blocks', 'ranking_snapshots', 'community_stamps', 'passport_stamp_voids', 'group_memberships', 'jjinfan_titles',
    'celebrity_localizations']::text[]
$$;
create function public.platform_fan_ranking_owner_functions() returns text[] language sql immutable set search_path = '' as $$
  select array['public.platform_fan_heart_counted(uuid)', 'public.ranking_period_window(text,timestamptz)', 'public.ranking_scores(text,uuid,timestamptz,timestamptz)',
    'public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)', 'public.get_fan_effective_tier(uuid,uuid)', 'public.fan_level_rank(text)']::text[]
$$;
create function public.platform_fan_ranking_owner_access() returns void language plpgsql set search_path = '' as $$
declare r record; t text; f text; c pg_catalog.pg_class;
begin
  for r in select * from public.platform_fan_ranking_owner_roles() where not rolsuper and rolname not in ('anon', 'authenticated', 'service_role', 'public') loop
    foreach t in array public.platform_fan_ranking_owner_tables() loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> r.role_oid then
        begin execute format('grant select on table public.%I to %I', t, r.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
        begin execute format('create policy %I on public.%I for select to %I using (true)', 'platform_fan_ranking_owner_' || r.rolname, t, r.rolname); exception when insufficient_privilege then null; end;
      end if;
    end loop;
    -- The refresh writes the snapshots: the right and, under row security, a policy for the write.
    if exists (select 1 from pg_catalog.pg_proc p where p.proowner = r.role_oid and p.oid = 'public.refresh_ranking_snapshots(timestamptz)'::regprocedure) then
      select * into c from pg_catalog.pg_class where oid = 'public.ranking_snapshots'::regclass;
      if c.relowner <> r.role_oid then
        begin execute format('grant insert, delete on table public.ranking_snapshots to %I', r.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd = '*') then
        begin execute format('create policy %I on public.ranking_snapshots for all to %I using (true) with check (true)', 'platform_fan_ranking_refresh_' || r.rolname, r.rolname); exception when insufficient_privilege then null; end;
      end if;
    end if;
    foreach f in array public.platform_fan_ranking_owner_functions() loop
      begin execute format('grant execute on function %s to %I', f, r.rolname); exception when insufficient_privilege then null; end;
    end loop;
  end loop;
end $$;
create function public.platform_fan_ranking_owner_check() returns void language plpgsql stable set search_path = '' as $$
declare r record; t text; f text; c pg_catalog.pg_class; gaps text[] := '{}';
begin
  for r in select * from public.platform_fan_ranking_owner_roles() loop
    continue when r.rolsuper;
    if r.rolname in ('anon', 'authenticated', 'service_role', 'public') then gaps := gaps || format('%s may not own these functions', r.rolname); continue; end if;
    foreach t in array public.platform_fan_ranking_owner_tables() loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not pg_catalog.has_table_privilege(r.role_oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', r.rolname, t); end if;
      if not r.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd in ('r', '*')) then
        gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_proc p where p.proowner = r.role_oid and p.oid = 'public.refresh_ranking_snapshots(timestamptz)'::regprocedure)
       and not (pg_catalog.has_table_privilege(r.role_oid, 'public.ranking_snapshots'::regclass, 'insert') and pg_catalog.has_table_privilege(r.role_oid, 'public.ranking_snapshots'::regclass, 'delete')) then
      gaps := gaps || format('%s cannot write ranking_snapshots', r.rolname);
    end if;
    if exists (select 1 from pg_catalog.pg_proc p where p.proowner = r.role_oid and p.oid = 'public.refresh_ranking_snapshots(timestamptz)'::regprocedure)
       and not r.rolbypassrls and (select relrowsecurity and (relforcerowsecurity or relowner <> r.role_oid) from pg_catalog.pg_class where oid = 'public.ranking_snapshots'::regclass)
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = 'public.ranking_snapshots'::regclass and r.role_oid = any (p.polroles) and p.polpermissive and p.polcmd = '*') then
      gaps := gaps || format('%s has no write policy on ranking_snapshots', r.rolname);
    end if;
    foreach f in array public.platform_fan_ranking_owner_functions() loop
      if not pg_catalog.has_function_privilege(r.role_oid, f, 'execute') then gaps := gaps || format('%s cannot execute %s', r.rolname, f); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'PLATFORM_FAN_RANKING_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $$;
revoke all on function public.platform_fan_ranking_owner_roles(), public.platform_fan_ranking_owner_tables(), public.platform_fan_ranking_owner_functions(),
  public.platform_fan_ranking_owner_access(), public.platform_fan_ranking_owner_check() from public, anon, authenticated, service_role;
select public.platform_fan_ranking_owner_access();
select public.platform_fan_ranking_owner_check();

-- Build the new kind now, so the card is not empty until the next scheduled refresh.
select public.refresh_ranking_snapshots();
commit;
