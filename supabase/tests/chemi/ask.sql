begin;
do $$
declare u uuid := gen_random_uuid(); other uuid := gen_random_uuid(); r uuid; k uuid := gen_random_uuid();
  h text := repeat('a', 64); out jsonb; state jsonb; share text; n integer;
begin
  insert into public.app_users(id, privy_user_id, verified_email) values
    (u, 'did:privy:ask-test', 'ask@example.test'), (other, 'did:privy:ask-other', 'ask-other@example.test');
  insert into public.chemi_readings(user_id, content, kind, character, target_key, kst_date, result, engine_version, table_version)
    values (u, 'tarot', 'daily', 'changha', '', public.dukjil_kst_date(), '{"cards":[{"card":3,"reversed":false}]}', 't', 't')
    returning id into r;

  -- 빈 상태 사용자: 질문·이용권·알림이 하나도 없다.
  state := public.chemi_ask_state(u, null, null);
  if state->>'left' <> '3' or state->'threads' <> '[]'::jsonb or state->>'pausedUntil' is not null
    or state#>>'{shareBonus,pass}' <> 'false' or state->>'reminded' <> 'false' then raise exception 'empty state %', state; end if;
  state := public.chemi_ask_state(u, r, 'changha');
  if state#>>'{shareBonus,pass}' <> 'true' or state#>>'{shareBonus,exp}' <> 'true' then raise exception 'share bonus %', state; end if;

  -- 남의 풀이로는 물을 수 없다.
  begin
    perform public.chemi_ask_submit(other, gen_random_uuid(), 'changha', 'tarot', r, 'love', 'q', h, null, 'a');
    raise exception 'foreign reading accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_NOT_FOUND' then raise; end if; end;

  -- 첫 질문: 무료 1개 차감, 같은 키로 다시 보내도 한 번만.
  out := public.chemi_ask_submit(u, k, 'changha', 'tarot', r, 'love', '잘될까?', h, null, '답');
  if out->>'charged' <> 'true' or out#>>'{state,left}' <> '2' or out#>>'{thread,answer}' <> '답' then raise exception 'first %', out; end if;
  out := public.chemi_ask_submit(u, k, 'changha', 'tarot', r, 'love', '잘될까?', h, null, '다른 답');
  if out->>'replayed' <> 'true' or out#>>'{state,left}' <> '2' or out#>>'{thread,answer}' <> '답' then raise exception 'replay %', out; end if;

  -- 난감한 질문: 답은 남고 질문 수는 그대로.
  out := public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'free', '여자친구 있어?', h, 'privacy', '말 못 해');
  if out->>'charged' <> 'false' or out#>>'{state,left}' <> '2' or out#>>'{thread,status}' <> 'blocked'
    or jsonb_array_length(out#>'{state,threads}') <> 1 then raise exception 'guard %', out; end if;

  -- 이어 묻기 1번, 차감 없음. 두 번째 다른 질문은 거절.
  out := public.chemi_ask_followup(u, k, '언제쯤?', '곧');
  if out#>>'{thread,followupAnswer}' <> '곧' or out#>>'{state,left}' <> '2' then raise exception 'followup %', out; end if;
  if public.chemi_ask_followup(u, k, '언제쯤?', '다시')#>>'{thread,followupAnswer}' <> '곧' then raise exception 'followup replay'; end if;
  begin
    perform public.chemi_ask_followup(u, k, '또 하나', '답');
    raise exception 'second followup accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_LIMIT' then raise; end if; end;
  begin
    perform public.chemi_ask_followup(other, k, '언제쯤?', '답');
    raise exception 'foreign followup accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_NOT_FOUND' then raise; end if; end;

  -- 하루 무료 3개를 다 쓰면 한도.
  perform public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'work', 'q2', h, null, 'a');
  out := public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'work', 'q3', h, null, 'a');
  if out#>>'{state,left}' <> '0' then raise exception 'third %', out; end if;
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'work', 'q4', h, null, 'a');
    raise exception 'fourth free accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_LIMIT' then raise; end if; end;

  -- 이번 주 첫 공유: 질문 +1, 친밀 +5. 받은 이용권으로 한 번 더 묻고 나면 다시 한도.
  share := public.chemi_create_share(u, r, 'changha')->>'shareId';
  if public.chemi_share_done(u, share, 'copy')->'reward' <> '{"pass":1,"exp":5}'::jsonb then raise exception 'share reward'; end if;
  state := public.chemi_ask_state(u, r, 'changha');
  if state->>'left' <> '1' or state->>'passes' <> '1' or state#>>'{shareBonus,pass}' <> 'false'
    or state#>>'{shareBonus,exp}' <> 'false' then raise exception 'after share %', state; end if;
  out := public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'money', 'q5', h, null, 'a');
  if out#>>'{state,left}' <> '0' then raise exception 'pass use %', out; end if;
  select count(*) into n from public.chemi_pass_ledger where user_id = u and reason = 'use' and delta = -1;
  if n <> 1 then raise exception 'ledger %', n; end if;
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'money', 'q6', h, null, 'a');
    raise exception 'empty pass accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_LIMIT' then raise; end if; end;

  -- 다음 날에는 무료 질문이 다시 3개. 지난 질문은 목록에 남는다.
  update public.chemi_ask_threads set created_at = created_at - interval '1 day' where user_id = u;
  state := public.chemi_ask_state(u, null, null);
  if state->>'left' <> '3' or jsonb_array_length(state->'threads') <> 4 then raise exception 'next day %', state; end if;

  -- 괴롭힘 3번이면 24시간 멈춤.
  for n in 1..3 loop
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'free', 'x', h, 'harassment', '답 안 해');
  end loop;
  if public.chemi_ask_state(u, null, null)->>'pausedUntil' is null then raise exception 'not paused'; end if;
  begin
    perform public.chemi_ask_submit(u, gen_random_uuid(), 'changha', 'tarot', r, 'free', 'q', h, null, 'a');
    raise exception 'paused ask accepted';
  exception when raise_exception then if sqlerrm <> 'CHEMI_ASK_PAUSED' then raise; end if; end;

  -- 메일 알림 신청(chemi_reminder_set 이 남기는 줄)이 상태에 보인다.
  insert into public.chemi_remind_requests(user_id, kind, content, send_date, status)
    values (u, 'free_ask', '', public.dukjil_kst_date() + 1, 'queued');
  if public.chemi_ask_state(u, null, null)->>'reminded' <> 'true' then raise exception 'reminder'; end if;
end $$;
rollback;
