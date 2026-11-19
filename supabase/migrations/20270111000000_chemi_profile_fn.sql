-- 케미 탭 M1 (W1-DB) · 생일 저장·나이 판정·궁합 상대·지우기·탈퇴 감싸개(설계 arch-chemi r3 §6.7, 교차 검토 R9 · r3 N1·N4).
-- 기존 탈퇴 함수(begin_owned_account_deletion·scrub_account_deletion·complete_account_deletion)의 본문은 바꾸지 않는다.
-- 새 감싸개 2개가 같은 트랜잭션에서 기존 함수를 부른다. 웹이 감싸개를 부르게 하는 account-deletion.ts 변경은
-- 감독 결정 D2 승인 뒤에 따로 낸다(이 파일만으로는 운영 탈퇴 경로가 바뀌지 않는다).
-- 탈퇴·지우기는 CHEMI_TAB·feature:* 스위치를 보지 않는다(r3).

-- 만 나이(한국 날짜). 만 19세 생일 0시(한국)부터 성인, 만 14세 미만은 저장하지 않는다(§6.5).
create function public.chemi_age_band(p_birth date, p_today date) returns text
language sql immutable set search_path = '' as $$
  select case when p_birth is null or p_today is null then null
    when extract(year from pg_catalog.age(p_today::timestamp, p_birth::timestamp)) < 14 then 'under14'
    when extract(year from pg_catalog.age(p_today::timestamp, p_birth::timestamp)) < 19 then 'minor'
    else 'adult' end
$$;

-- 생일 저장. 처음 저장은 횟수에 들지 않고, 고치기는 30일에 1번(12-2 D1·common 03). 고치면 저장된 차트를 지워 다시 계산하게 한다.
create function public.chemi_save_birth(p_user uuid, p_birth_date date, p_calendar text, p_birth_time time, p_precision text,
  p_gender text, p_birth_place text, p_consent_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur public.chemi_profiles%rowtype; band text; at_time timestamptz := pg_catalog.clock_timestamp(); editable timestamptz;
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
    values (p_user, p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, nullif(btrim(p_birth_place), ''), p_consent_version, at_time, at_time);
    return jsonb_build_object('ageBand', band, 'saved', true, 'edited', false, 'editableFrom', null);
  end if;
  if (cur.birth_date, cur.calendar, cur.birth_time, cur.time_precision, cur.gender, cur.birth_place)
    is not distinct from (p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, nullif(btrim(p_birth_place), '')) then
    return jsonb_build_object('ageBand', band, 'saved', false, 'edited', false,
      'editableFrom', case when cur.edited_at is not null and cur.edited_at + interval '30 days' > at_time then cur.edited_at + interval '30 days' end);
  end if;
  editable := cur.edited_at + interval '30 days';
  if editable is not null and editable > at_time then
    raise exception 'CHEMI_EDIT_LIMIT' using errcode = '42501', detail = editable::text;
  end if;
  update public.chemi_profiles set birth_date = p_birth_date, calendar = p_calendar, birth_time = p_birth_time, time_precision = p_precision,
    gender = p_gender, birth_place = nullif(btrim(p_birth_place), ''), consent_version = p_consent_version, consent_at = at_time,
    edited_at = at_time, edit_count = edit_count + 1
  where user_id = p_user;
  delete from public.chemi_charts where user_id = p_user;
  return jsonb_build_object('ageBand', band, 'saved', true, 'edited', true, 'editableFrom', at_time + interval '30 days');
end $$;

create function public.chemi_read_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'birth', (select jsonb_build_object('birthDate', p.birth_date, 'calendar', p.calendar, 'birthTime', to_char(p.birth_time, 'HH24:MI'),
        'timePrecision', p.time_precision, 'gender', p.gender, 'birthPlace', p.birth_place,
        'ageBand', public.chemi_age_band(p.birth_date, public.dukjil_kst_date()),
        'editableFrom', case when p.edited_at is not null and p.edited_at + interval '30 days' > pg_catalog.clock_timestamp() then p.edited_at + interval '30 days' end)
      from public.chemi_profiles p where p.user_id = p_user),
    'consent', (select jsonb_build_object('version', p.consent_version, 'at', p.consent_at) from public.chemi_profiles p where p.user_id = p_user),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nickname', x.nickname, 'birthDate', x.birth_date, 'calendar', x.calendar,
        'birthTime', to_char(x.birth_time, 'HH24:MI'), 'timePrecision', x.time_precision, 'gender', x.gender, 'source', x.source,
        'lastUsedAt', x.last_used_at) order by x.created_at, x.id)
      from public.chemi_partners x where x.user_id = p_user), '[]'::jsonb),
    'partnerLimit', 10)
