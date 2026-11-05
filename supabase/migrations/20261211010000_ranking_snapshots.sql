-- PASSPORT-RENEWAL P4: rankings and the 100-jjinfan challenge (contract section 2 P4, plan section 9).
-- ranking_snapshots holds the top 100 per (kind, scope, period, period start). Readers never compute a ranking live; refresh_ranking_snapshots()
-- rebuilds the snapshots for the periods that are open at p_now. Who calls it, and how often, is decided outside this file (see the P4 report).
--
-- kinds:   creator_hearts    scope = nil uuid, subject = celebrity, score = passport_page_claim hearts
--          fan_contribution  scope = celebrity, subject = fan,       score = that fan's passport_page_claim hearts for the celebrity
--          dukjil            scope = celebrity, subject = fan,       score = stamps issued for the celebrity that were not voided (week, month only)
-- Conversion hearts (fan_heart_conversions) are not in creator_heart_ledger, so they cannot reach any ranking.
-- Order: score desc, then the earlier achieved_at (time of the fan's/creator's latest counted row), then subject id so equal times stay stable.
-- Periods are KST: week starts Monday 00:00, month on the 1st 00:00, all has the fixed start 1970-01-01.
-- Corrections: a voided stamp (community_stamps.revoked_at) leaves the dukjil score at the next refresh; a revoked title (jjinfan_titles.revoked_at)
-- leaves the challenge count at once because the count is read live. Heart ledger rows are append-only and are never taken back.

create table public.ranking_snapshots (
  kind text not null check (kind in ('creator_hearts', 'fan_contribution', 'dukjil')),
  scope_id uuid not null,
  period text not null check (period in ('week', 'month', 'all')),
  period_start date not null,
  computed_at timestamptz not null,
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 100),
  primary key (kind, scope_id, period, period_start),
  constraint ranking_snapshots_dukjil_period check (kind <> 'dukjil' or period <> 'all'),
  constraint ranking_snapshots_creator_scope check ((kind = 'creator_hearts') = (scope_id = '00000000-0000-0000-0000-000000000000'::uuid))
);
alter table public.ranking_snapshots enable row level security;
revoke all on public.ranking_snapshots from public, anon, authenticated, service_role;

-- Period window in KST. Returns the stored period start and the half-open [from_ts, to_ts) window.
create function public.ranking_period_window(p_period text, p_at timestamptz)
returns table (period_start date, from_ts timestamptz, to_ts timestamptz)
language plpgsql stable set search_path = '' as $$
declare s date;
begin
  if p_period = 'week' then
    s := pg_catalog.date_trunc('week', p_at at time zone 'Asia/Seoul')::date;
    return query select s, s::timestamp at time zone 'Asia/Seoul', (s + 7)::timestamp at time zone 'Asia/Seoul';
  elsif p_period = 'month' then
    s := pg_catalog.date_trunc('month', p_at at time zone 'Asia/Seoul')::date;
    return query select s, s::timestamp at time zone 'Asia/Seoul', (s + interval '1 month')::timestamp at time zone 'Asia/Seoul';
  elsif p_period = 'all' then
    return query select '1970-01-01'::date, '-infinity'::timestamptz, 'infinity'::timestamptz;
  else
    raise exception 'RANKING_PERIOD_INVALID' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.ranking_period_window(text, timestamptz) from public, anon, authenticated, service_role;

