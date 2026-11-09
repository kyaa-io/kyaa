-- Weekly service report for the admin traffic screen (METRICS-WEEKLY): one read function, no table or column changes.
-- Eight KST weeks (Monday to Sunday, the current week included and still counting), newest last. Every number comes from an existing source:
--   signups            app_users.created_at
--   activeMembers      members with one signed-in product event (screen views, reactions, attendance, shares, ...) or one action
--                      (check-in, fan board / group post, comment, lounge message) in the week. Only the last sign-in time is stored per
--                      member, so sign-ins themselves are not counted.
--   posts, comments    fan_posts + group_posts, fan_post_comments + group_comments that are not hidden, deleted or removed now
--   pointsGranted      positive fan_point rows of mobile_fan_economy_ledger (corrections and exchanges, which are negative, are not netted)
--   heartsGranted      creator_heart_ledger rows + fan_heart_conversions.hearts (the two sources of passport_hearts)
--   cumulativeSignups  app_users created up to the end of the week
-- Same exclusions as DEV-TIDY 4: test accounts (verified_email test-*@privy.io, fixture users f1610000-... and d2611001-... with a
-- fixture:doc-261107: privy id) and test pages (group_pages.listed = false, or a creator whose fan page is unlisted).
-- The answer is counts only: no member, post or creator identifier. Read-only admins (assert_active_admin writable = false) may read it.
-- The function belongs to the applying role. Where that role is not a superuser or BYPASSRLS (dev: byus_admin) it gets select and a
-- select policy on the tables read here, only where row security applies to it, and the file stops with METRICS_WEEKLY_OWNER_GAP if a
-- read would still be blocked.
-- Rollback: supabase/rollback/20261220070000_admin_weekly_metrics.sql. Probe: supabase/tests/admin_weekly_metrics.sql.
begin;
set local lock_timeout = '5s';

