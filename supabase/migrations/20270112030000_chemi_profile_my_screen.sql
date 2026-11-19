-- 케미 탭 W6-MY-BIRTH · MY 생일 정보 화면에 필요한 함수 보강(설계 arch-chemi r3 §3 프로필 줄, 시트 11-2 · 04). r4 profile_fn·profile_guard 뒤 번호다.
-- 더하기만 한다: 표·열 변경 0. r4 의 v2 저장 함수를 같은 서명으로 바꿔 쓰고(권한 유지), 새 함수 2개를 더한다. 옛 chemi_save_birth 는 건드리지 않는다.
--  1) chemi_save_birth_v2: 30일 안이어도 시간·태어난 곳을 '처음 채우는' 저장은 고치기 횟수에 넣지 않는다(나머지 값이 그대로일 때만).
--  2) chemi_save_birth_v2: 고쳐도 '동의함' 날짜(consent_at)는 동의 문구의 판이 바뀔 때만 바뀐다. 저장이 일어나는 모든 경로(같은 값 · 30일 안 채우기 · 일반 고치기)가 똑같이 따른다.
--  3) chemi_update_partner_v3: 궁합 상대 고치기. 지문 비교·옛 지문 줄 지우기를 사용자 잠금 아래 SQL 에서 한다(웹이 소금을 읽지 않는다, delete_partner_v3 와 같은 방식).
--  4) chemi_my_birth_summary: 지우기 확인에 보여 줄 건수와 '쓰는 곳' 상태. 읽기만 한다.

begin;

