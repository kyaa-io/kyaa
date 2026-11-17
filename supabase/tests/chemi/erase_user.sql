-- 케미 M1 · 탈퇴 지우기 시험(설계 arch-chemi r3 §6.7 ①~⑤ · ⑪ · ⑫ · ⑬). 일회용 DB 에서만, 끝에 되돌린다.
-- 동시 실행 경우(⑥ · ⑦ · ⑩)는 deletion_race.sh 가 본다.
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected:%', expected;
exception when others then if sqlerrm = 'expected:' || expected or sqlerrm <> expected then raise; end if; end $$;

-- 사용자 번호 열을 가진 chemi_* 표(카탈로그에서 찾는다 — 표가 늘어도 빠뜨리면 시험이 깨진다)
create function pg_temp.user_tables() returns table (tbl text, col text) language sql as $$
  select c.relname::text, a.attname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'chemi\_%' and a.atttypid = 'uuid'::regtype
    and a.attname in ('user_id','user_low','user_high','giver_id','receiver_id')
$$;
create function pg_temp.rows_of(p_user uuid, p_keep text[]) returns jsonb language plpgsql as $$
declare t record; n bigint; out jsonb := '{}';
begin
  for t in select * from pg_temp.user_tables() where not (tbl = any(p_keep)) loop
    execute format('select count(*) from public.%I where %I = $1', t.tbl, t.col) into n using p_user;
    if n > 0 then out := out || jsonb_build_object(t.tbl || '.' || t.col, n); end if;
  end loop;
  return out;
end $$;

-- 모든 케미 표에 그 사용자의 줄을 넣는다.
create function pg_temp.fill(u uuid, friend uuid) returns void language plpgsql as $$
declare r uuid := extensions.gen_random_uuid(); o uuid := extensions.gen_random_uuid(); lot uuid := extensions.gen_random_uuid();
  play uuid := extensions.gen_random_uuid(); card text := 'c' || substr(replace(u::text, '-', ''), 1, 10); d date := public.dukjil_kst_date();
  wk date := public.dukjil_kst_date() - (extract(isodow from public.dukjil_kst_date())::integer - 1);
