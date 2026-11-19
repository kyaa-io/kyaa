-- 케미 탭 M1 (W1-DB) · 묶음 사이 계약 함수의 실제 구현(설계 arch-chemi r3 §5.2a, 교차 검토 R7).
-- 뒤 묶음은 이 함수들을 다시 정의하지 않고 부르기만 한다. 바꿀 일이 생기면 감독에게 보고 → §5.2a 표 → 새 번호 파일.
-- 기존 객체는 읽기만 한다(app_users·user_wallets·group_wallet_lock 정의). 시드 0.

-- §5.1 4: 지갑에 쓰는 케미 함수는 group_wallet_lock 과 같은 열쇠·순서로 잠근다.
-- group_wallet_lock 을 그대로 부르지 않는 이유는 지갑이 닫혀 있을 때 예외를 던지기 때문이다(풀이는 저장돼야 함, §5.2).
-- 열쇠 문자열을 베꼈으므로 지금 정의에 두 열쇠가 그대로 있는지 확인하고, 없으면 적용을 멈춘다.
do $$
declare def text := pg_catalog.pg_get_functiondef('public.group_wallet_lock(uuid,boolean)'::pg_catalog.regprocedure);
begin
  if position('group-wallet:campaign-barrier' in def) = 0 or position('group-wallet:owner:' in def) = 0
    or position('pg_advisory_xact_lock_shared' in def) = 0 or position('fan_web_lock_active_user' in def) = 0 then
    raise exception 'CHEMI_WALLET_LOCK_CONTRACT_CHANGED';
  end if;
end $$;

-- 사용자 잠금(§5.1 2·4). 순서: [지갑] campaign-barrier(공유) → group-wallet:owner → fan-web-user.
-- fan-web-user 는 기존 탈퇴(begin·claim·complete)와 같은 열쇠라 결제와 탈퇴가 한 줄로 선다.
-- 이용 제한(app_user_moderation_restrictions)은 보지 않는다 — 감독 결정 D5 전 기본값.
create function public.chemi_lock_user(p_user uuid, p_wallet boolean default false, p_require_active boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  if p_wallet then
    perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || p_user::text, 0));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || p_user::text, 0));
  if p_require_active and not exists (select 1 from public.app_users where id = p_user and status = 'active') then
    raise exception 'CHEMI_ACCOUNT_CLOSED' using errcode = '42501';
  end if;
end $$;

-- 묶음 경계 스위치. scope='feature' 는 줄이 없으면 off(본문에 고정, 기능마다 다른 기본값을 두지 않는다).
create function public.chemi_feature_state(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.state from public.chemi_switches s where s.scope = 'feature' and s.key = p_key), 'off')
$$;