create or replace function public.chemi_save_birth_v2(p_user uuid, p_birth_date date, p_calendar text, p_birth_time time, p_precision text,
  p_gender text, p_birth_place text, p_place_code text, p_lat numeric, p_lon numeric, p_tz text, p_term_side text, p_consent_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur public.chemi_profiles%rowtype; band text; at_time timestamptz := pg_catalog.clock_timestamp(); editable timestamptz;
  place text := nullif(pg_catalog.btrim(p_birth_place), ''); rev bigint; next_consent timestamptz;
begin
  perform public.chemi_lock_user(p_user);
  perform public.chemi_assert_unrestricted(p_user);
  if p_birth_date is null or p_consent_version is null or p_birth_date > public.dukjil_kst_date(at_time) then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  band := public.chemi_age_band(p_birth_date, public.dukjil_kst_date(at_time));
  if band = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  select * into cur from public.chemi_profiles where user_id = p_user for update;
  if not found then
    insert into public.chemi_profiles (user_id, birth_date, calendar, birth_time, time_precision, gender, birth_place,
      birth_place_code, birth_lat, birth_lon, birth_tz, term_side, consent_version, consent_at, created_at)
    values (p_user, p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, place,
      p_place_code, p_lat, p_lon, p_tz, p_term_side, p_consent_version, at_time, at_time)
    returning birth_rev into rev;
    return jsonb_build_object('ageBand', band, 'saved', true, 'edited', false, 'editableFrom', null, 'birthRev', rev);
  end if;
  -- 동의 문구의 판이 바뀌었을 때만 동의 시각을 새로 찍는다(어느 경로로 저장해도 같다). 고치기 횟수·시각은 건드리지 않는다.
  next_consent := case when cur.consent_version is distinct from p_consent_version then at_time else cur.consent_at end;
  if (cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender, cur.birth_place, cur.birth_place_code,
      cur.birth_lat, cur.birth_lon, cur.birth_tz, cur.term_side)
    is not distinct from (p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, place, p_place_code, p_lat, p_lon, p_tz, p_term_side) then
    if cur.consent_version is distinct from p_consent_version then
      update public.chemi_profiles set consent_version = p_consent_version, consent_at = next_consent where user_id = p_user;
    end if;
    return jsonb_build_object('ageBand', band, 'saved', cur.consent_version is distinct from p_consent_version, 'edited', false,
      'editableFrom', case when cur.edited_at is not null and cur.edited_at + interval '30 days' > at_time then cur.edited_at + interval '30 days' end,
      'birthRev', cur.birth_rev);
  end if;
  editable := cur.edited_at + interval '30 days';
  if editable is not null and editable > at_time then
    -- 30일 안: 비어 있던 시간·태어난 곳을 채우는 저장만 된다(생년월일·달력·성별과 이미 있던 값은 그대로여야 한다).
    if cur.birth_date = p_birth_date and cur.calendar = p_calendar and cur.gender is not distinct from p_gender
      and (cur.time_precision = 'unknown' or (cur.birth_time, cur.time_precision) is not distinct from (p_birth_time, p_precision))
      and (cur.birth_place is null or cur.birth_place = place)
      and (cur.birth_place_code is null or cur.birth_place_code is not distinct from p_place_code)
      and (cur.birth_lat is null or cur.birth_lat is not distinct from p_lat) and (cur.birth_lon is null or cur.birth_lon is not distinct from p_lon)
      and (cur.birth_tz is null or cur.birth_tz is not distinct from p_tz) and cur.term_side is not distinct from p_term_side then
      update public.chemi_profiles set birth_time = p_birth_time, time_precision = p_precision, birth_place = place,
        birth_place_code = p_place_code, birth_lat = p_lat, birth_lon = p_lon, birth_tz = p_tz,
        consent_version = p_consent_version, consent_at = next_consent where user_id = p_user
      returning birth_rev into rev;
      delete from public.chemi_charts where user_id = p_user;
      return jsonb_build_object('ageBand', band, 'saved', true, 'edited', false, 'editableFrom', editable, 'birthRev', rev);
    end if;
    raise exception 'CHEMI_EDIT_LIMIT' using errcode = '42501', detail = editable::text;
  end if;
  update public.chemi_profiles set birth_date = p_birth_date, calendar = p_calendar, birth_time = p_birth_time, time_precision = p_precision,
    gender = p_gender, birth_place = place, birth_place_code = p_place_code, birth_lat = p_lat, birth_lon = p_lon, birth_tz = p_tz,
    term_side = p_term_side, consent_version = p_consent_version, consent_at = next_consent, edited_at = at_time, edit_count = edit_count + 1
  where user_id = p_user
  returning birth_rev into rev;
  delete from public.chemi_charts where user_id = p_user;
  return jsonb_build_object('ageBand', band, 'saved', true, 'edited', true, 'editableFrom', at_time + interval '30 days', 'birthRev', rev);
end $$;

-- 상대 고치기 v3: 생일·양음력·시간·성별(지문 입력)이 달라졌을 때만 옛 지문 줄을 지우고 compat_first_date 를 비운다. 별명만 바뀌면 아무것도 지우지 않는다.
-- 옛 지문은 저장된 입력과 이미 있는 소금으로 만든다(소금이 없으면 지문 줄도 있을 수 없어 옛 번호 열쇠 줄만 지운다). 소금은 만들지 않는다. 장소는 건드리지 않는다.
create function public.chemi_update_partner_v3(p_user uuid, p_partner uuid, p_nickname text, p_birth_date date, p_calendar text, p_birth_time time,
  p_precision text, p_gender text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur public.chemi_partners%rowtype; salt bytea; erased integer := 0; changed boolean; partner public.chemi_partners%rowtype;
begin
  perform public.chemi_lock_user(p_user);
  perform public.chemi_assert_unrestricted(p_user);
  if p_partner is null or p_birth_date is null or p_birth_date > public.dukjil_kst_date() then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  if public.chemi_age_band(p_birth_date, public.dukjil_kst_date()) = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  select * into cur from public.chemi_partners where id = p_partner and user_id = p_user for update;
  if not found then return jsonb_build_object('updated', false); end if;
  changed := (cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender)
    is distinct from (p_birth_date, p_calendar, p_birth_time, p_precision, p_gender);
  if changed then
    select fp_salt into salt from public.chemi_user_state where user_id = p_user;
    erased := public.chemi_erase_partner_rows(p_user, p_partner, case when salt is not null then
      public.chemi_partner_fp(salt, cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender) end);
  end if;
  update public.chemi_partners set nickname = pg_catalog.btrim(p_nickname), birth_date = p_birth_date, calendar = p_calendar,
    birth_time = p_birth_time, time_precision = p_precision, gender = p_gender,
    compat_first_date = case when changed then null else compat_first_date end
  where id = p_partner and user_id = p_user
  returning * into partner;
  return jsonb_build_object('updated', true, 'rev', partner.rev, 'erased', erased);
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

revoke all on function public.chemi_update_partner_v3(uuid, uuid, text, date, text, time, text, text), public.chemi_my_birth_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_update_partner_v3(uuid, uuid, text, date, text, time, text, text), public.chemi_my_birth_summary(uuid) to service_role;

commit;