begin
  insert into public.chemi_user_state (user_id, last_character) values (u, 'changha');
  insert into public.chemi_profiles (user_id, birth_date, calendar, birth_time, time_precision, gender, birth_place, consent_version, consent_at)
    values (u, '1995-05-05', 'solar', '14:30', 'exact', 'female', '서울', 'v1', now());
  insert into public.chemi_charts (user_id, kind, chart, engine_version) values (u, 'saju', '{"pillars":1}', 'e1');
  insert into public.chemi_partners (user_id, nickname, birth_date, calendar, time_precision, source) values (u, '민지', '1997-03-12', 'solar', 'unknown', 'saju');
  insert into public.chemi_readings (id, user_id, content, kind, character, kst_date, result, engine_version, table_version)
    values (r, u, 'fortune', 'daily', 'changha', d, '{"score":54}', 'e1', 't1');
  insert into public.chemi_reading_styles (reading_id, character, locale, text, source) values (r, 'changha', 'ko', '"말"', 'table');
  insert into public.chemi_point_grants (user_id, character, kst_date, status, reading_id) values (u, 'changha', d, 'pending_wallet', r);
  insert into public.chemi_day_stamps (user_id, kst_date, first_content) values (u, d, 'fortune');
  insert into public.chemi_exp_log (user_id, character, source, kst_date, exp) values (u, 'changha', 'fortune', d, 10);
  insert into public.chemi_minis (user_id, character, exp_total) values (u, 'changha', 10);
  insert into public.chemi_week_boxes (user_id, week_start, achieved_at) values (u, wk, now());
  insert into public.chemi_items (user_id, item_code) values (u, 'sofa-1');
  insert into public.chemi_rooms (user_id, character) values (u, 'changha');
  insert into public.chemi_album (user_id, character, slot) values (u, 'changha', 1);
  insert into public.chemi_titles (user_id, title_code) values (u, 'early-bird');
  insert into public.chemi_snacks (giver_id, receiver_id, character, kst_date) values (u, friend, 'changha', d), (friend, u, 'elina', d) on conflict do nothing;
  insert into public.chemi_share_rewards (user_id, kind, key) values (u, 'week_pass', wk::text);
  insert into public.chemi_orders (id, order_no, user_id, product_code, target, amount_krw, status, limit_month, payment_key, draft_ask_id, paid_at)
    values (o, 'C-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0'), u, 'fortune_date', jsonb_build_object('date', '1995-05-05', 'partner', '민지'),
      490, 'paid', date_trunc('month', now())::date, 'pk_' || u, extensions.gen_random_uuid(), now());
  insert into public.chemi_payment_events (order_id, source, event_key, disposition, payload)
    values (o, 'confirm', 'ev:' || u, 'applied', jsonb_build_object('orderId', 'x', 'customerName', '홍길동', 'card', jsonb_build_object('ownerName', '홍길동', 'issuer', 'A'),
      'easyPay', jsonb_build_array(jsonb_build_object('customerMobilePhone', '01012345678', 'provider', 'toss'))));
  insert into public.chemi_payment_txns (order_id, kind, provider_txn_key, provider_order_id, payment_key, amount_krw, currency, provider_status, occurred_at)
    values (o, 'approve', 'tx:' || u, 'x', 'pk_' || u, 490, 'KRW', 'DONE', now());
  insert into public.chemi_pay_eligibility (user_id, birth_date, basis) values (u, '1995-05-05', 'self');
  insert into public.chemi_entitlements (user_id, kind, target_key, order_id) values (u, 'fortune_date', '2027-01-13', o);
  insert into public.chemi_first_purchase (user_id, order_id) values (u, o);
  insert into public.chemi_guardian_consents (user_id, relation, verified_at, provider, proof_hash) values (u, 'parent', now(), 'mock', repeat('a', 64));
  perform public.chemi_pass_ensure_initial(u);
  select id into lot from public.chemi_pass_lots where user_id = u and bucket = 'initial_free';
  -- 잡혀 있는 질문 1개(지우기 전에 정리돼야 한다)
  update public.chemi_pass_lots set remaining = remaining - 1, held = held + 1 where id = lot;
  insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id) values (u, lot, 'ask', 'hold', -1, 'ask', r || '#1');
  insert into public.chemi_ask_threads (id, user_id, character, content, reading_id, question, request_hash, status, hold_gen, hold_token, hold_lot_id, hold_expires_at)
    values (r, u, 'changha', 'fortune', r, '내 생일 1995-05-05 인데', repeat('1', 64), 'held', 1, extensions.gen_random_uuid(), lot, now() + interval '10 minutes');
  insert into public.chemi_ask_strikes (user_id, kind, kst_date, count) values (u, 'abuse', d, 1);
  insert into public.chemi_game_plays (id, user_id, game, character, map, kst_date, slot_kind, slot_no, request_key, request_hash, seed)
    values (play, u, 'run', 'changha', 'changha', d, 'free', 1, extensions.gen_random_uuid(), repeat('2', 64), 7);
  insert into public.chemi_game_weeks (week_start, game, user_id, best_play_id, best_score) values (wk, 'run', u, play, 10);
  insert into public.chemi_share_cards (id, user_id, content, character, reading_id, card, expires_at) values (card, u, 'fortune', 'changha', r, '{"line":"x"}', now() + interval '30 days');
  insert into public.chemi_trial_uses (share_id, game) values (card, 'run');
  insert into public.chemi_birth_shares (user_low, user_high, low_shares) values (least(u, friend), greatest(u, friend), true) on conflict do nothing;
  insert into public.chemi_remind_requests (user_id, kind, content, send_date) values (u, 'tomorrow', 'fortune', d + 1);
  perform public.chemi_mail_enqueue(u, 'receipt', 'transactional', 'sent:' || u, jsonb_build_object('to', 'fan@example.test'), now());
  update public.chemi_mail_outbox set status = 'sent', sent_at = now(), to_hash = repeat('e', 64) where dedupe_key = 'sent:' || u;
  perform public.chemi_mail_enqueue(u, 'remind', 'requested', 'pending:' || u, jsonb_build_object('to', 'fan@example.test'), now());
  perform public.chemi_chain_enqueue('daily_reading', 'fortune:' || u || ':changha:' || d, u,
    jsonb_build_object('content','fortune','character','changha','date',d::text,'band',50), now());
  perform public.chemi_chain_enqueue('saju_first', 'saju_first:' || u || ':changha', u,
    jsonb_build_object('character','changha','date',d::text,'reading',3,'resultHash',repeat('ab',32)), now(), null, extensions.gen_random_bytes(32));
  update public.chemi_chain_records set status = 'minted', token_no = 1, wallet_address = '0x' || repeat('cd', 20), minted_at = now()
    where record_key = 'saju_first:' || u || ':changha';
