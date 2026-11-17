-- 케미 M1 · 묶음 사이 계약 함수 시험(설계 arch-chemi r3 §5.2a·§5.3c). 일회용 DB 에서만, 끝에 되돌린다.
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected:%', expected;
exception when others then if sqlerrm = 'expected:' || expected or sqlerrm <> expected then raise; end if; end $$;
-- §5.3c 불변식 ①~⑤를 직접 센다.
create function pg_temp.pass_invariants(p_user uuid) returns void language plpgsql as $$
declare bad text;
begin
  select string_agg(l.id::text, ',') into bad from public.chemi_pass_lots l where l.user_id = p_user and (
    l.remaining <> (select coalesce(sum(delta), 0) from public.chemi_pass_ledger g where g.lot_id = l.id)
    or l.held <> (select count(*) filter (where reason = 'hold') - count(*) filter (where reason in ('use','release')) from public.chemi_pass_ledger g where g.lot_id = l.id)
    or (l.closed_at is not null and l.remaining <> 0) or l.held < 0);
  if bad is not null then raise exception 'pass invariants broken for lots %', bad; end if;
  if exists (select 1 from public.chemi_pass_lots where user_id = p_user and bucket in ('weekly_free','share') and closed_at is null
      group by pass_kind, bucket having count(*) > 1) then raise exception 'more than one open free lot'; end if;
end $$;
do $$
declare
  u uuid := extensions.gen_random_uuid(); closed uuid := extensions.gen_random_uuid(); nowallet uuid := extensions.gen_random_uuid();
  r jsonb; r2 jsonb; old_lot uuid; new_lot uuid; thread uuid := extensions.gen_random_uuid(); n integer;
  daily jsonb := jsonb_build_object('content','fortune','character','changha','date',public.dukjil_kst_date()::text,'band',50);
