-- PASSPORT-RENEWAL P2 (PR-P2-DB-7): attend_creator issues the mission-book slot 8 (steady check-in) stamp once the page's
-- cumulative attendance reaches the policy days. 20261210040000 is already applied (dev, merged to main), so the change lives
-- here instead of in that file. Same signature, so grants are kept; they are restated below. passport_issue_steady_checkin
-- is defined in 20261210132000 and resolved at call time.

create or replace function public.attend_creator(p_user uuid, p_celebrity uuid, p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date();
  pol public.dukjil_policy_versions;
  rule jsonb; prior public.group_creator_attendance; mine public.group_creator_attendance;
  streak_count integer; bonus integer := 0; base integer; total integer;
  att_id uuid := extensions.gen_random_uuid(); stamp uuid; entry uuid;
begin
  if p_user is null or p_celebrity is null or p_request_key is null then
    raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  perform public.group_wallet_lock(p_user);
  select * into mine from public.group_creator_attendance where app_user_id = p_user and request_key = p_request_key;
  if found then
    if mine.celebrity_id <> p_celebrity then raise exception 'GROUP_WALLET_REQUEST_CONFLICT' using errcode = 'P0001'; end if;
    return jsonb_build_object('points', mine.points, 'streak', mine.streak, 'bonusPoints', 0,
      'stampId', mine.stamp_id, 'attendanceDate', mine.attendance_date, 'replayed', true);
  end if;
  pol := public.dukjil_active_policy();
  if pol.version is null then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
  perform 1 from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if not found then raise exception 'PASSPORT_REQUIRED' using errcode = 'P0001'; end if;
  select * into mine from public.group_creator_attendance
    where app_user_id = p_user and celebrity_id = p_celebrity and attendance_date = today;
  if found then
    return jsonb_build_object('points', mine.points, 'streak', mine.streak, 'bonusPoints', 0,
      'stampId', mine.stamp_id, 'attendanceDate', mine.attendance_date, 'replayed', true);
  end if;
  rule := pol.rules -> 'actions' -> 'checkin';
  select * into prior from public.group_creator_attendance
    where app_user_id = p_user and celebrity_id = p_celebrity and attendance_date = today - 1;
  streak_count := coalesce(prior.streak, 0) + 1;
  base := (rule ->> 'points')::integer;
  if streak_count % (rule ->> 'streakEvery')::integer = 0 then bonus := (rule ->> 'streakBonus')::integer; end if;
  total := base + bonus;
  stamp := public.dukjil_issue_stamp(p_user, p_celebrity, 'daily_checkin',
    'daily-checkin:' || p_celebrity::text || ':' || today::text, pol.version);
  entry := public.group_wallet_post(p_user, 'fan_point', total, 'dukjil_action', att_id);
  insert into public.group_creator_attendance(id, app_user_id, celebrity_id, attendance_date, streak, points,
      stamp_id, ledger_id, request_key, policy_version)
    values (att_id, p_user, p_celebrity, today, streak_count, total, stamp, entry, p_request_key, pol.version);
  -- mission-book slot 8: the steady check-in stamp is issued here, once, when the cumulative attendance reaches the policy's days
  -- (passport_issue_steady_checkin is defined in 20261210132000 and resolved at call time)
  perform public.passport_issue_steady_checkin(p_user, p_celebrity);
  return jsonb_build_object('points', total, 'streak', streak_count, 'bonusPoints', bonus,
    'stampId', stamp, 'attendanceDate', today, 'replayed', false);
end $$;
revoke all on function public.attend_creator(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.attend_creator(uuid, uuid, uuid) to service_role;