end $$;

do $$
declare
  u uuid := extensions.gen_random_uuid(); friend uuid := extensions.gen_random_uuid(); empty uuid := extensions.gen_random_uuid();
  keep constant text[] := array['chemi_orders','chemi_pay_eligibility','chemi_first_purchase','chemi_guardian_consents'];
  missing text; first jsonb; second jsonb; leftover jsonb;
begin
  insert into public.app_users (id, privy_user_id, verified_email) values
    (u, 'did:privy:chemi-erase-u', 'chemi-erase-u@example.test'), (friend, 'did:privy:chemi-erase-f', 'chemi-erase-f@example.test'),
    (empty, 'did:privy:chemi-erase-e', 'chemi-erase-e@example.test');
  insert into public.user_wallets (app_user_id, chain_id, address) values (u, 91342, '0x' || repeat('cd', 20));
  perform pg_temp.fill(u, friend);
  perform pg_temp.fill(friend, u);
  -- 준비가 모든 사용자 표를 채웠는지(새 표가 생기면 fill 도 늘려야 한다)
  select string_agg(distinct t.tbl, ', ') into missing from pg_temp.user_tables() t
    where not exists (select 1 from jsonb_object_keys(pg_temp.rows_of(u, '{}')) k where k like t.tbl || '.%');
  if missing is not null then raise exception 'fixture misses %', missing; end if;

  -- ① 지운 뒤 보관 표 밖에는 그 사용자의 줄이 0
  first := public.chemi_erase_user(u, 'account');
  leftover := pg_temp.rows_of(u, keep);
  if leftover <> '{}' then raise exception '① rows left %', leftover; end if;
  -- 친구의 줄은 남는다(친구 쪽 간식 1줄 = 준 사람 u 와의 줄은 지워짐)
  if (select count(*) from public.chemi_readings where user_id = friend) <> 1 or (select count(*) from public.chemi_profiles where user_id = friend) <> 1 then
    raise exception '① friend data touched'; end if;
  -- 보관 표는 남되 내용은 비움
  if exists (select 1 from public.chemi_orders where user_id = u and (target <> '{}' or draft_ask_id is not null)) then raise exception '① order content kept'; end if;
  if exists (select 1 from public.chemi_payment_events e join public.chemi_orders o on o.id = e.order_id where o.user_id = u
      and (e.payload::text like '%홍길동%' or e.payload::text like '%01012345678%')) then raise exception '① payment payload keeps contact'; end if;
  if (select payload -> 'card' ->> 'issuer' from public.chemi_payment_events e join public.chemi_orders o on o.id = e.order_id where o.user_id = u) <> 'A' then
    raise exception '① non-personal payment field removed'; end if;
  if (select count(*) from public.chemi_orders where user_id = u) <> 1 then raise exception '① order not retained'; end if;
  -- 보낸 메일은 남되 비움, 안 보낸 메일은 삭제
  if exists (select 1 from public.chemi_mail_outbox where dedupe_key = 'pending:' || u)
    or not exists (select 1 from public.chemi_mail_outbox where dedupe_key = 'sent:' || u and user_id is null and to_hash is null and payload = '{}') then
    raise exception '① mail outbox'; end if;
  -- ② 기록 대기열 어디에도 그 사용자 번호가 없음. 발급된 것은 burn_pending, 보내지 않은 것은 void
  if exists (select 1 from public.chemi_chain_records r where to_jsonb(r)::text like '%' || u::text || '%') then raise exception '② user id left in chain records'; end if;
  if (select count(*) from public.chemi_chain_records where status = 'burn_pending' and record_key like 'erased:%' and salt is null and wallet_address is null) <> 1
    or (select count(*) from public.chemi_chain_records where status = 'void' and void_reason = 'account_erased') <> 1 then raise exception '② chain states'; end if;
  -- 친구의 잡힌 질문 이용권은 그대로
  if (select held from public.chemi_pass_lots where user_id = friend and bucket = 'initial_free') <> 1 then raise exception 'friend hold touched'; end if;
  -- ③ 두 번 불러도 같은 결과
  second := public.chemi_erase_user(u, 'account');
  if pg_temp.rows_of(u, keep) <> '{}' or (second ->> 'readings')::int <> 0 or (second ->> 'chainRecords')::int <> 0 then raise exception '③ second call %', second; end if;
  -- ⑤ 줄이 하나도 없는 사용자도 오류 없이
  perform public.chemi_erase_user(empty, 'account');

  -- 생일 동의 철회: 프로필·차트·상대·풀이·질문과 운세류 기록만, 게임·성장은 남김
  first := public.chemi_withdraw_birth_consent(friend);
  if exists (select 1 from public.chemi_profiles where user_id = friend) or exists (select 1 from public.chemi_readings where user_id = friend)
    or exists (select 1 from public.chemi_partners where user_id = friend) or exists (select 1 from public.chemi_ask_threads where user_id = friend)
    or not exists (select 1 from public.chemi_minis where user_id = friend) or not exists (select 1 from public.chemi_game_plays where user_id = friend)
    or exists (select 1 from public.chemi_chain_records where user_id = friend and salt is not null)
    or exists (select 1 from public.chemi_chain_records where user_id = friend and kind in ('daily_reading','saju_first') and status not in ('void','burn_pending')) then
    raise exception 'birth withdrawal scope %', first;
  end if;
  if (select held from public.chemi_pass_lots where user_id = friend and bucket = 'initial_free') <> 0
    or (select remaining from public.chemi_pass_lots where user_id = friend and bucket = 'initial_free') <> 3 then raise exception 'birth withdrawal hold not released'; end if;
  perform pg_temp.expect_error('select public.chemi_erase_user(null)', 'CHEMI_INVALID');
  perform pg_temp.expect_error(format('select public.chemi_erase_user(%L, %L)', u, 'all'), 'CHEMI_INVALID');
