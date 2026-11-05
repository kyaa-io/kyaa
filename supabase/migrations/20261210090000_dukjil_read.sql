-- PASSPORT-RENEWAL P1-7: dukjil read RPCs (contract §15). read_dukjil_today gets a creator argument,
-- read_dukjil_attendance reads attendance for up to 50 creators in one query.
-- `remaining` uses the same pointCap rule and the same counting window as record_dukjil_action,
-- `streak` the same rule as attend_creator (running streak; 0 once yesterday is missed).

drop function public.read_dukjil_today(uuid);

create function public.read_dukjil_attendance(p_user uuid, p_celebrities uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date();
  pol public.dukjil_policy_versions; every integer; items jsonb;
begin
  if p_user is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  if p_celebrities is null or coalesce(cardinality(p_celebrities), 0) > 50
     or array_position(p_celebrities, null) is not null then
    raise exception 'DUKJIL_PARAMS_INVALID' using errcode = 'P0001'; end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then
    return jsonb_build_object('kstDate', today, 'items', '[]'::jsonb); end if;
  every := (pol.rules -> 'actions' -> 'checkin' ->> 'streakEvery')::integer;
  select coalesce(jsonb_agg(jsonb_build_object(
      'celebrityId', c.id,
      'attendedToday', coalesce(a.attendance_date = today, false),
      'streak', coalesce(a.streak, 0),
      'nextBonusIn', every - (coalesce(a.streak, 0) % every),
      'hasPassport', exists(select 1 from public.fan_passports fp
        where fp.app_user_id = p_user and fp.celebrity_id = c.id)
    ) order by c.ord), '[]'::jsonb) into items
  from unnest(p_celebrities) with ordinality as c(id, ord)
  left join lateral (
    select g.attendance_date, g.streak from public.group_creator_attendance g
    where g.app_user_id = p_user and g.celebrity_id = c.id and g.attendance_date >= today - 1
    order by g.attendance_date desc limit 1
  ) a on true;
  return jsonb_build_object('kstDate', today, 'items', items);
end $$;

create function public.read_dukjil_today(p_user uuid, p_celebrity uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date();
  day_start timestamptz := (public.dukjil_kst_date()::timestamp at time zone 'Asia/Seoul');
  day_end timestamptz := ((public.dukjil_kst_date() + 1)::timestamp at time zone 'Asia/Seoul');
  month_start date := date_trunc('month', public.dukjil_kst_date()::timestamp)::date;
  pol public.dukjil_policy_versions; act record; rule jsonb; prule jsonb; srule jsonb;
  cnt integer; pts bigint; used integer; rem integer; stamped boolean; scount integer; cap_per text;
  actions jsonb := '{}'::jsonb; total bigint := 0; att jsonb := null; has_pass boolean := null; item jsonb;
begin
  if p_user is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then
    return jsonb_build_object('kstDate', today, 'policyActive', false); end if;

  if p_celebrity is not null then
    item := public.read_dukjil_attendance(p_user, array[p_celebrity]) -> 'items' -> 0;
    att := jsonb_build_object('attendedToday', item -> 'attendedToday', 'streak', item -> 'streak',
      'nextBonusIn', item -> 'nextBonusIn');
    has_pass := (item ->> 'hasPassport')::boolean;
  end if;

  for act in select key, value from jsonb_each(pol.rules -> 'actions') loop
    rule := act.value; prule := rule -> 'pointCap'; srule := rule -> 'stamp';
    if act.key = 'checkin' then
      select count(*), coalesce(sum(points), 0) into cnt, pts from public.group_creator_attendance
        where app_user_id = p_user and attendance_date = today and points > 0;
    else
      select count(*), coalesce(sum(points), 0) into cnt, pts from public.dukjil_action_log
        where app_user_id = p_user and action_key = act.key and kst_date = today and points > 0;
    end if;
    total := total + pts;

    -- remaining: same cap windows as record_dukjil_action; null when the action has no point cap
    rem := null;
    if prule is not null and prule ->> 'per' <> 'none' then
      select count(*) into used from public.dukjil_action_log
        where app_user_id = p_user and action_key = act.key and points > 0
          and ((prule ->> 'per' = 'user_day' and kst_date = today)
            or (prule ->> 'per' = 'user_month' and kst_date >= month_start)
            or (prule ->> 'per' = 'creator_month' and kst_date >= month_start
                and celebrity_id is not distinct from p_celebrity));
      rem := greatest((prule ->> 'max')::integer - used, 0);
    elsif act.key = 'checkin' and p_celebrity is not null then
      rem := case when (att ->> 'attendedToday')::boolean then 0 else 1 end;
    end if;

    -- stamped: the stamp cap of the action is reached (creator-scoped caps use p_celebrity, else any creator)
    stamped := false;
    if srule is not null then
      cap_per := srule ->> 'capPer';
      if cap_per = 'creator_day' then
        select count(*) into scount from public.community_stamps where app_user_id = p_user
          and kind = (srule ->> 'kind')::public.community_stamp_kind
          and issued_at >= day_start and issued_at < day_end
          and (p_celebrity is null or celebrity_id = p_celebrity);
      elsif cap_per = 'creator_once' then
        select count(*) into scount from public.community_stamps where app_user_id = p_user
          and kind = (srule ->> 'kind')::public.community_stamp_kind
          and (p_celebrity is null or celebrity_id = p_celebrity);
      elsif cap_per = 'user_once' then
        select count(*) into scount from public.community_stamps where app_user_id = p_user
          and kind = (srule ->> 'kind')::public.community_stamp_kind;
      else scount := 0; end if;
      stamped := cap_per in ('creator_day','creator_once','user_once')
        and scount >= coalesce((srule ->> 'capMax')::integer, 1);
    end if;

    actions := actions || jsonb_build_object(act.key, jsonb_build_object(
      'count', cnt, 'points', pts, 'remaining', rem, 'stamped', stamped));
  end loop;

  return jsonb_build_object('kstDate', today, 'policyActive', true, 'totalPoints', total,
    'actions', actions, 'attendance', att, 'hasPassport', has_pass);
end $$;

revoke all on function public.read_dukjil_today(uuid, uuid), public.read_dukjil_attendance(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.read_dukjil_today(uuid, uuid), public.read_dukjil_attendance(uuid, uuid[])
  to service_role;