$$;

-- 궁합 상대: 최대 10명(D3), 만 14세 미만 상대는 저장하지 않는다.
create function public.chemi_add_partner(p_user uuid, p_nickname text, p_birth_date date, p_calendar text, p_birth_time time,
  p_precision text, p_gender text, p_source text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare partner uuid;
begin
  perform public.chemi_lock_user(p_user);
  if p_birth_date is null or p_birth_date > public.dukjil_kst_date() then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  if public.chemi_age_band(p_birth_date, public.dukjil_kst_date()) = 'under14' then raise exception 'CHEMI_UNDER_14' using errcode = '42501'; end if;
  if (select count(*) from public.chemi_partners where user_id = p_user) >= 10 then raise exception 'CHEMI_PARTNER_FULL' using errcode = '42501'; end if;
  insert into public.chemi_partners (user_id, nickname, birth_date, calendar, birth_time, time_precision, gender, source)
  values (p_user, btrim(p_nickname), p_birth_date, p_calendar, p_birth_time, p_precision, p_gender, p_source)
  returning id into partner;
  return jsonb_build_object('partnerId', partner);
end $$;

create function public.chemi_delete_partner(p_user uuid, p_partner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chemi_lock_user(p_user);
  delete from public.chemi_partners where id = p_partner and user_id = p_user;
  return jsonb_build_object('deleted', found);
end $$;

-- 1년 동안 쓰지 않은 궁합 상대 지우기(유지 작업이 하루 1번 부른다).
create function public.chemi_purge_stale_partners(p_now timestamptz default pg_catalog.clock_timestamp()) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.chemi_partners where last_used_at < p_now - interval '1 year';
  get diagnostics n = row_count;
  return n;
end $$;

-- jsonb 안의 이름·연락처 키를 깊이와 상관없이 지운다(탈퇴 때 보관 표의 결제사 응답에서 개인정보만 빼기, §6.7).
create function public.chemi_jsonb_strip_keys(p_value jsonb, p_keys text[]) returns jsonb
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_value)
    when 'object' then coalesce((select jsonb_object_agg(e.key, public.chemi_jsonb_strip_keys(e.value, p_keys))
      from jsonb_each(p_value) e where not (e.key = any(p_keys))), '{}'::jsonb)
    when 'array' then coalesce((select jsonb_agg(public.chemi_jsonb_strip_keys(a.value, p_keys) order by a.ord)
      from jsonb_array_elements(p_value) with ordinality a(value, ord)), '[]'::jsonb)
    else p_value end
$$;

-- 탈퇴를 막는 주문: 결제 확인·취소·환불이 진행 중이거나 운영 확인 중(manual_review, r3 N4).
create function public.chemi_deletion_blocker(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.chemi_orders where user_id = p_user and status in ('confirming','cancel_pending','refund_requested','manual_review')
  order by created_at, id limit 1
$$;

-- 잡혀 있는 질문 이용권을 release 로 끝낸다(§5.3c). 묶음이 살아 있으면 remaining 으로 돌려주고,
-- 닫혔거나 만료됐으면 release +1 · lapse −1 두 줄(합 0). 세대마다 use·release 는 하나뿐이다(내역 부분 unique).
create function public.chemi_release_user_holds(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.chemi_ask_threads%rowtype; lot public.chemi_pass_lots%rowtype; ref text; at_time timestamptz := pg_catalog.clock_timestamp(); n integer := 0;
begin
  for t in select * from public.chemi_ask_threads where user_id = p_user and status = 'held' order by id for update loop
    ref := t.id::text || '#' || t.hold_gen::text;
    select * into lot from public.chemi_pass_lots where id = t.hold_lot_id for update;
    if lot.closed_at is null and (lot.expires_at is null or lot.expires_at > at_time) then
      update public.chemi_pass_lots set held = held - 1, remaining = remaining + 1 where id = lot.id;
      insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
      values (p_user, lot.id, lot.pass_kind, 'release', 1, 'ask', ref, at_time);
    else
      update public.chemi_pass_lots set held = held - 1 where id = lot.id;
      insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
      values (p_user, lot.id, lot.pass_kind, 'release', 1, 'ask', ref, at_time),
             (p_user, lot.id, lot.pass_kind, 'lapse', -1, 'ask', ref, at_time);
    end if;
    update public.chemi_ask_threads set status = 'failed', hold_token = null, hold_expires_at = null, updated_at = at_time where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 케미 줄 지우기. p_scope='account'(탈퇴) | 'birth'(생일 동의 철회: 프로필·차트·상대·풀이·말투·질문과 운세류 기록만).
-- 보관 표(K)는 5년 남기되 내용(주문 target·초안 질문·결제사 응답의 이름·연락처)을 비운다.
-- 기록 대기열은 사용자 번호·주소·salt 를 지우고 record_key 를 'erased:{id}' 로 바꾼다. 발급됐거나 발급 중이던 기록은
-- burn_pending(소각은 기록 번호만으로 한다), 아직 보내지 않은 기록은 void 로 닫는다. 여러 번 불러도 결과가 같다.
create function public.chemi_erase_user(p_user uuid, p_scope text default 'account') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer; out jsonb := '{}'::jsonb; at_time timestamptz := pg_catalog.clock_timestamp();
  fortune_kinds constant text[] := array['daily_reading','saju_first','saju_topic','tarot3'];
  private_keys constant text[] := array['customerName','customerEmail','customerMobilePhone','customerKey','name','email','phone',
    'mobilePhone','accountHolder','depositorName','holderName','ownerName','receiptUrl','checkoutUrl'];
begin
  if p_user is null or p_scope not in ('account','birth') then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  perform public.chemi_lock_user(p_user, false, false);
  perform public.chemi_release_user_holds(p_user);

  delete from public.chemi_ask_threads where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('askThreads', n);
  delete from public.chemi_readings where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('readings', n);
  delete from public.chemi_charts where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('charts', n);
  delete from public.chemi_partners where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('partners', n);
  delete from public.chemi_profiles where user_id = p_user; get diagnostics n = row_count; out := out || jsonb_build_object('profile', n);

  if p_scope = 'birth' then
    update public.chemi_chain_records set salt = null,
      status = case when status in ('minted','sent','leased') then 'burn_pending' when status in ('waiting_wallet','pending','retry') then 'void' else status end,
      void_reason = case when status in ('waiting_wallet','pending','retry') then 'consent_withdrawn' else void_reason end,
      updated_at = at_time
    where user_id = p_user and kind = any(fortune_kinds) and status not in ('burned','void','burn_pending');
    get diagnostics n = row_count; out := out || jsonb_build_object('chainRecords', n);
    update public.chemi_chain_records set salt = null, updated_at = at_time where user_id = p_user and kind = any(fortune_kinds) and salt is not null;
    return out;
  end if;

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

-- 생일 동의 철회(DELETE /profile/birth). feature:* 를 보지 않는다.
create function public.chemi_withdraw_birth_consent(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chemi_lock_user(p_user);
  return public.chemi_erase_user(p_user, 'birth');
end $$;

-- 탈퇴 시작 감싸개 → 기존 begin_owned_account_deletion 과 같은 jsonb.
-- 잠금 순서는 기존 begin 과 같다: runmusic_campaign 행(20261129040000 의 begin 이 맨 먼저 잡음) → 메일 subject → privy subject → 사용자.
-- 막는 주문 검사(④)와 계정 비활성화(⑥)가 한 트랜잭션이라 그 사이에 결제가 confirming 으로 들어올 수 없다.
create function public.chemi_begin_account_deletion(p_privy_user_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare subject text := p_privy_user_id; privy text; email_id uuid; owner uuid; blocker uuid;
begin
  perform 1 from public.runmusic_campaign for update;
  if subject is null or subject <> pg_catalog.btrim(subject) or length(subject) not between 10 and 240 then
    return public.begin_owned_account_deletion(p_privy_user_id);
  end if;
  if subject like 'supabase-email:%' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:' || encode(extensions.digest(subject, 'sha256'), 'hex'), 0));
    if exists (select 1 from public.account_subject_tombstones where subject_hash = encode(extensions.digest(subject, 'sha256'), 'hex')) then
      return public.begin_owned_account_deletion(p_privy_user_id);
    end if;
    begin
      email_id := substring(subject from 16)::uuid;
    exception when invalid_text_representation then
      return public.begin_owned_account_deletion(p_privy_user_id);
    end;
    select u.privy_user_id into privy from public.mobile_email_login_bindings b join public.app_users u on u.id = b.app_user_id
      where b.supabase_user_id = email_id;
    if privy is null then return public.begin_owned_account_deletion(p_privy_user_id); end if;
  else
    privy := subject;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-subject:' || encode(extensions.digest(privy, 'sha256'), 'hex'), 0));
  select id into owner from public.app_users where privy_user_id = privy;
  if owner is null then return public.begin_owned_account_deletion(p_privy_user_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || owner::text, 0));
  -- 이미 탈퇴가 시작된 계정·묘비가 있는 주체는 기존 함수가 지금 상태를 돌려준다.
  if exists (select 1 from public.account_subject_tombstones where subject_hash = encode(extensions.digest(privy, 'sha256'), 'hex'))
    or not exists (select 1 from public.app_users where id = owner and status = 'active') then
    return public.begin_owned_account_deletion(p_privy_user_id);
  end if;
  blocker := public.chemi_deletion_blocker(owner);
  if blocker is not null then raise exception 'CHEMI_DELETION_BLOCKED' using errcode = 'P0001', detail = blocker::text; end if;
  update public.chemi_orders set status = 'abandoned' where user_id = owner and status = 'created';
  perform public.chemi_release_user_holds(owner);
  return public.begin_owned_account_deletion(p_privy_user_id);
end $$;

-- 탈퇴 마무리 감싸개 → 기존 complete_account_deletion 과 같은 boolean.
-- 계정이 disabled 이고 탈퇴 요청이 pending 일 때만 지운다(살아 있는 계정에 잘못 불러도 지워지지 않는다).
-- 케미 지우기가 실패하면 기존 complete 도 함께 취소돼 '완료'로 바뀌지 않는다. 기존 complete 가 false 여도 지운 것은 커밋된다.
create function public.chemi_complete_account_deletion(p_app_user_id uuid, p_lease_token uuid) returns boolean
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
  perform public.chemi_erase_user(p_app_user_id, 'account');
  return public.complete_account_deletion(p_app_user_id, p_lease_token);
end $$;

revoke all on function public.chemi_age_band(date, date),
  public.chemi_save_birth(uuid, date, text, time, text, text, text, text), public.chemi_read_profile(uuid),
  public.chemi_add_partner(uuid, text, date, text, time, text, text, text), public.chemi_delete_partner(uuid, uuid),
  public.chemi_purge_stale_partners(timestamptz), public.chemi_jsonb_strip_keys(jsonb, text[]), public.chemi_deletion_blocker(uuid),
  public.chemi_release_user_holds(uuid), public.chemi_erase_user(uuid, text), public.chemi_withdraw_birth_consent(uuid),
  public.chemi_begin_account_deletion(text), public.chemi_complete_account_deletion(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_save_birth(uuid, date, text, time, text, text, text, text), public.chemi_read_profile(uuid),
  public.chemi_add_partner(uuid, text, date, text, time, text, text, text), public.chemi_delete_partner(uuid, uuid),
  public.chemi_purge_stale_partners(timestamptz), public.chemi_withdraw_birth_consent(uuid),
  public.chemi_begin_account_deletion(text), public.chemi_complete_account_deletion(uuid, uuid)
  to service_role;