end $$;

-- ④ 막는 주문 상태 넷 각각: 탈퇴 시작이 CHEMI_DELETION_BLOCKED, 계정은 active 그대로
do $$
declare u uuid := extensions.gen_random_uuid(); st text; o uuid := extensions.gen_random_uuid();
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (u, 'did:privy:chemi-block-u', 'chemi-block-u@example.test');
  insert into public.chemi_orders (id, order_no, user_id, product_code, amount_krw, status, limit_month, payment_key)
    values (o, 'C-20270113-7001', u, 'ask_5', 1900, 'created', '2027-01-01', 'pk_block');
  foreach st in array array['confirming','cancel_pending','refund_requested','manual_review'] loop
    update public.chemi_orders set status = st where id = o;
    perform pg_temp.expect_error('select public.chemi_begin_account_deletion(''did:privy:chemi-block-u'')', 'CHEMI_DELETION_BLOCKED');
    if (select status from public.app_users where id = u) <> 'active' or exists (select 1 from public.account_deletion_requests where app_user_id = u) then
      raise exception '④ % changed the account', st; end if;
  end loop;
  -- 끝난 주문이면 시작된다. created 주문은 abandoned 로
  update public.chemi_orders set status = 'paid', paid_at = now() where id = o;
  insert into public.chemi_orders (order_no, user_id, product_code, amount_krw) values ('C-20270113-7002', u, 'ask_1', 490);
  if public.chemi_begin_account_deletion('did:privy:chemi-block-u') ->> 'status' <> 'pending' then raise exception '④ begin after paid'; end if;
  if (select status from public.app_users where id = u) <> 'disabled'
    or (select status from public.chemi_orders where order_no = 'C-20270113-7002') <> 'abandoned' then raise exception '④ begin effects'; end if;
  -- 다시 불러도 기존 함수가 지금 상태를 돌려준다(막는 주문 검사를 다시 하지 않음)
  update public.chemi_orders set status = 'manual_review' where id = o;
  if public.chemi_begin_account_deletion('did:privy:chemi-block-u') ->> 'status' <> 'pending' then raise exception '④ repeat begin'; end if;
end $$;

