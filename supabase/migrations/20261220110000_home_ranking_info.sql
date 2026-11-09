-- Home rank info: reuse existing daily snapshots and on-demand ten-minute refresh; no cron or new snapshot table.
-- Fans count the counted creators for whom they hold a heart; creators retain their existing true-fan count.
-- No identifiers are added to JSON. Nickname/avatar, moderation, blocks, visibility and ordering stay unchanged.
-- Rollback: supabase/rollback/20261220110000_home_ranking_info.sql
begin;
set local lock_timeout = '5s';
alter table public.home_ranking_daily add column if not exists jjinfan_count bigint not null default 0 check (jjinfan_count >= 0);
-- Bound each recent-entry lookup to one subject across the retained days.
create index if not exists home_ranking_info_subject_day_idx on public.home_ranking_daily(kind, subject_id, day);

-- Invoker helpers: the existing reader owner remains the security boundary. The LIVE predicate is the public
-- directory's existing source (20261218010000 / deriveEffectiveLiveStatus), not ranking freshness or user presence.
create or replace function public.home_ranking_live_now(p_creator uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.live_events e join public.celebrities c on c.id = e.celebrity_id
     where e.celebrity_id = p_creator and c.status = 'published' and c.archived_at is null
       and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
       and e.publication_status = 'published' and e.archived_at is null and e.content_status <> 'cancelled'
       and coalesce(
         (select o.effective_status::text from public.live_status_overrides o
           where o.live_event_id = e.id and o.effective_from <= statement_timestamp()
             and (o.effective_until is null or statement_timestamp() < o.effective_until)
           order by o.effective_from desc, o.created_at desc limit 1),
         case when e.ends_at is null or statement_timestamp() < e.starts_at then 'scheduled'
              when statement_timestamp() < e.ends_at then 'live' else 'ended' end) = 'live'
  )
$$;
-- Recently entered this metric after an earlier known baseline, within seven calendar days of the snapshot.
-- The initial cohort has no known entry time, and must not all be marked new. Retention is 35 days.
create or replace function public.home_ranking_recent_entry(p_kind text, p_subject uuid, p_day date)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(first_day >= p_day - 6 and exists (
    select 1 from public.home_ranking_kind_builds b where b.kind = p_kind and b.day < first_day
  ), false)
  from (select min(d.day) as first_day from public.home_ranking_daily d
    where d.kind = p_kind and d.subject_id = p_subject and d.day <= p_day) first_seen
$$;
revoke all on function public.home_ranking_live_now(uuid), public.home_ranking_recent_entry(text,uuid,date) from public, anon, authenticated, service_role;
do $patch$
declare p record; def text; owner_name name;
begin
  for p in select * from (values
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$sum(t.hearts)::bigint as hearts,
             case max$a$, $b$sum(t.hearts)::bigint as hearts, count(*)::bigint as jjinfan_count,
             case max$b$, 1),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$coalesce(hd.hearts, 0)::bigint as hearts, hd.tier,$a$, $b$coalesce(hd.hearts, 0)::bigint as hearts, coalesce(hd.jjinfan_count, 0)::bigint as jjinfan_count, hd.tier,$b$, 1),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$hearts, tier, favorite_celebrity_id, achieved_at, computed_at)$a$, $b$hearts, tier, favorite_celebrity_id, achieved_at, computed_at, jjinfan_count)$b$, 2),
    ($f$public.refresh_home_rankings(timestamptz)$f$, $a$f.tier, f.favorite, r.achieved_at, p_now$a$, $b$f.tier, f.favorite, r.achieved_at, p_now, f.jjinfan_count$b$, 2),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$, $a$t.subject_id, t.score, t.hearts, t.rank as stored_rank$a$, $b$t.subject_id, t.score, t.hearts, t.jjinfan_count, t.rank as stored_rank$b$, 1),
    ($f$public.read_home_fan_ranking_v2(uuid,text,integer)$f$, $a$'delta', v.delta,$a$, $b$'delta', v.delta,
      'fans', v.jjinfan_count,
      'liveNow', public.home_ranking_live_now(v.favorite_celebrity_id),
      'isNew', public.home_ranking_recent_entry(k, v.subject_id, h.day),$b$, 1),
    ($f$public.read_home_creator_ranking_v2(text,text,integer)$f$, $a$'challenge', exists$a$, $b$'liveNow', public.home_ranking_live_now(s.subject_id),
      'isNew', public.home_ranking_recent_entry(k, s.subject_id, h.day),
      'challenge', exists$b$, 1)
  ) v(fn, old_text, new_text, occurrences) loop
    select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid = p.fn::regprocedure;
    if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
      raise exception 'RANK_INFO_OWNER_GAP: cannot replace % owned by %', p.fn, owner_name;
    end if;
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) = p.occurrences then continue; end if;
    if (length(def) - length(replace(def, p.old_text, ''))) / length(p.old_text) <> p.occurrences then
      raise exception 'RANK_INFO_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.old_text, p.new_text);
  end loop;
end $patch$;
-- No client gains table/helper access. Check both ordinary grants and RLS for each existing reader owner.
-- As in the prior owner checks, durable owner SELECT/EXECUTE grants remain after rollback.
do $access$
declare o record; c pg_catalog.pg_class; t text; f text; gaps text[] := '{}';
begin
  for o in select distinct r.oid, r.rolname, r.rolsuper, r.rolbypassrls from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner where p.oid in
      ('public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure, 'public.read_home_creator_ranking_v2(text,text,integer)'::regprocedure) loop
    foreach f in array array['public.home_ranking_live_now(uuid)', 'public.home_ranking_recent_entry(text,uuid,date)'] loop
      execute format('grant execute on function %s to %I', f, o.rolname);
    end loop;
    foreach t in array array['live_events', 'live_status_overrides', 'celebrities', 'home_ranking_daily', 'home_ranking_kind_builds'] loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if not pg_catalog.has_table_privilege(o.oid, c.oid, 'select') then
        begin execute format('grant select on table public.%I to %I', t, o.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not pg_catalog.has_table_privilege(o.oid, c.oid, 'select') then gaps := gaps || format('%s lacks select on %s', o.rolname, t); end if;
      if not o.rolsuper and not o.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(o.oid,c.relowner,'USAGE'))
        and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = c.oid and (o.oid = any(pol.polroles) or 0 = any(pol.polroles)) and pol.polpermissive and pol.polcmd in ('r','*') and pg_catalog.pg_get_expr(pol.polqual,pol.polrelid) = 'true') then
        gaps := gaps || format('%s lacks unconditional owner read policy on %s', o.rolname, t);
      end if;
    end loop;
    foreach f in array array['public.platform_fan_heart_counted(uuid)', 'public.creator_listed(uuid)'] loop
      if not pg_catalog.has_function_privilege(o.oid, f, 'execute') then gaps := gaps || format('%s cannot execute %s', o.rolname, f); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'RANK_INFO_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $access$;
-- Populate the new aggregate for today's already-existing snapshot.
select public.refresh_home_rankings();
notify pgrst, 'reload schema';
commit;