begin
  insert into public.app_users (id, privy_user_id, verified_email) values
    (u, 'did:privy:chemi-base-1', 'chemi-base-1@example.test'),
    (closed, 'did:privy:chemi-base-2', 'chemi-base-2@example.test'),
    (nowallet, 'did:privy:chemi-base-3', 'chemi-base-3@example.test');
  update public.app_users set status = 'disabled' where id = closed;
  insert into public.user_wallets (app_user_id, chain_id, address) values (u, 91342, '0x' || repeat('ab', 20));

  -- 스위치: feature 는 줄이 없으면 off, 줄을 넣으면 그 값
  if public.chemi_feature_state('pay') <> 'off' or public.chemi_feature_state('ask') <> 'off' then raise exception 'feature default must be off'; end if;
  perform public.chemi_switch_set('feature', 'pay', 'on');
  if public.chemi_feature_state('pay') <> 'on' then raise exception 'switch_set did not apply'; end if;
  perform public.chemi_switch_set('feature', 'pay', 'maintenance');
  if public.chemi_feature_state('pay') <> 'maintenance' or (select count(*) from public.chemi_switches) <> 1 then raise exception 'switch_set not an upsert'; end if;
  perform public.chemi_switch_set('content', 'tarot', 'off');
  if public.chemi_feature_state('tarot') <> 'off' then raise exception 'content switch leaked into feature'; end if;

  -- 잠금: 닫힌 계정은 CHEMI_ACCOUNT_CLOSED, require_active=false 면 통과
  perform pg_temp.expect_error(format('select public.chemi_lock_user(%L)', closed), 'CHEMI_ACCOUNT_CLOSED');
  perform public.chemi_lock_user(closed, true, false);
  perform pg_temp.expect_error('select public.chemi_lock_user(null)', 'CHEMI_INVALID');

  -- 처음 무료 3개: 한 번만, 기한 없음
  r := public.chemi_pass_ensure_initial(u); r2 := public.chemi_pass_ensure_initial(u);
  if not (r ->> 'granted')::boolean or (r2 ->> 'granted')::boolean or r ->> 'lotId' <> r2 ->> 'lotId' then raise exception 'initial not once: % %', r, r2; end if;
  if (select remaining from public.chemi_pass_lots where id = (r ->> 'lotId')::uuid) <> 3
    or (select expires_at from public.chemi_pass_lots where id = (r ->> 'lotId')::uuid) is not null then raise exception 'initial lot shape'; end if;

  -- 이번 주 무료: 같은 grant_key 는 다시 줘도 그대로(replayed), 내역 grant 1줄
  r := public.chemi_pass_grant(u, 'ask', 'weekly_free', 'weekly:' || u || ':2027-01-04', 1, now() + interval '168 hours');
  old_lot := (r ->> 'lotId')::uuid;
  for n in 1..3 loop
    r2 := public.chemi_pass_grant(u, 'ask', 'weekly_free', 'weekly:' || u || ':2027-01-04', 1, now() + interval '168 hours');
    if (r2 ->> 'granted')::boolean or (r2 ->> 'lotId')::uuid <> old_lot then raise exception 'weekly replay granted again'; end if;
  end loop;
  if (select count(*) from public.chemi_pass_ledger where lot_id = old_lot) <> 1 then raise exception 'weekly grant ledger not 1'; end if;
  perform pg_temp.expect_error(format('select public.chemi_pass_grant(%L, %L, %L, %L, 1, now())', nowallet, 'ask', 'weekly_free', 'weekly:' || u || ':2027-01-04'), 'CHEMI_REQUEST_KEY_REUSED');

  -- §5.2a 7a: 지난주 묶음이 잡혀 있는 채(remaining 0 · held 1) 이번 주 묶음 지급 → 옛 묶음 닫힘(held 1 그대로), 새 묶음 1
  update public.chemi_pass_lots set remaining = 0, held = 1 where id = old_lot;
  insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id) values (u, old_lot, 'ask', 'hold', -1, 'ask', thread || '#1');
  insert into public.chemi_ask_threads (id, user_id, character, content, question, request_hash, status, hold_gen, hold_token, hold_lot_id, hold_expires_at)
    values (thread, u, 'changha', 'fortune', 'q', repeat('0', 64), 'held', 1, extensions.gen_random_uuid(), old_lot, now() + interval '10 minutes');
  r := public.chemi_pass_grant(u, 'ask', 'weekly_free', 'weekly:' || u || ':2027-01-11', 1, now() + interval '168 hours');
  new_lot := (r ->> 'lotId')::uuid;
  if not exists (select 1 from public.chemi_pass_lots where id = old_lot and closed_reason = 'replace' and remaining = 0 and held = 1) then raise exception '7a old lot'; end if;
  if (select remaining from public.chemi_pass_lots where id = new_lot) <> 1 then raise exception '7a new lot'; end if;
  perform pg_temp.pass_invariants(u);
  -- 잡아 둔 질문을 정리(release): 옛 묶음은 닫혀 있으므로 release +1 · lapse −1, 새 묶음 1 그대로
  if public.chemi_release_user_holds(u) <> 1 then raise exception 'release count'; end if;
  if not exists (select 1 from public.chemi_pass_lots where id = old_lot and held = 0 and remaining = 0)
    or (select remaining from public.chemi_pass_lots where id = new_lot) <> 1
    or (select count(*) from public.chemi_pass_ledger where ref_id = thread || '#1' and reason in ('release','lapse')) <> 2
    or (select status from public.chemi_ask_threads where id = thread) <> 'failed' then raise exception 'release on closed lot'; end if;
  perform pg_temp.pass_invariants(u);
  -- §5.2a 7: 남은 1개가 있는 채 다음 주 지급 → replace −1, 살아 있는 묶음 정확히 1
  r := public.chemi_pass_grant(u, 'ask', 'weekly_free', 'weekly:' || u || ':2027-01-18', 1, now() + interval '168 hours');
  if not exists (select 1 from public.chemi_pass_ledger where lot_id = new_lot and reason = 'replace' and delta = -1) then raise exception '7 replace ledger'; end if;
  perform pg_temp.pass_invariants(u);
  -- 공유 선물은 다른 통이라 이번 주 무료를 닫지 않는다
  perform public.chemi_pass_grant(u, 'ask', 'share', 'share:' || u || ':2027-01-18', 1, now() + interval '168 hours');
  if (select count(*) from public.chemi_pass_lots where user_id = u and closed_at is null) <> 3 then raise exception 'share closed another bucket'; end if;
  -- 산 이용권은 주문이 있어야 한다
  perform pg_temp.expect_error(format('select public.chemi_pass_grant(%L, %L, %L, %L, 5, now() + interval %L)', u, 'ask', 'paid', 'order:x:ask', '5 years'), 'new row for relation "chemi_pass_lots" violates check constraint "chemi_pass_lots_paid_has_order"');
  perform pg_temp.pass_invariants(u);

  -- 기록 예약: 한 번만, 지갑 있으면 pending · 없으면 waiting_wallet, 목록 밖이면 거절
  r := public.chemi_chain_enqueue('daily_reading', 'fortune:' || u || ':changha:' || public.dukjil_kst_date(), u, daily, now());
  r2 := public.chemi_chain_enqueue('daily_reading', 'fortune:' || u || ':changha:' || public.dukjil_kst_date(), u, daily, now());
  if not (r ->> 'queued')::boolean or (r2 ->> 'queued')::boolean or r ->> 'recordId' <> r2 ->> 'recordId' then raise exception 'enqueue not once'; end if;
  if (select status from public.chemi_chain_records where id = (r ->> 'recordId')::uuid) <> 'pending' then raise exception 'wallet user not pending'; end if;
  r := public.chemi_chain_enqueue('daily_reading', 'fortune:' || nowallet || ':changha:' || public.dukjil_kst_date(), nowallet, daily, now());
  if (select status from public.chemi_chain_records where id = (r ->> 'recordId')::uuid) <> 'waiting_wallet' then raise exception 'no wallet not waiting'; end if;
  perform pg_temp.expect_error(format('select public.chemi_chain_enqueue(%L, %L, %L, %L, now())', 'daily_reading', 'x:1', u, daily || '{"birth":"1995-05-05"}'), 'CHEMI_CHAIN_PAYLOAD_REJECTED');
  -- 게임 그날 최고: 어제 날짜를 넘기면 어제 날짜만 통과
  perform public.chemi_chain_enqueue('game_best', 'game_best:' || u || ':run:yesterday', u,
    jsonb_build_object('game','run','map','changha','date',(public.dukjil_kst_date() - 1)::text,'score',10), now(), public.dukjil_kst_date() - 1);
  perform pg_temp.expect_error(format('select public.chemi_chain_enqueue(%L, %L, %L, %L, now())', 'game_best', 'g:2', u,
    jsonb_build_object('game','run','map','changha','date',(public.dukjil_kst_date() - 1)::text,'score',10)), 'CHEMI_CHAIN_PAYLOAD_REJECTED');
  perform pg_temp.expect_error(format('select public.chemi_chain_enqueue(%L, %L, null, %L, now())', 'daily_reading', 'x:2', daily), 'CHEMI_INVALID');
  perform pg_temp.expect_error(format('select public.chemi_chain_enqueue(%L, %L, %L, %L, now())', 'daily_reading', 'erased:x', u, daily), 'CHEMI_INVALID');
  perform pg_temp.expect_error(format('select public.chemi_chain_enqueue(%L, %L, %L, %L, now(), null, %L::bytea)', 'daily_reading', 'x:3', u, daily, '\x00'), 'new row for relation "chemi_chain_records" violates check constraint "chemi_chain_records_salt_check"');

  -- 메일 넣기: dedupe_key 로 한 번만
  r := public.chemi_mail_enqueue(u, 'receipt', 'transactional', 'receipt:o1', '{"orderNo":"C-20270113-0001"}', null);
  r2 := public.chemi_mail_enqueue(u, 'receipt', 'transactional', 'receipt:o1', '{"orderNo":"C-20270113-0002"}', null);
  if not (r ->> 'queued')::boolean or (r2 ->> 'queued')::boolean or r ->> 'mailId' <> r2 ->> 'mailId'
    or (select payload ->> 'orderNo' from public.chemi_mail_outbox where id = (r ->> 'mailId')::uuid) <> 'C-20270113-0001' then raise exception 'mail not once'; end if;
end $$;
select 'base_fn ok' as result;
rollback;