-- ⑪ 케미 줄이 없는 사용자: 감싸개 둘의 반환값과 끝 상태가 기존 함수를 직접 부른 것과 같다
-- ⑬ 살아 있는 계정에 chemi_complete_account_deletion 을 불러도 지워지지 않는다
-- ⑫ chemi_erase_user 가 실패하면 탈퇴 요청은 pending 으로 남고 completed 가 되지 않는다
do $$
declare a uuid := extensions.gen_random_uuid(); b uuid := extensions.gen_random_uuid(); c uuid := extensions.gen_random_uuid(); live uuid := extensions.gen_random_uuid();
  ra jsonb; rb jsonb; ja jsonb; jb jsonb; ca boolean; cb boolean; jc jsonb; failed boolean := false;
begin
  insert into public.app_users (id, privy_user_id, verified_email) values
    (a, 'did:privy:chemi-same-a', 'chemi-same-a@example.test'), (b, 'did:privy:chemi-same-b', 'chemi-same-b@example.test'),
    (c, 'did:privy:chemi-fail-c', 'chemi-fail-c@example.test'), (live, 'did:privy:chemi-live-l', 'chemi-live-l@example.test');
  ra := public.begin_owned_account_deletion('did:privy:chemi-same-a');
  rb := public.chemi_begin_account_deletion('did:privy:chemi-same-b');
  if ra - 'appUserId' <> rb - 'appUserId' or (rb ->> 'appUserId')::uuid <> b then raise exception '⑪ begin result % vs %', ra, rb; end if;
  ja := public.claim_account_deletion(a); jb := public.claim_account_deletion(b);
  ca := public.complete_account_deletion(a, (ja ->> 'leaseToken')::uuid);
  cb := public.chemi_complete_account_deletion(b, (jb ->> 'leaseToken')::uuid);
  if ca is distinct from cb or not cb then raise exception '⑪ complete % vs %', ca, cb; end if;
  if (select (status, privy_user_id = 'deleted:' || id, verified_email = id || '@deleted.invalid') from public.app_users where id = a)
    is distinct from (select (status, privy_user_id = 'deleted:' || id, verified_email = id || '@deleted.invalid') from public.app_users where id = b)
    or (select (status, completed_at is not null, provider_subject) from public.account_deletion_requests where app_user_id = a)
    is distinct from (select (status, completed_at is not null, provider_subject) from public.account_deletion_requests where app_user_id = b) then
    raise exception '⑪ end state differs';
  end if;
  -- 완료된 계정에 다시 불러도 false, 아무 일 없음
  if public.chemi_complete_account_deletion(b, (jb ->> 'leaseToken')::uuid) then raise exception '⑪ repeat complete'; end if;

  -- ⑬
  perform pg_temp.fill(live, a);
  if public.chemi_complete_account_deletion(live, extensions.gen_random_uuid()) then raise exception '⑬ returned true'; end if;
  if not exists (select 1 from public.chemi_profiles where user_id = live) then raise exception '⑬ erased a live account'; end if;

  -- ⑫
  perform pg_temp.fill(c, a);
  perform public.chemi_begin_account_deletion('did:privy:chemi-fail-c');
  if (select held from public.chemi_pass_lots where user_id = c and bucket = 'initial_free') <> 0 then raise exception 'begin did not release hold'; end if;
  jc := public.claim_account_deletion(c);
  create function pg_temp.boom() returns trigger language plpgsql as $f$ begin raise exception 'ERASE_BOOM'; end $f$;
  create trigger chemi_test_boom before delete on public.chemi_profiles for each row execute function pg_temp.boom();
  begin
    perform public.chemi_complete_account_deletion(c, (jc ->> 'leaseToken')::uuid);
  exception when others then
    if sqlerrm <> 'ERASE_BOOM' then raise; end if;
    failed := true;
  end;
  drop trigger chemi_test_boom on public.chemi_profiles;
  if not failed or (select status from public.account_deletion_requests where app_user_id = c) <> 'pending'
    or (select privy_user_id from public.app_users where id = c) <> 'did:privy:chemi-fail-c'
    or not exists (select 1 from public.chemi_readings where user_id = c) then raise exception '⑫ deletion completed without erase'; end if;
  -- 고친 뒤 다시 돌면 끝난다
  if not public.chemi_complete_account_deletion(c, (jc ->> 'leaseToken')::uuid) then raise exception '⑫ retry did not complete'; end if;
  if exists (select 1 from public.chemi_readings where user_id = c) then raise exception '⑫ retry left rows'; end if;
end $$;
select 'erase_user ok' as result;
rollback;
