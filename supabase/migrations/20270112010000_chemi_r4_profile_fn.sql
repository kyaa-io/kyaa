-- 케미 r4 profile_fn (W1-DB-2 · F-B6·F-B9·F-B14·F-B15·F-B12). 설계 CHEMI-ARCH-R4B §5.3·§5.4·§6.4 + R4C §5.4·§6.4·§12.1·§12.4
-- + R4D 'F-B12 완료 트랜잭션'. core(20270112000000) 와 기존 함수만 부른다(reward_fn 에 기대지 않는다).
-- 기존 탈퇴 SQL 함수(begin_owned_account_deletion·complete_account_deletion·scrub_account_deletion) 본문은 바꾸지 않는다.
-- 옛 짝(chemi_save_birth·chemi_add_partner·chemi_delete_partner)의 service_role 실행 권한은 이 파일 끝에서 회수한다.

begin;

-- 지문 소금(r4b §5.2). 라우트가 상대 지문(fp: + HMAC-SHA256(소금, 입력) 앞 32자)을 만들 때 읽는다. 없으면 만든다.
create function public.chemi_fp_salt(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare salt bytea;
begin
  perform public.chemi_lock_user(p_user);
  insert into public.chemi_user_state (user_id, fp_salt) values (p_user, extensions.gen_random_bytes(32))
  on conflict (user_id) do update set fp_salt = coalesce(public.chemi_user_state.fp_salt, excluded.fp_salt)
  returning fp_salt into salt;
  return encode(salt, 'hex');
end $$;

-- 생일 저장 v2: 옛 chemi_save_birth 와 같은 규칙(처음 저장은 횟수에 들지 않음, 고치기는 30일에 1번) + 장소 코드·좌표 + 제재 확인.
-- birth_rev 는 트리거가 올린다.
create function public.chemi_save_birth_v2(p_user uuid, p_birth_date date, p_calendar text, p_birth_time time, p_precision text,
  p_gender text, p_birth_place text, p_place_code text, p_lat numeric, p_lon numeric, p_tz text, p_term_side text, p_consent_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur public.chemi_profiles%rowtype; band text; at_time timestamptz := pg_catalog.clock_timestamp(); editable timestamptz;
  place text := nullif(pg_catalog.btrim(p_birth_place), ''); rev bigint;
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
  if (cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender, cur.birth_place, cur.birth_place_code,
      cur.birth_lat, cur.birth_lon, cur.birth_tz, cur.term_side)
    is not distinct from (p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, place, p_place_code, p_lat, p_lon, p_tz, p_term_side) then
    return jsonb_build_object('ageBand', band, 'saved', false, 'edited', false,
      'editableFrom', case when cur.edited_at is not null and cur.edited_at + interval '30 days' > at_time then cur.edited_at + interval '30 days' end,
      'birthRev', cur.birth_rev);
  end if;
  editable := cur.edited_at + interval '30 days';
  if editable is not null and editable > at_time then
    raise exception 'CHEMI_EDIT_LIMIT' using errcode = '42501', detail = editable::text;
  end if;
  update public.chemi_profiles set birth_date = p_birth_date, calendar = p_calendar, birth_time = p_birth_time, time_precision = p_precision,
    gender = p_gender, birth_place = place, birth_place_code = p_place_code, birth_lat = p_lat, birth_lon = p_lon, birth_tz = p_tz,
    term_side = p_term_side, consent_version = p_consent_version, consent_at = at_time, edited_at = at_time, edit_count = edit_count + 1
  where user_id = p_user
  returning birth_rev into rev;
  delete from public.chemi_charts where user_id = p_user;
  return jsonb_build_object('ageBand', band, 'saved', true, 'edited', true, 'editableFrom', at_time + interval '30 days', 'birthRev', rev);
end $$;

-- 궁합 상대 추가 v2: 최대 10명, 만 14세 미만 저장 안 함 + 장소 + 제재 확인.
create function public.chemi_add_partner_v2(p_user uuid, p_nickname text, p_birth_date date, p_calendar text, p_birth_time time,
  p_precision text, p_gender text, p_source text, p_place_code text, p_lat numeric, p_lon numeric, p_tz text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare partner public.chemi_partners%rowtype;
begin
  perform public.chemi_lock_user(p_user);
  perform public.chemi_assert_unrestricted(p_user);
  if p_birth_date is null or p_birth_date > public.dukjil_kst_date() then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  if public.chemi_age_band(p_birth_date, public.dukjil_kst_date()) = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  if (select count(*) from public.chemi_partners where user_id = p_user) >= 10 then raise exception 'CHEMI_PARTNER_FULL' using errcode = '42501'; end if;
  insert into public.chemi_partners (user_id, nickname, birth_date, calendar, birth_time, time_precision, gender, source,
    birth_place_code, birth_lat, birth_lon, birth_tz)
  values (p_user, pg_catalog.btrim(p_nickname), p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, p_source,
    p_place_code, p_lat, p_lon, p_tz)
  returning * into partner;
  return jsonb_build_object('partnerId', partner.id, 'rev', partner.rev);
end $$;

-- 그 상대의 궁합 줄(지문 열쇠와 옛 상대 번호 열쇠)·말투·공유 카드를 지우고 장부는 줄을 남긴 채 참조만 지운다(r4b §5.3·§5.4).
-- 내부 함수: 사용자 잠금을 잡은 호출자만 부른다.
create function public.chemi_erase_partner_rows(p_user uuid, p_partner uuid, p_fp text) returns integer
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; keys text[] := array['compat:' || p_fp, 'friend_today:' || p_fp, 'compat:' || p_partner::text, 'friend_today:' || p_partner::text];
begin
  with gone as (
    delete from public.chemi_readings where user_id = p_user and kind in ('compat','friend_today') and target_key in (p_fp, p_partner::text)
    returning id)
  select coalesce(array_agg(id), '{}') into ids from gone;
  update public.chemi_daily_uses set item_key = 'erased:' || seq::text, reading_id = null
  where user_id = p_user and bucket in ('compat_free','friend_free') and item_key not like 'erased:%'
    and (reading_id = any(ids) or item_key = any(keys) or item_key = any(array(select 'legacy:' || i::text from unnest(ids) i)));
  return pg_catalog.cardinality(ids);
end $$;

-- 상대 고치기 v2(r4c §5.4): 지문이 달라졌을 때만(생일·양음력·시간·성별) 옛 지문 줄을 지우고 compat_first_date 를 비운다.
-- 장소·별명만 바뀌면 아무것도 지우지 않는다. rev 는 트리거가 올린다.
create function public.chemi_update_partner_v2(p_user uuid, p_partner uuid, p_nickname text, p_birth_date date, p_calendar text,
  p_birth_time time, p_precision text, p_gender text, p_place_code text, p_lat numeric, p_lon numeric, p_tz text,
  p_old_fp text, p_new_fp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare partner public.chemi_partners%rowtype; erased integer := 0; changed boolean;
begin
  perform public.chemi_lock_user(p_user);
  perform public.chemi_assert_unrestricted(p_user);
  if p_old_fp is null or p_new_fp is null or p_old_fp !~ '^fp:[0-9a-f]{32}$' or p_new_fp !~ '^fp:[0-9a-f]{32}$'
    or p_birth_date is null or p_birth_date > public.dukjil_kst_date() then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  if public.chemi_age_band(p_birth_date, public.dukjil_kst_date()) = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  perform 1 from public.chemi_partners where id = p_partner and user_id = p_user for update;
  if not found then return jsonb_build_object('updated', false); end if;
  changed := p_old_fp <> p_new_fp;
  if changed then erased := public.chemi_erase_partner_rows(p_user, p_partner, p_old_fp); end if;
  update public.chemi_partners set nickname = pg_catalog.btrim(p_nickname), birth_date = p_birth_date, calendar = p_calendar,
    birth_time = p_birth_time, time_precision = p_precision, gender = p_gender, birth_place_code = p_place_code,
    birth_lat = p_lat, birth_lon = p_lon, birth_tz = p_tz,
    compat_first_date = case when changed then null else compat_first_date end
  where id = p_partner and user_id = p_user
  returning * into partner;
  return jsonb_build_object('updated', true, 'rev', partner.rev, 'erased', erased);
end $$;

-- 상대 지우기 v2(r4b §5.4): 그 지문 줄과 옛 열쇠 줄을 함께 지운다. 지우는 길이라 제재 확인을 하지 않는다.
create function public.chemi_delete_partner_v2(p_user uuid, p_partner uuid, p_fp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chemi_lock_user(p_user);
  if p_fp is null or p_fp !~ '^fp:[0-9a-f]{32}$' then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  perform 1 from public.chemi_partners where id = p_partner and user_id = p_user for update;
  if not found then return jsonb_build_object('deleted', false); end if;
  perform public.chemi_erase_partner_rows(p_user, p_partner, p_fp);
  delete from public.chemi_partners where id = p_partner and user_id = p_user;
  return jsonb_build_object('deleted', true);
end $$;

-- 0시 정리(r4b §5.4 F-B14): purge_after ≤ 오늘 풀이(말투·공유 카드는 FK 로 함께) 삭제 + 장부 참조 지움 + 그제 이전 장부 줄 삭제.
create function public.chemi_purge_ephemeral(p_today date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare today date := coalesce(p_today, public.dukjil_kst_date()); ids uuid[]; n integer;
begin
  with gone as (delete from public.chemi_readings where purge_after is not null and purge_after <= today returning id)
  select coalesce(array_agg(id), '{}') into ids from gone;
  update public.chemi_daily_uses set item_key = 'erased:' || seq::text, reading_id = null
  where reading_id = any(ids) and item_key not like 'erased:%';
  delete from public.chemi_daily_uses where kst_date < today - 1;
  get diagnostics n = row_count;
  return jsonb_build_object('readings', pg_catalog.cardinality(ids), 'dailyUses', n);
end $$;

-- 케미 줄 지우기(같은 서명으로 다시 정의, r4b §6.4 + r4c §6.4).
-- 'birth'(생일 동의 철회): 타로 풀이·질문은 남긴다 · 장부는 줄을 남기고 생일에서 나온 칸의 참조만 지운다 · fp_salt null ·
--   지운 풀이에서 나온 부적 삭제 · 잡힌 이용권은 기존 chemi_release_user_holds 로 푼다.
-- 'account'(탈퇴): 기존 범위 + chemi_daily_uses · chemi_charms · chemi_reports(신고한 쪽) 삭제.
create or replace function public.chemi_erase_user(p_user uuid, p_scope text default 'account') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer; out jsonb := '{}'::jsonb; at_time timestamptz := pg_catalog.clock_timestamp(); ids uuid[];
  fortune_kinds constant text[] := array['daily_reading','saju_first','saju_topic','tarot3'];
  private_keys constant text[] := array['customerName','customerEmail','customerMobilePhone','customerKey','name','email','phone',
    'mobilePhone','accountHolder','depositorName','holderName','ownerName','receiptUrl','checkoutUrl'];
begin
  if p_user is null or p_scope not in ('account','birth') then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  perform public.chemi_lock_user(p_user, false, false);
  perform public.chemi_release_user_holds(p_user);

  if p_scope = 'birth' then
    delete from public.chemi_ask_threads where user_id = p_user and content <> 'tarot'; get diagnostics n = row_count; out := out || jsonb_build_object('askThreads', n);
    with gone as (delete from public.chemi_readings where user_id = p_user and content <> 'tarot' returning id)
    select coalesce(array_agg(id), '{}') into ids from gone;
    out := out || jsonb_build_object('readings', pg_catalog.cardinality(ids));
  else
    delete from public.chemi_ask_threads where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('askThreads', n);
    delete from public.chemi_readings where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('readings', n);
  end if;
  delete from public.chemi_charts where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('charts', n);
  delete from public.chemi_partners where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('partners', n);
  delete from public.chemi_profiles where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('profile', n);

  if p_scope = 'birth' then
    update public.chemi_daily_uses set item_key = 'erased:' || seq::text, reading_id = null
    where user_id = p_user and bucket <> 'open:tarot' and (item_key not like 'erased:%' or reading_id is not null);
    update public.chemi_user_state set fp_salt = null where user_id = p_user and fp_salt is not null;
    delete from public.chemi_charms where user_id = p_user and reading_id = any(ids);
    update public.chemi_chain_records set salt = null,
      status = case when status in ('minted','sent','leased') then 'burn_pending' when status in ('waiting_wallet','pending','retry') then 'void' else status end,
      void_reason = case when status in ('waiting_wallet','pending','retry') then 'consent_withdrawn' else void_reason end,
      updated_at = at_time
    where user_id = p_user and kind = any(fortune_kinds) and status not in ('burned','void','burn_pending');
    get diagnostics n = row_count; out := out || jsonb_build_object('chainRecords', n);
    update public.chemi_chain_records set salt = null, updated_at = at_time where user_id = p_user and kind = any(fortune_kinds) and salt is not null;
    return out;
  end if;

  delete from public.chemi_daily_uses where user_id = p_user;
  delete from public.chemi_charms where user_id = p_user;
  delete from public.chemi_reports where reporter_id = p_user;
  delete from public.chemi_ask_strikes where user_id = p_user;
  delete from public.chemi_pass_ledger where user_id = p_user;
  delete from public.chemi_pass_lots where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('passLots', n);
  delete from public.chemi_entitlements where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('entitlements', n);
  delete from public.chemi_game_weeks where user_id = p_user;
  delete from public.chemi_game_plays where user_id = p_user;
  delete from public.chemi_trial_uses where share_id in (select id from public.chemi_share_cards where user_id = p_user);
  delete from public.chemi_share_cards where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('shareCards', n);
  delete from public.chemi_share_rewards where user_id = p_user;
  delete from public.chemi_remind_requests where user_id = p_user;
  delete from public.chemi_birth_shares where user_low = p_user or user_high = p_user;
  delete from public.chemi_point_grants where user_id = p_user;
  delete from public.chemi_day_stamps where user_id = p_user;
  delete from public.chemi_exp_log where user_id = p_user;
  delete from public.chemi_minis where user_id = p_user;
  delete from public.chemi_week_boxes where user_id = p_user;
  delete from public.chemi_items where user_id = p_user;
  delete from public.chemi_rooms where user_id = p_user;
  delete from public.chemi_album where user_id = p_user;
  delete from public.chemi_titles where user_id = p_user;
  delete from public.chemi_snacks where giver_id = p_user or receiver_id = p_user;
  delete from public.chemi_user_state where user_id = p_user;

  delete from public.chemi_mail_outbox where user_id = p_user and status <> 'sent';
  update public.chemi_mail_outbox set user_id = null, to_hash = null, payload = '{}'::jsonb where user_id = p_user;

  update public.chemi_chain_records set user_id = null, wallet_address = null, salt = null, record_key = 'erased:' || id::text,
    status = case when status in ('minted','sent','leased') then 'burn_pending' when status in ('waiting_wallet','pending','retry') then 'void' else status end,
    void_reason = case when status in ('waiting_wallet','pending','retry') then 'account_erased' else void_reason end,
    updated_at = at_time
  where user_id = p_user;
  get diagnostics n = row_count; out := out || jsonb_build_object('chainRecords', n);

  update public.chemi_orders set target = '{}'::jsonb, draft_ask_id = null
    where user_id = p_user and (target <> '{}'::jsonb or draft_ask_id is not null);
  update public.chemi_payment_events e set payload = public.chemi_jsonb_strip_keys(e.payload, private_keys)
    from public.chemi_orders o where o.id = e.order_id and o.user_id = p_user
      and e.payload is distinct from public.chemi_jsonb_strip_keys(e.payload, private_keys);
  return out;
end $$;

-- 탈퇴 마무리 감싸개(R4D F-B12). 같은 RPC 트랜잭션에서 기존 complete 가 provider·lease·저장소 준비를 판정한다.
-- 기존 complete 가 true 일 때만 케미 줄을 지운다(true 시점에도 app_users 행과 번호가 남아 있다). false 면 아무것도 지우지 않는다.
-- 지우기 예외는 잡지 않고 호출자까지 올린다 → 완료 영수증·묘비·기존 scrub 까지 같은 트랜잭션으로 롤백되고 요청은 pending 으로 남는다.
-- 탭 플래그(CHEMI_TAB·feature:*)는 읽지 않는다.
create or replace function public.chemi_complete_account_deletion(p_app_user_id uuid, p_lease_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare subject text; blocker uuid;
begin
  if p_app_user_id is null then return false; end if;
  select provider_subject into subject from public.account_deletion_requests where app_user_id = p_app_user_id;
  if subject is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:' || encode(extensions.digest(subject, 'sha256'), 'hex'), 0));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || p_app_user_id::text, 0));
  if not exists (select 1 from public.app_users where id = p_app_user_id and status = 'disabled')
    or not exists (select 1 from public.account_deletion_requests where app_user_id = p_app_user_id and status = 'pending') then
    return false;
  end if;
  blocker := public.chemi_deletion_blocker(p_app_user_id);
  if blocker is not null then raise exception 'CHEMI_DELETION_BLOCKED' using errcode = 'P0001', detail = blocker::text; end if;
  if public.complete_account_deletion(p_app_user_id, p_lease_token) is not true then
    return false;
  end if;
  perform public.chemi_erase_user(p_app_user_id, 'account');
  return true;
end $$;

revoke all on function public.chemi_fp_salt(uuid),
  public.chemi_save_birth_v2(uuid, date, text, time, text, text, text, text, numeric, numeric, text, text, text),
  public.chemi_add_partner_v2(uuid, text, date, text, time, text, text, text, text, numeric, numeric, text),
  public.chemi_erase_partner_rows(uuid, uuid, text),
  public.chemi_update_partner_v2(uuid, uuid, text, date, text, time, text, text, text, numeric, numeric, text, text, text),
  public.chemi_delete_partner_v2(uuid, uuid, text), public.chemi_purge_ephemeral(date)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_fp_salt(uuid),
  public.chemi_save_birth_v2(uuid, date, text, time, text, text, text, text, numeric, numeric, text, text, text),
  public.chemi_add_partner_v2(uuid, text, date, text, time, text, text, text, text, numeric, numeric, text),
  public.chemi_update_partner_v2(uuid, uuid, text, date, text, time, text, text, text, numeric, numeric, text, text, text),
  public.chemi_delete_partner_v2(uuid, uuid, text), public.chemi_purge_ephemeral(date)
  to service_role;

-- F-B15 · r4c §12.4: 옛 프로필 RPC 의 service_role 실행 권한을 이름으로 모든 오버로드에서 회수한다.
-- 이 커밋 뒤 옛 웹 인스턴스의 호출은 42501 이다. 권한을 다시 주는 migration 은 금지(m1_closure.sql 이 단언).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('chemi_save_birth','chemi_add_partner','chemi_delete_partner') loop
    execute format('revoke execute on function %s from service_role', f);
  end loop;
end $$;

commit;
