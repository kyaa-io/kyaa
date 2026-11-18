-- 케미 탭 W6-MY-BIRTH · MY 생일 정보 화면에 필요한 함수 보강(설계 arch-chemi r3 §3 프로필 줄, 시트 11-2 · 04).
-- 더하기만 한다: 표·열 변경 0. 기존 chemi_save_birth 는 같은 서명으로 바꿔 쓰고(권한 유지), 새 함수 2개를 더한다.
--  1) 30일 안이어도 시간·태어난 곳을 '처음 채우는' 저장은 고치기 횟수에 넣지 않는다(나머지 값이 그대로일 때만).
--  2) 고쳐도 '동의함' 날짜(consent_at)는 동의 문구의 판이 바뀔 때만 바뀐다.
--  3) 궁합 상대 고치기(chemi_update_partner).
--  4) 지우기 확인에 보여 줄 건수와 '쓰는 곳' 상태(chemi_my_birth_summary). 읽기만 한다.

create or replace function public.chemi_save_birth(p_user uuid, p_birth_date date, p_calendar text, p_birth_time time, p_precision text,
  p_gender text, p_birth_place text, p_consent_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur public.chemi_profiles%rowtype; band text; at_time timestamptz := pg_catalog.clock_timestamp(); editable timestamptz; place text := nullif(btrim(p_birth_place), '');
begin
  perform public.chemi_lock_user(p_user);
  if p_birth_date is null or p_consent_version is null or p_birth_date > public.dukjil_kst_date(at_time) then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  band := public.chemi_age_band(p_birth_date, public.dukjil_kst_date(at_time));
  if band = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  select * into cur from public.chemi_profiles where user_id = p_user for update;
  if not found then
    insert into public.chemi_profiles (user_id, birth_date, calendar, birth_time, time_precision, gender, birth_place, consent_version, consent_at, created_at)
    values (p_user, p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, place, p_consent_version, at_time, at_time);
    return jsonb_build_object('ageBand', band, 'saved', true, 'edited', false, 'editableFrom', null);
  end if;
  if (cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender, cur.birth_place)
    is not distinct from (p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, place) then
    return jsonb_build_object('ageBand', band, 'saved', false, 'edited', false,
      'editableFrom', case when cur.edited_at is not null and cur.edited_at + interval '30 days' > at_time then cur.edited_at + interval '30 days' end);
  end if;
  editable := cur.edited_at + interval '30 days';
  if editable is not null and editable > at_time then
    -- 30일 안: 비어 있던 시간·태어난 곳을 채우는 저장만 된다(생년월일·달력·성별과 이미 있던 값은 그대로여야 한다).
    if cur.birth_date = p_birth_date and cur.calendar = p_calendar and cur.gender is not distinct from p_gender
      and (cur.time_precision <> 'unknown' and (cur.birth_time, cur.time_precision) is not distinct from (p_birth_time, p_precision)
           or cur.time_precision = 'unknown')
      and (cur.birth_place is not null and cur.birth_place = place or cur.birth_place is null) then
      update public.chemi_profiles set birth_time = p_birth_time, time_precision = p_precision, birth_place = place where user_id = p_user;
      delete from public.chemi_charts where user_id = p_user;
      return jsonb_build_object('ageBand', band, 'saved', true, 'edited', false, 'editableFrom', editable);
    end if;
    raise exception 'CHEMI_EDIT_LIMIT' using errcode = '42501', detail = editable::text;
  end if;
  update public.chemi_profiles set birth_date = p_birth_date, calendar = p_calendar, birth_time = p_birth_time, time_precision = p_precision,
    gender = p_gender, birth_place = place,
    consent_at = case when consent_version is distinct from p_consent_version then at_time else consent_at end, consent_version = p_consent_version,
    edited_at = at_time, edit_count = edit_count + 1
  where user_id = p_user;
  delete from public.chemi_charts where user_id = p_user;
  return jsonb_build_object('ageBand', band, 'saved', true, 'edited', true, 'editableFrom', at_time + interval '30 days');
end $$;

create function public.chemi_update_partner(p_user uuid, p_partner uuid, p_nickname text, p_birth_date date, p_calendar text, p_birth_time time,
  p_precision text, p_gender text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chemi_lock_user(p_user);
  if p_birth_date is null or p_birth_date > public.dukjil_kst_date() then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  if public.chemi_age_band(p_birth_date, public.dukjil_kst_date()) = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  update public.chemi_partners set nickname = btrim(p_nickname), birth_date = p_birth_date, calendar = p_calendar, birth_time = p_birth_time,
    time_precision = p_precision, gender = p_gender
  where id = p_partner and user_id = p_user;
  return jsonb_build_object('updated', found);
end $$;

-- 지우기 확인에 보여 줄 건수(지워지는 것: 운세를 본 날 수 · 질문 기록 · 궁합 상대 / 남는 것: 구매 내역 · 남은 질문 이용권)와
-- '쓰는 곳' 상태(사주 풀이가 있는지, 오늘의 운세·별자리 운세를 오늘 봤는지).
create function public.chemi_my_birth_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'readingDays', (select count(distinct kst_date) from public.chemi_readings where user_id = p_user),
    'askThreads', (select count(*) from public.chemi_ask_threads where user_id = p_user),
    'partners', (select count(*) from public.chemi_partners where user_id = p_user),
    'orders', (select count(*) from public.chemi_orders where user_id = p_user and status in ('paid', 'opened', 'refunded')),
    'askPassesLeft', coalesce((select sum(remaining) from public.chemi_pass_lots
      where user_id = p_user and pass_kind = 'ask' and closed_at is null and (expires_at is null or expires_at > pg_catalog.clock_timestamp())), 0),
    'sajuReading', exists (select 1 from public.chemi_readings where user_id = p_user and content = 'saju'),
    'fortuneToday', exists (select 1 from public.chemi_readings where user_id = p_user and content = 'fortune' and kst_date = public.dukjil_kst_date()),
    'starToday', exists (select 1 from public.chemi_readings where user_id = p_user and content = 'star' and kst_date = public.dukjil_kst_date()))
$$;

revoke all on function public.chemi_update_partner(uuid, uuid, text, date, text, time, text, text), public.chemi_my_birth_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_update_partner(uuid, uuid, text, date, text, time, text, text), public.chemi_my_birth_summary(uuid) to service_role;
