-- 케미 질문하기: 하루 무료 질문, 이용권(공유·주간 보상) 쓰기, 이어 묻기 1번, 지난 질문 목록.
-- 표는 20270110030000_chemi_ask_tables.sql 그대로 쓴다. 새 함수만 추가한다.

-- 하루(한국 날짜)에 무료로 물을 수 있는 수. 바꿀 때는 이 함수만 새 번호 파일에서 다시 정의한다.
create function public.chemi_ask_daily_free() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;

create function public.chemi_ask_thread_json(t public.chemi_ask_threads) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'threadId', t.id, 'character', t.character, 'content', t.content, 'readingId', t.reading_id,
    'topic', t.topic, 'question', t.question, 'status', t.status, 'klass', t.klass, 'answer', t.answer,
    'followupQuestion', case when t.followup_status = 'answered' then t.followup_question end,
    'followupAnswer', case when t.followup_status = 'answered' then t.followup_answer end,
    'date', (t.created_at at time zone 'Asia/Seoul')::date)
$$;

-- 화면이 읽는 상태. p_reading·p_character 를 주면 그 결과를 지금 공유할 때 받을 보상도 함께 알려 준다.
create function public.chemi_ask_state(p_user uuid, p_reading uuid default null, p_character text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d date := public.dukjil_kst_date();
  w date := date_trunc('week', d::timestamp)::date;
  free_left integer;
  passes integer;
  fresh boolean;
begin
  if p_user is null then raise exception 'CHEMI_INVALID'; end if;
  select greatest(public.chemi_ask_daily_free() - count(*), 0)::integer into free_left
    from public.chemi_ask_threads
    where user_id = p_user and status = 'answered' and hold_lot_id is null
      and (created_at at time zone 'Asia/Seoul')::date = d;
  select coalesce(sum(remaining), 0)::integer into passes from public.chemi_pass_lots
    where user_id = p_user and pass_kind = 'ask' and closed_at is null
      and (expires_at is null or expires_at > pg_catalog.clock_timestamp());
  fresh := p_reading is not null and not exists (select from public.chemi_share_rewards
    where user_id = p_user and kind = 'result_once' and key = p_reading::text);
  return jsonb_build_object(
    'left', free_left + passes, 'freeLeft', free_left, 'passes', passes,
    'shareBonus', jsonb_build_object(
      'pass', fresh and not exists (select from public.chemi_share_rewards
        where user_id = p_user and kind = 'week_pass' and key = w::text),
      'exp', fresh and p_character is not null and p_character <> 'dosa' and not exists (
        select from public.chemi_share_rewards
        where user_id = p_user and kind = 'day_exp' and key = d || ':' || p_character)),
    'reminded', exists (select from public.chemi_remind_requests
      where user_id = p_user and kind = 'free_ask' and send_date = d + 1 and status = 'queued'),
    'pausedUntil', (select max(blocked_until) from public.chemi_ask_strikes
      where user_id = p_user and blocked_until > pg_catalog.clock_timestamp()),
    'threads', coalesce((select jsonb_agg(public.chemi_ask_thread_json(t) order by t.created_at desc, t.id)
      from (select * from public.chemi_ask_threads where user_id = p_user and status = 'answered'
        order by created_at desc, id limit 30) t), '[]'::jsonb));
end $$;

create function public.chemi_ask_thread(p_user uuid, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.chemi_ask_thread_json(t) from public.chemi_ask_threads t where t.id = p_id and t.user_id = p_user
$$;

-- 질문 1개. p_klass 가 있으면 난감한 질문으로 분류된 것이라 답(p_answer = 거절 말)만 남기고 차감하지 않는다.
-- 같은 p_id 로 다시 부르면 처음 결과를 그대로 돌려준다(새로고침·재전송에 중복 차감 없음).
create function public.chemi_ask_submit(p_user uuid, p_id uuid, p_character text, p_content text, p_reading uuid,
  p_topic text, p_question text, p_hash text, p_klass text, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.chemi_ask_threads;
  lot public.chemi_pass_lots;
  d date := public.dukjil_kst_date();
  at_time timestamptz := pg_catalog.clock_timestamp();
  strikes integer;
begin
  perform public.chemi_lock_user(p_user, false);
  if p_id is null or p_reading is null or p_answer is null or p_question is null then raise exception 'CHEMI_INVALID'; end if;
  select * into t from public.chemi_ask_threads where id = p_id;
  if found then
    if t.user_id <> p_user or t.request_hash <> p_hash then raise exception 'CHEMI_INVALID'; end if;
    return jsonb_build_object('thread', public.chemi_ask_thread_json(t), 'charged', false, 'replayed', true,
      'state', public.chemi_ask_state(p_user, t.reading_id, t.character));
  end if;
  if not exists (select from public.chemi_readings where id = p_reading and user_id = p_user and content = p_content) then
    raise exception 'CHEMI_NOT_FOUND';
  end if;
  if exists (select from public.chemi_ask_strikes where user_id = p_user and blocked_until > at_time) then
    raise exception 'CHEMI_ASK_PAUSED';
  end if;
  if p_klass is not null then
    insert into public.chemi_ask_threads (id, user_id, character, content, reading_id, topic, question, request_hash, klass, status, answer)
    values (p_id, p_user, p_character, p_content, p_reading, p_topic, p_question, p_hash, p_klass, 'blocked', p_answer)
    returning * into t;
    if p_klass = 'harassment' then
      insert into public.chemi_ask_strikes (user_id, kind, kst_date, count) values (p_user, 'harassment', d, 1)
      on conflict (user_id, kind, kst_date) do update set count = public.chemi_ask_strikes.count + 1
      returning count into strikes;
      if strikes >= 3 then
        update public.chemi_ask_strikes set blocked_until = at_time + interval '24 hours'
          where user_id = p_user and kind = 'harassment' and kst_date = d;
      end if;
    end if;
    return jsonb_build_object('thread', public.chemi_ask_thread_json(t), 'charged', false, 'replayed', false,
      'state', public.chemi_ask_state(p_user, p_reading, p_character));
  end if;
  if (select count(*) from public.chemi_ask_threads where user_id = p_user and status = 'answered'
      and hold_lot_id is null and (created_at at time zone 'Asia/Seoul')::date = d) >= public.chemi_ask_daily_free() then
    select * into lot from public.chemi_pass_lots
      where user_id = p_user and pass_kind = 'ask' and closed_at is null and remaining > 0
        and (expires_at is null or expires_at > at_time)
      order by expires_at nulls last, granted_at limit 1 for update;
    if not found then raise exception 'CHEMI_LIMIT'; end if;
    update public.chemi_pass_lots set remaining = remaining - 1 where id = lot.id;
    insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
    values (p_user, lot.id, 'ask', 'use', -1, 'ask', p_id::text, at_time);
  end if;
  insert into public.chemi_ask_threads (id, user_id, character, content, reading_id, topic, question, request_hash,
    status, hold_lot_id, answer, answered_at)
  values (p_id, p_user, p_character, p_content, p_reading, p_topic, p_question, p_hash, 'answered', lot.id, p_answer, at_time)
  returning * into t;
  return jsonb_build_object('thread', public.chemi_ask_thread_json(t), 'charged', true, 'replayed', false,
    'state', public.chemi_ask_state(p_user, p_reading, p_character));
end $$;

-- 이어 묻기: 답 받은 질문마다 1번, 기한 없음, 차감 없음. 같은 글로 다시 부르면 저장된 답을 돌려준다.
create function public.chemi_ask_followup(p_user uuid, p_id uuid, p_question text, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.chemi_ask_threads;
begin
  perform public.chemi_lock_user(p_user, false);
  if p_question is null or p_answer is null then raise exception 'CHEMI_INVALID'; end if;
  select * into t from public.chemi_ask_threads where id = p_id and user_id = p_user and status = 'answered' for update;
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  if t.followup_status = 'answered' then
    if t.followup_question <> p_question then raise exception 'CHEMI_LIMIT'; end if;
  else
    update public.chemi_ask_threads set followup_question = p_question, followup_answer = p_answer,
      followup_status = 'answered', followup_gen = followup_gen + 1, updated_at = pg_catalog.clock_timestamp()
      where id = p_id returning * into t;
  end if;
  return jsonb_build_object('thread', public.chemi_ask_thread_json(t),
    'state', public.chemi_ask_state(p_user, t.reading_id, t.character));
end $$;

revoke all on function public.chemi_ask_daily_free(), public.chemi_ask_thread_json(public.chemi_ask_threads),
  public.chemi_ask_state(uuid, uuid, text), public.chemi_ask_thread(uuid, uuid),
  public.chemi_ask_submit(uuid, uuid, text, text, uuid, text, text, text, text, text),
  public.chemi_ask_followup(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chemi_ask_state(uuid, uuid, text), public.chemi_ask_thread(uuid, uuid),
  public.chemi_ask_submit(uuid, uuid, text, text, uuid, text, text, text, text, text),
  public.chemi_ask_followup(uuid, uuid, text, text) to service_role;