create or replace function public.read_admin_weekly_metrics(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_this_week timestamp := pg_catalog.date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul');
  v_first timestamp := v_this_week - interval '7 weeks';
  v_from timestamptz := v_first at time zone 'Asia/Seoul';
  v_to timestamptz := (v_this_week + interval '1 week') at time zone 'Asia/Seoul';
  v_weeks jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);

  with weeks as (
    select s.week_start from pg_catalog.generate_series(v_first, v_this_week, interval '1 week') s(week_start)
  ), test_users as materialized (
    select u.id from public.app_users u
    where (u.verified_email like 'test-%@privy.io' or u.id::text like 'f1610000-0000-4000-8000-%'
        or (u.id::text like 'd2611001-0000-4000-8000-%' and u.privy_user_id like 'fixture:doc-261107:%'))
      and u.verified_email is distinct from 'biz@sallylab.io'
  ), test_creators as materialized (
    select g.celebrity_id from public.group_pages g where g.kind = 'fan' and not g.listed and g.celebrity_id is not null
  ), test_pages as materialized (
    select g.id from public.group_pages g where not g.listed
  ), signups as (
    select pg_catalog.date_trunc('week', u.created_at at time zone 'Asia/Seoul') week_start, count(*) n
    from public.app_users u
    where u.created_at >= v_from and u.created_at < v_to and u.id not in (select id from test_users)
    group by 1
  ), signed_up_before as (
    select count(*) n from public.app_users u where u.created_at < v_from and u.id not in (select id from test_users)
  ), activity as (
    select e.app_user_id member, e.created_at at from public.fan_product_events e
    where e.app_user_id is not null and e.created_at >= v_from and e.created_at < v_to
      and e.event_name not in ('ticket_credited', 'ticket_debited', 'account_created', 'profile_completed', 'passport_issued',
        'benefit_won', 'fulfillment_completed', 'login_started', 'login_result')
      and (e.celebrity_id is null or e.celebrity_id not in (select celebrity_id from test_creators))
    union all select a.app_user_id, a.created_at from public.group_creator_attendance a
      where a.created_at >= v_from and a.created_at < v_to and a.celebrity_id not in (select celebrity_id from test_creators)
    union all select p.app_user_id, p.created_at from public.fan_posts p
      where p.created_at >= v_from and p.created_at < v_to and p.celebrity_id not in (select celebrity_id from test_creators)
    union all select c.app_user_id, c.created_at from public.fan_post_comments c join public.fan_posts p on p.id = c.post_id
      where c.created_at >= v_from and c.created_at < v_to and p.celebrity_id not in (select celebrity_id from test_creators)
    union all select m.app_user_id, m.created_at from public.fan_lounge_messages m
      where m.created_at >= v_from and m.created_at < v_to and m.celebrity_id not in (select celebrity_id from test_creators)
    union all select p.author_id, p.created_at from public.group_posts p
      where p.created_at >= v_from and p.created_at < v_to and p.page_id not in (select id from test_pages)
    union all select c.author_id, c.created_at from public.group_comments c join public.group_posts p on p.id = c.post_id
      where c.created_at >= v_from and c.created_at < v_to and p.page_id not in (select id from test_pages)
  ), active as (
    select pg_catalog.date_trunc('week', a.at at time zone 'Asia/Seoul') week_start, count(distinct a.member) n
    from activity a where a.member not in (select id from test_users) group by 1
  ), posts as (
    select x.week_start, count(*) n from (
      select pg_catalog.date_trunc('week', p.created_at at time zone 'Asia/Seoul') week_start from public.fan_posts p
        where p.created_at >= v_from and p.created_at < v_to and p.deleted_at is null and p.hidden_at is null
          and p.app_user_id not in (select id from test_users) and p.celebrity_id not in (select celebrity_id from test_creators)
      union all select pg_catalog.date_trunc('week', p.created_at at time zone 'Asia/Seoul') from public.group_posts p
        where p.created_at >= v_from and p.created_at < v_to and p.removed_at is null
          and p.author_id not in (select id from test_users) and p.page_id not in (select id from test_pages)
    ) x group by 1
  ), comments as (
    select x.week_start, count(*) n from (
      select pg_catalog.date_trunc('week', c.created_at at time zone 'Asia/Seoul') week_start
        from public.fan_post_comments c join public.fan_posts p on p.id = c.post_id
        where c.created_at >= v_from and c.created_at < v_to and c.deleted_at is null and c.hidden_at is null
          and c.app_user_id not in (select id from test_users) and p.celebrity_id not in (select celebrity_id from test_creators)
      union all select pg_catalog.date_trunc('week', c.created_at at time zone 'Asia/Seoul')
        from public.group_comments c join public.group_posts p on p.id = c.post_id
        where c.created_at >= v_from and c.created_at < v_to and c.removed_at is null
          and c.author_id not in (select id from test_users) and p.page_id not in (select id from test_pages)
    ) x group by 1
  ), points as (
    select pg_catalog.date_trunc('week', l.created_at at time zone 'Asia/Seoul') week_start, sum(l.amount) n
    from public.mobile_fan_economy_ledger l
    where l.asset = 'fan_point' and l.amount > 0 and l.created_at >= v_from and l.created_at < v_to
      and l.app_user_id not in (select id from test_users)
      and (l.celebrity_id is null or l.celebrity_id not in (select celebrity_id from test_creators))
    group by 1
  ), hearts as (
    select x.week_start, sum(x.n) n from (
      select pg_catalog.date_trunc('week', h.created_at at time zone 'Asia/Seoul') week_start, h.amount::bigint n
        from public.creator_heart_ledger h
        where h.created_at >= v_from and h.created_at < v_to
          and h.app_user_id not in (select id from test_users) and h.celebrity_id not in (select celebrity_id from test_creators)
      union all select pg_catalog.date_trunc('week', h.converted_at at time zone 'Asia/Seoul'), h.hearts::bigint
        from public.fan_heart_conversions h
        where h.converted_at >= v_from and h.converted_at < v_to
          and h.app_user_id not in (select id from test_users) and h.celebrity_id not in (select celebrity_id from test_creators)
    ) x group by 1
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'weekStart', pg_catalog.to_char(r.week_start, 'YYYY-MM-DD'),
      'weekEnd', pg_catalog.to_char(r.week_start + interval '6 days', 'YYYY-MM-DD'),
      'inProgress', r.week_start = v_this_week,
      'signups', r.signups,
      'activeMembers', r.active_members,
      'posts', r.posts,
      'comments', r.comments,
      'pointsGranted', r.points_granted,
      'heartsGranted', r.hearts_granted,
      'cumulativeSignups', r.cumulative_signups) order by r.week_start)
  into v_weeks
  from (
    select w.week_start,
      coalesce(s.n, 0)::bigint signups,
      coalesce(a.n, 0)::bigint active_members,
      coalesce(p.n, 0)::bigint posts,
      coalesce(c.n, 0)::bigint comments,
      coalesce(pt.n, 0)::bigint points_granted,
      coalesce(h.n, 0)::bigint hearts_granted,
      ((select b.n from signed_up_before b) + sum(coalesce(s.n, 0)) over (order by w.week_start))::bigint cumulative_signups
    from weeks w
    left join signups s on s.week_start = w.week_start
    left join active a on a.week_start = w.week_start
    left join posts p on p.week_start = w.week_start
    left join comments c on c.week_start = w.week_start
    left join points pt on pt.week_start = w.week_start
    left join hearts h on h.week_start = w.week_start
  ) r;

  return pg_catalog.jsonb_build_object('timezone', 'Asia/Seoul', 'from', v_from, 'to', v_to, 'weeks', v_weeks);