-- 환경마다 운영 값으로 부른다(§9.2·D9). migration 에서 부르지 않는다.
create function public.chemi_switch_set(p_scope text, p_key text, p_state text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row public.chemi_switches%rowtype;
begin
  insert into public.chemi_switches (scope, key, state, updated_at)
  values (p_scope, p_key, p_state, pg_catalog.clock_timestamp())
  on conflict (scope, key) do update set state = excluded.state, updated_at = excluded.updated_at
  returning * into row;
  return jsonb_build_object('scope', row.scope, 'key', row.key, 'state', row.state, 'updatedAt', row.updated_at);
end $$;

-- 이용권 묶음 1줄 + 내역 grant 1줄을 적립한다. 같은 grant_key 는 한 번만(이미 있으면 아무것도 바꾸지 않음).
-- weekly_free·share 는 쌓이지 않는다: 닫히지 않은 옛 묶음(잡혀 있어 remaining 0 인 것 포함)을 replace 로 닫고
-- 남은 수를 버린다. held 는 그대로 두어 진행 중인 질문이 confirm·release 로 끝나게 한다(§5.3c).
create function public.chemi_pass_grant(p_user uuid, p_pass_kind text, p_bucket text, p_grant_key text, p_qty integer,
  p_expires_at timestamptz, p_order_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare existing public.chemi_pass_lots%rowtype; old public.chemi_pass_lots%rowtype; lot uuid; at_time timestamptz := pg_catalog.clock_timestamp();
begin
  if p_grant_key is null or p_qty is null or p_qty <= 0 then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  perform public.chemi_lock_user(p_user, false, false);
  select * into existing from public.chemi_pass_lots where grant_key = p_grant_key;
  if found then
    if existing.user_id <> p_user or existing.pass_kind <> p_pass_kind or existing.bucket <> p_bucket then
      raise exception 'CHEMI_REQUEST_KEY_REUSED' using errcode = '23505';
    end if;
    return jsonb_build_object('lotId', existing.id, 'granted', false);
  end if;
  if p_bucket in ('weekly_free', 'share') then
    select * into old from public.chemi_pass_lots
      where user_id = p_user and pass_kind = p_pass_kind and bucket = p_bucket and closed_at is null for update;
    if found then
      update public.chemi_pass_lots set closed_at = at_time, closed_reason = 'replace', remaining = 0 where id = old.id;
      insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
      values (p_user, old.id, old.pass_kind, 'replace', -old.remaining, 'lot', old.id::text, at_time);
    end if;
  end if;
  insert into public.chemi_pass_lots (user_id, pass_kind, bucket, grant_key, qty, remaining, held, expires_at, order_id, granted_at)
  values (p_user, p_pass_kind, p_bucket, p_grant_key, p_qty, p_qty, 0, p_expires_at, p_order_id, at_time)
  returning id into lot;
  insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
  values (p_user, lot, p_pass_kind, 'grant', p_qty, 'grant', p_grant_key, at_time);
  return jsonb_build_object('lotId', lot, 'granted', true);
end $$;

-- 처음 무료 질문 3개(기한 없음, 12-1·11-3). 이용권을 읽거나 쓸 때 부른다. 가입 트리거를 달지 않는다.
create function public.chemi_pass_ensure_initial(p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public.chemi_pass_grant(p_user, 'ask', 'initial_free', 'initial:' || p_user::text || ':ask', 3, null)
$$;

-- 기록 예약(§7.2 1). 허용 목록 검사(chemi_chain_payload_check, …085000 생성물)를 통과한 것만 넣는다.
-- p_kst_date: 그 기록의 한국 날짜(검사가 payload 의 날짜·주차를 이것과 맞춘다). 생략하면 오늘(한국).
--   그날 바로 만드는 기록은 생략해도 되고, 게임 그날 최고처럼 다음 날 넣는 기록은 그 날짜를 넘긴다.
-- p_salt: 결과문 해시에 섞은 32바이트(그 해시를 payload 에 실을 때만). DB 밖으로 내보내지 않는다.
-- 지갑이 없으면 waiting_wallet. 계정의 발급 주소를 고르는 일은 W1-CHAIN 이 한다.
create function public.chemi_chain_enqueue(p_kind text, p_record_key text, p_user uuid, p_payload jsonb, p_eligible_at timestamptz,
  p_kst_date date default null, p_salt bytea default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare day date := coalesce(p_kst_date, public.dukjil_kst_date()); record uuid;
begin
  if p_record_key is null or p_record_key like 'erased:%' or p_eligible_at is null
    or (p_user is null) <> (p_kind = 'rank_table') then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  perform public.chemi_chain_payload_check(p_kind, p_payload, day);
  insert into public.chemi_chain_records (record_key, user_id, kind, kst_date, payload, salt, eligible_at, status)
  values (p_record_key, p_user, p_kind, day, p_payload, p_salt, p_eligible_at,
    case when p_user is null or exists (select 1 from public.user_wallets w where w.app_user_id = p_user) then 'pending' else 'waiting_wallet' end)
  on conflict (record_key) do nothing
  returning id into record;
  if record is not null then return jsonb_build_object('recordId', record, 'queued', true); end if;
  select id into record from public.chemi_chain_records where record_key = p_record_key;
  return jsonb_build_object('recordId', record, 'queued', false);
end $$;

-- 메일 발송함에 넣는다. 보내는 작업(W1-MAIL)이 없는 동안은 pending 으로 남는다.
-- 받는 주소는 보낼 때 정한다(W1-MAIL [확인 필요]). 여기서는 to_hash 를 채우지 않는다.
create function public.chemi_mail_enqueue(p_user uuid, p_kind text, p_category text, p_dedupe_key text, p_payload jsonb,
  p_send_after timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mail uuid;
begin
  if p_dedupe_key is null then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  insert into public.chemi_mail_outbox (user_id, kind, category, dedupe_key, payload, send_after)
  values (p_user, p_kind, p_category, p_dedupe_key, coalesce(p_payload, '{}'::jsonb), coalesce(p_send_after, pg_catalog.clock_timestamp()))
  on conflict (dedupe_key) do nothing
  returning id into mail;
  if mail is not null then return jsonb_build_object('mailId', mail, 'queued', true); end if;
  select id into mail from public.chemi_mail_outbox where dedupe_key = p_dedupe_key;
  return jsonb_build_object('mailId', mail, 'queued', false);
end $$;

revoke all on function public.chemi_lock_user(uuid, boolean, boolean), public.chemi_feature_state(text),
  public.chemi_switch_set(text, text, text),
  public.chemi_pass_grant(uuid, text, text, text, integer, timestamptz, uuid), public.chemi_pass_ensure_initial(uuid),
  public.chemi_chain_enqueue(text, text, uuid, jsonb, timestamptz, date, bytea),
  public.chemi_mail_enqueue(uuid, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
-- 웹은 묶음 스위치를 이 함수로 읽는다(§9.2).
grant execute on function public.chemi_feature_state(text) to service_role;