-- Scores for one kind inside a window. p_scope null = every scope (used by the refresh).
create function public.ranking_scores(p_kind text, p_scope uuid, p_from timestamptz, p_to timestamptz)
returns table (scope_id uuid, subject_id uuid, score bigint, achieved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select '00000000-0000-0000-0000-000000000000'::uuid, l.celebrity_id, count(*)::bigint, max(l.created_at)
    from public.creator_heart_ledger l
    join public.celebrities c on c.id = l.celebrity_id and c.status = 'published' and c.archived_at is null
   where p_kind = 'creator_hearts' and l.source_type = 'passport_page_claim' and l.created_at >= p_from and l.created_at < p_to
   group by l.celebrity_id
  union all
  select l.celebrity_id, l.app_user_id, count(*)::bigint, max(l.created_at)
    from public.creator_heart_ledger l
    join public.celebrities c on c.id = l.celebrity_id and c.status = 'published' and c.archived_at is null
    join public.app_users u on u.id = l.app_user_id and u.status = 'active'
   where p_kind = 'fan_contribution' and l.source_type = 'passport_page_claim' and (p_scope is null or l.celebrity_id = p_scope)
     and l.created_at >= p_from and l.created_at < p_to
   group by l.celebrity_id, l.app_user_id
  union all
  select s.celebrity_id, s.app_user_id, count(*)::bigint, max(s.issued_at)
    from public.community_stamps s
    join public.celebrities c on c.id = s.celebrity_id and c.status = 'published' and c.archived_at is null
    join public.app_users u on u.id = s.app_user_id and u.status = 'active'
   where p_kind = 'dukjil' and s.celebrity_id is not null and (p_scope is null or s.celebrity_id = p_scope)
     and s.revoked_at is null and not exists (select 1 from public.passport_stamp_voids v where v.stamp_id = s.id)
     and s.issued_at >= p_from and s.issued_at < p_to
   group by s.celebrity_id, s.app_user_id
$$;
revoke all on function public.ranking_scores(text, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

create function public.refresh_ranking_snapshots(p_now timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  per text; k text; w record; written integer; total integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ranking_snapshots'));
  foreach per in array array['week', 'month', 'all'] loop
    select * into w from public.ranking_period_window(per, p_now);
    foreach k in array array['creator_hearts', 'fan_contribution', 'dukjil'] loop
      continue when k = 'dukjil' and per = 'all';
      delete from public.ranking_snapshots where kind = k and period = per and period_start = w.period_start;
      insert into public.ranking_snapshots(kind, scope_id, period, period_start, computed_at, rows)
      select k, ranked.scope_id, per, w.period_start, p_now,
             pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('rank', ranked.rn, 'subjectId', ranked.subject_id, 'score', ranked.score, 'achievedAt', ranked.achieved_at) order by ranked.rn)
        from (select s.scope_id, s.subject_id, s.score, s.achieved_at,
                     pg_catalog.row_number() over (partition by s.scope_id order by s.score desc, s.achieved_at asc, s.subject_id asc) as rn
                from public.ranking_scores(k, null, w.from_ts, w.to_ts) s) ranked
       where ranked.rn <= 100
       group by ranked.scope_id;
      get diagnostics written = row_count;
      total := total + written;
    end loop;
  end loop;
  return pg_catalog.jsonb_build_object('snapshots', total, 'computedAt', p_now);
end $$;
revoke all on function public.refresh_ranking_snapshots(timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_ranking_snapshots(timestamptz) to service_role;

-- Viewer rank for a page ranking. In the snapshot top 100 the snapshot entry wins; otherwise the rows ahead are counted with the same order.
create function public.ranking_my_rank(p_kind text, p_scope uuid, p_period text, p_at timestamptz, p_snapshot jsonb, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record; mine record; entry jsonb; ahead bigint;
begin
  if p_viewer is null then return null; end if;
  select e into entry from pg_catalog.jsonb_array_elements(coalesce(p_snapshot, '[]'::jsonb)) e where e ->> 'subjectId' = p_viewer::text limit 1;
  if entry is not null then
    return entry || pg_catalog.jsonb_build_object('inTop', true);
  end if;
  select * into w from public.ranking_period_window(p_period, p_at);
  select * into mine from public.ranking_scores(p_kind, p_scope, w.from_ts, w.to_ts) s where s.subject_id = p_viewer;
  if mine.subject_id is null then return null; end if;
  select count(*) into ahead from public.ranking_scores(p_kind, p_scope, w.from_ts, w.to_ts) s
   where s.score > mine.score
      or (s.score = mine.score and (s.achieved_at < mine.achieved_at or (s.achieved_at = mine.achieved_at and s.subject_id < mine.subject_id)));
  return pg_catalog.jsonb_build_object('rank', ahead + 1, 'subjectId', p_viewer, 'score', mine.score, 'achievedAt', mine.achieved_at, 'inTop', false);
end $$;
revoke all on function public.ranking_my_rank(text, uuid, text, timestamptz, jsonb, uuid) from public, anon, authenticated, service_role;

create function public.read_creator_ranking(p_period text, p_viewer uuid default null, p_locale text default 'ko', p_at timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record; snap public.ranking_snapshots; items jsonb;
begin
  select * into w from public.ranking_period_window(p_period, p_at);
  select * into snap from public.ranking_snapshots
   where kind = 'creator_hearts' and scope_id = '00000000-0000-0000-0000-000000000000'::uuid and period = p_period and period_start = w.period_start;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', (e ->> 'rank')::integer, 'subjectId', e ->> 'subjectId', 'score', (e ->> 'score')::bigint, 'achievedAt', e ->> 'achievedAt',
      'slug', c.slug, 'name', coalesce(nl.name, nk.name, ne.name, c.slug), 'imageUrl', c.image_url,
      'jjinfanCount', (select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = c.id and t.revoked_at is null),
      'myHearts', case when p_viewer is null then null else
        (select count(*) from public.creator_heart_ledger l where l.celebrity_id = c.id and l.app_user_id = p_viewer and l.source_type = 'passport_page_claim'
            and l.created_at >= w.from_ts and l.created_at < w.to_ts) end
    ) order by (e ->> 'rank')::integer), '[]'::jsonb) into items
    from pg_catalog.jsonb_array_elements(coalesce(snap.rows, '[]'::jsonb)) e
    join public.celebrities c on c.id = (e ->> 'subjectId')::uuid and c.status = 'published' and c.archived_at is null
    left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
    left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
    left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en';
  return pg_catalog.jsonb_build_object('period', p_period, 'periodStart', w.period_start, 'computedAt', snap.computed_at, 'rows', items);
end $$;
revoke all on function public.read_creator_ranking(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.read_creator_ranking(text, uuid, text, timestamptz) to service_role;

create function public.read_page_ranking(p_celebrity uuid, p_kind text, p_period text, p_viewer uuid default null, p_at timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record; snap public.ranking_snapshots; items jsonb;
begin
  if p_kind not in ('fan_contribution', 'dukjil') or (p_kind = 'dukjil' and p_period = 'all') then raise exception 'RANKING_PERIOD_INVALID' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into w from public.ranking_period_window(p_period, p_at);
  select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', (e ->> 'rank')::integer, 'subjectId', e ->> 'subjectId', 'score', (e ->> 'score')::bigint, 'achievedAt', e ->> 'achievedAt',
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink')
    ) order by (e ->> 'rank')::integer), '[]'::jsonb) into items
    from pg_catalog.jsonb_array_elements(coalesce(snap.rows, '[]'::jsonb)) e
    left join public.user_profiles pr on pr.app_user_id = (e ->> 'subjectId')::uuid
    left join public.app_user_avatars av on av.app_user_id = (e ->> 'subjectId')::uuid;
  return pg_catalog.jsonb_build_object('metric', p_kind, 'period', p_period, 'periodStart', w.period_start, 'computedAt', snap.computed_at, 'rows', items,
    'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer));
end $$;
revoke all on function public.read_page_ranking(uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.read_page_ranking(uuid, text, text, uuid, timestamptz) to service_role;

-- 100 jjinfan challenge: a live count of active titles held by active accounts (plan 9.1). There is no table of its own and no fan-meeting application (decision D10-1).
create function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select count(*) into n from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = p_celebrity and t.revoked_at is null;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100);
end $$;
revoke all on function public.read_jjinfan_challenge(uuid) from public, anon, authenticated;
grant execute on function public.read_jjinfan_challenge(uuid) to service_role;

-- Owner rights, following 20261210137000_passport_p2_owner_execute.sql. A SECURITY DEFINER function runs as its owner; on AWS the legacy tables it reads
-- can belong to the imported 'postgres' role while this migration's admin role owns the functions. Grant what is missing and fail instead of hiding a gap.
do $migration$
declare
  r record;
  p4_fns constant text[] := array['ranking_scores', 'refresh_ranking_snapshots', 'ranking_my_rank', 'read_creator_ranking', 'read_page_ranking', 'read_jjinfan_challenge'];
  read_tables constant text[] := array['creator_heart_ledger', 'jjinfan_titles', 'community_stamps', 'passport_stamp_voids', 'app_users', 'user_profiles',
    'app_user_avatars', 'celebrities', 'celebrity_localizations'];
  t text;
begin
  for r in
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls, tc.relname::text as tname
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_class tc on tc.relnamespace = 'public'::regnamespace and tc.relname = any (read_tables)
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p4_fns) and not o.rolsuper
       and o.rolname not in ('anon', 'authenticated', 'service_role', 'public') and o.oid <> tc.relowner
  loop
    execute format('grant select on table public.%I to %I', r.tname, r.rolname);
    if not r.rolbypassrls and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || r.tname)::regclass and r.role_oid = any (pol.polroles)) then
      execute format('create policy %I on public.%I for select to %I using (true)', 'p4_fn_owner_' || r.rolname, r.tname, r.rolname);
    end if;
  end loop;

  foreach t in array read_tables || array['ranking_snapshots'] loop
    for r in
      select distinct o.rolname from pg_catalog.pg_proc f
        join pg_catalog.pg_roles o on o.oid = f.proowner
       where f.pronamespace = 'public'::regnamespace and f.proname = any (p4_fns) and not o.rolsuper
         and (not pg_catalog.has_table_privilege(o.oid, ('public.' || t)::regclass, 'SELECT')
              or (not o.rolbypassrls and o.oid <> (select relowner from pg_catalog.pg_class where oid = ('public.' || t)::regclass)
                  and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || t)::regclass and o.oid = any (pol.polroles))))
    loop
      raise exception 'PASSPORT_P4_TABLE_PRIVILEGE_GAP: owner % cannot read %', r.rolname, t using errcode = 'P0001';
    end loop;
  end loop;

  -- the refresh writes ranking_snapshots; its owner owns the table here, so the write right must hold
  for r in
    select distinct o.rolname from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
     where f.pronamespace = 'public'::regnamespace and f.proname = 'refresh_ranking_snapshots' and not o.rolsuper
       and (not pg_catalog.has_table_privilege(o.oid, 'public.ranking_snapshots'::regclass, 'INSERT')
            or not pg_catalog.has_table_privilege(o.oid, 'public.ranking_snapshots'::regclass, 'DELETE'))
  loop
    raise exception 'PASSPORT_P4_TABLE_PRIVILEGE_GAP: owner % cannot write ranking_snapshots', r.rolname using errcode = 'P0001';
  end loop;
end $migration$;
