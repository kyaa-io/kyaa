-- ATTRIBUTION-EVERYWHERE-1126: keep the way each new member reached kyaa (first visit and latest outside visit).
--
-- The web proxy writes two first-party cookies on the first page request (utm_*, ad click id kind, invite code,
-- referring host, in-app browser kind, landing path pattern, time; no IP, no raw user agent). The session route
-- copies them here once, only for an account created in the last hour, so existing members are never back-filled.
-- read_admin_signup_touches() groups sign-ups in a period by first-visit path, by app browser, by KST day and hour.
-- Rollback: supabase/rollback/20270116060000_member_acquisition_touches.sql
begin;
set local lock_timeout = '5s';

create table public.app_user_acquisition_touches (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  -- null: the browser sent no cookie (blocked, cleared, or a page the proxy does not see).
  first_touch jsonb check (first_touch is null or (jsonb_typeof(first_touch) = 'object' and pg_column_size(first_touch) <= 2048)),
  last_touch jsonb check (last_touch is null or (jsonb_typeof(last_touch) = 'object' and pg_column_size(last_touch) <= 2048)),
  recorded_at timestamptz not null default now()
);

alter table public.app_user_acquisition_touches enable row level security;
revoke all on table public.app_user_acquisition_touches from public, anon, authenticated;
grant select on table public.app_user_acquisition_touches to service_role;

comment on table public.app_user_acquisition_touches is
  'How a member first reached kyaa and the latest outside visit before signing up, copied once at signup from first-party cookies. No IP or raw user agent.';

create function public.record_app_user_acquisition_touch(p_app_user_id uuid, p_first jsonb, p_last jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
begin
  if (p_first is not null and jsonb_typeof(p_first) <> 'object') or (p_last is not null and jsonb_typeof(p_last) <> 'object') then
    raise exception 'ACQUISITION_TOUCH_INVALID' using errcode = '22023';
  end if;
  insert into public.app_user_acquisition_touches (app_user_id, first_touch, last_touch)
  select u.id, p_first, p_last
  from public.app_users u
  where u.id = p_app_user_id and u.created_at >= now() - interval '1 hour'
  on conflict (app_user_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.record_app_user_acquisition_touch(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_app_user_acquisition_touch(uuid,jsonb,jsonb) to service_role;

-- One label per first visit: a tag wins, then an ad click id, an invite, another site, an app hand-off, else direct.
create function public.acquisition_touch_path(p_touch jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_touch is null then 'no_cookie'
    when p_touch ? 'src' or p_touch ? 'med' or p_touch ? 'cmp' then
      concat_ws(' / ', coalesce(p_touch->>'src', '-'), coalesce(p_touch->>'med', '-'), p_touch->>'cmp')
    when p_touch ? 'clk' then 'ad click: ' || (p_touch->>'clk')
    when p_touch ? 'ref' then 'invite'
    when p_touch ? 'rh' then 'site: ' || regexp_replace(p_touch->>'rh', '^www\.', '')
    when p_touch ? 'via' then 'app: ' || (p_touch->>'via')
    else 'direct'
  end
$$;

revoke all on function public.acquisition_touch_path(jsonb) from public, anon, authenticated;
grant execute on function public.acquisition_touch_path(jsonb) to service_role;

create function public.read_admin_signup_touches(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_days integer
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_to timestamptz := statement_timestamp();
  v_from timestamptz;
  v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'SIGNUP_TOUCHES_INVALID_DAYS' using errcode = '22023';
  end if;
  -- Whole KST days, today included.
  v_from := (date_trunc('day', v_to at time zone 'Asia/Seoul') - make_interval(days => p_days - 1)) at time zone 'Asia/Seoul';

  with signups as (
    select u.created_at at time zone 'Asia/Seoul' as kst,
      case when t.app_user_id is null then 'unrecorded' else public.acquisition_touch_path(t.first_touch) end as path,
      case when t.app_user_id is null then 'unrecorded'
        else coalesce(t.first_touch->>'via', t.first_touch->>'app', 'no_cookie') end as app
    from public.app_users u
    left join public.app_user_acquisition_touches t on t.app_user_id = u.id
    where u.created_at >= v_from and u.created_at <= v_to
  )
  select jsonb_build_object(
    'days', p_days, 'from', v_from, 'to', v_to, 'timeZone', 'Asia/Seoul',
    'total', (select count(*) from signups),
    'paths', (select coalesce(jsonb_agg(jsonb_build_object('label', path, 'signups', n) order by n desc, path), '[]'::jsonb)
      from (select path, count(*) as n from signups group by path) p),
    'apps', (select coalesce(jsonb_agg(jsonb_build_object('label', app, 'signups', n) order by n desc, app), '[]'::jsonb)
      from (select app, count(*) as n from signups group by app) a),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', day, 'signups', n) order by day), '[]'::jsonb)
      from (select to_char(kst, 'YYYY-MM-DD') as day, count(*) as n from signups group by 1) d),
    'hourly', (select jsonb_agg(jsonb_build_object('hour', h, 'signups', coalesce(n, 0)) order by h)
      from generate_series(0, 23) h
      left join (select extract(hour from kst)::int as hour, count(*) as n from signups group by 1) c on c.hour = h),
    -- Path by KST hour, for reading a post or a mail send against the hours after it.
    'pathHours', (select coalesce(jsonb_agg(jsonb_build_object('label', path, 'date', day, 'hour', hour, 'signups', n) order by day, hour, n desc), '[]'::jsonb)
      from (select path, to_char(kst, 'YYYY-MM-DD') as day, extract(hour from kst)::int as hour, count(*) as n
        from signups group by 1, 2, 3) ph)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.read_admin_signup_touches(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_admin_signup_touches(uuid,uuid,integer) to service_role;

notify pgrst, 'reload schema';
commit;
