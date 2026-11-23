begin;
-- 질문하기 포인트: 무료 3개 → 20P 로 하루 3개, 잔액 부족이면 질문도 남지 않음, 같은 번호 재전송은 한 번만 빠짐.
do $$
declare u uuid := gen_random_uuid(); r uuid; k uuid := gen_random_uuid(); h text := repeat('b', 64); out jsonb; state jsonb; n integer; i integer;
begin
  insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:privy:ask-points', 'ask-points@example.test');
  insert into public.chemi_readings(user_id, content, kind, character, target_key, kst_date, result, engine_version, table_version)
    values (u, 'tarot', 'daily', 'yuna', '', public.dukjil_kst_date(), '{"cards":[{"card":3,"reversed":false}]}', 't', 't') returning id into r;
  state := public.chemi_ask_state(u, null, null);
  if state->>'extraLeft' <> '3' or state->>'extraCost' <> '20' or state->>'points' <> '0' then raise exception 'empty state %', state; end if;
  -- 무료가 남아 있으면 p_extra 여도 무료로 쓴다.
  out := public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'q1', h, null, 'a', true);
  if out->>'paid' <> 'false' or out#>>'{state,freeLeft}' <> '2' then raise exception 'free first %', out; end if;
  perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'q2', h, null, 'a');
  perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'q3', h, null, 'a');
  -- 무료를 다 쓰면 p_extra 없이 한도.
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'q4', h, null, 'a');
    raise exception 'free over limit';
  exception when raise_exception then if sqlerrm <> 'CHEMI_LIMIT' then raise; end if; end;
  -- 포인트가 모자라면 거절되고 질문도 남지 않는다.
  begin
    perform public.chemi_ask_submit(u, k, 'yuna', 'tarot', r, 'love', 'q4', h, null, 'a', true);
    raise exception 'paid without points';
  exception when raise_exception then if sqlerrm <> 'GROUP_WALLET_INSUFFICIENT_BALANCE' then raise; end if; end;
  if exists (select from public.chemi_ask_threads where id = k) then raise exception 'thread kept after failed charge'; end if;
  perform public.group_wallet_post(u, 'fan_point', 70, 'chemi_reward', gen_random_uuid());
  -- 20P 질문. 같은 번호로 다시 보내도 한 번만 빠진다.
  out := public.chemi_ask_submit(u, k, 'yuna', 'tarot', r, 'love', 'q4', h, null, 'a', true);
  if out->>'paid' <> 'true' or out#>>'{state,points}' <> '50' or out#>>'{state,extraLeft}' <> '2' or out#>>'{state,freeLeft}' <> '0' then raise exception 'paid %', out; end if;
  out := public.chemi_ask_submit(u, k, 'yuna', 'tarot', r, 'love', 'q4', h, null, 'a', true);
  if out->>'replayed' <> 'true' or public.group_wallet_balance(u, 'fan_point') <> 50 then raise exception 'double charge %', out; end if;
  select count(*) into n from public.mobile_fan_economy_ledger where app_user_id = u and source_type = 'chemi_ask_extra';
  if n <> 1 then raise exception 'ledger rows %', n; end if;
  -- 답을 만들지 못한 요청(p_answer 없음)은 빠지지 않는다.
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'q5', h, null, null, true);
    raise exception 'no answer accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_INVALID' then raise; end if; end;
  if public.group_wallet_balance(u, 'fan_point') <> 50 then raise exception 'charged without answer'; end if;
  -- 하루 추가 3개까지.
  for i in 1..2 loop perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'p' || i, h, null, 'a', true); end loop;
  if public.group_wallet_balance(u, 'fan_point') <> 10 or public.chemi_ask_state(u, null, null)->>'extraLeft' <> '0' then raise exception 'three extras'; end if;
  perform public.group_wallet_post(u, 'fan_point', 100, 'chemi_reward', gen_random_uuid());
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'love', 'p4', h, null, 'a', true);
    raise exception 'fourth extra';
  exception when raise_exception then if sqlerrm <> 'CHEMI_LIMIT' then raise; end if; end;
  -- 난감한 질문은 p_extra 여도 빠지지 않는다.
  out := public.chemi_ask_submit(u, gen_random_uuid(), 'yuna', 'tarot', r, 'free', '날씨', h, 'off_topic', '못 봐', true);
  if out->>'charged' <> 'false' or public.group_wallet_balance(u, 'fan_point') <> 110 then raise exception 'guard charged'; end if;
  -- 다음 날: 무료 3·추가 3 다시.
  update public.chemi_ask_threads set created_at = created_at - interval '1 day' where user_id = u;
  state := public.chemi_ask_state(u, null, null);
  if state->>'freeLeft' <> '3' or state->>'extraLeft' <> '3' then raise exception 'next day %', state; end if;
  raise notice 'ASK_POINTS_OK';
end $$;
rollback;