end;
$$;

revoke all on function public.read_admin_weekly_metrics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_admin_weekly_metrics(uuid, uuid) to service_role;

-- The reader runs as its owner. Grant what is missing; stop when the owner still cannot read.
do $access$
declare
  o record; c pg_catalog.pg_class; t text; gaps text[] := '{}';
begin
  select r.oid role_oid, r.rolname, r.rolsuper, r.rolbypassrls into o
    from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.read_admin_weekly_metrics(uuid,uuid)'::regprocedure;
  if not o.rolsuper then
    foreach t in array array['app_users', 'fan_product_events', 'group_creator_attendance', 'fan_posts', 'fan_post_comments',
        'fan_lounge_messages', 'group_posts', 'group_comments', 'group_pages', 'mobile_fan_economy_ledger',
        'creator_heart_ledger', 'fan_heart_conversions'] loop
      select * into c from pg_catalog.pg_class where oid = ('public.' || t)::regclass;
      if c.relowner <> o.role_oid and not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then
        begin execute pg_catalog.format('grant select on table public.%I to %I', t, o.rolname); exception when insufficient_privilege then null; end;
      end if;
      if not o.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> o.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = c.oid and o.role_oid = any (pol.polroles)
           and pol.polpermissive and pol.polcmd in ('r', '*')) then
        begin execute pg_catalog.format('create policy %I on public.%I for select to %I using (true)', 'metrics_weekly_owner_' || o.rolname, t, o.rolname);
        exception when insufficient_privilege then null; end;
      end if;
      if not pg_catalog.has_table_privilege(o.role_oid, c.oid, 'select') then gaps := gaps || pg_catalog.format('%s lacks select on %s', o.rolname, t); end if;
      if not o.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> o.role_oid)
         and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = c.oid and o.role_oid = any (pol.polroles)
           and pol.polpermissive and pol.polcmd in ('r', '*')) then
        gaps := gaps || pg_catalog.format('%s has no read policy on %s', o.rolname, t);
      end if;
    end loop;
  end if;
  if not pg_catalog.has_function_privilege(o.role_oid, 'public.assert_active_admin(uuid,uuid,boolean)', 'execute') then
    gaps := gaps || pg_catalog.format('%s cannot execute assert_active_admin', o.rolname);
  end if;
  if pg_catalog.cardinality(gaps) > 0 then raise exception 'METRICS_WEEKLY_OWNER_GAP: %', pg_catalog.array_to_string(gaps, '; '); end if;
end
$access$;

notify pgrst, 'reload schema';
commit;
