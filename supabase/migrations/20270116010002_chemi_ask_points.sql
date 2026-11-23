-- 케미 질문하기 포인트(사용자 결정 11/23 CHEMI-ASK-POINTS-1123 A): 무료 질문(과 이용권)을 다 쓰면
-- 질문 1개를 20P 로 하루 3개까지 더 묻는다. 포인트는 답을 저장하는 같은 거래에서 빠진다:
-- 답을 만들지 못하면 이 함수가 불리지 않으므로 빠지지 않고, 같은 질문 번호로 다시 보내면 처음 결과를 돌려준다.

create function public.chemi_ask_extra_cost() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;
create function public.chemi_ask_daily_extra() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;

-- 포인트로 산 질문이면 그 지갑 원장 줄. 무료·이용권 질문은 비어 있다(게임 판의 chemi_game_plays.ledger_id 와 같은 방식).
alter table public.chemi_ask_threads add column point_ledger_id uuid;

do $$
declare f text := pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure);
begin
  if regexp_count(f, '''chemi_date''') <> 1 or position('''chemi_ask_extra''' in f) > 0 then
    raise exception 'CHEMI_WALLET_CONTRACT_CHANGED';
  end if;
  execute replace(f, '''chemi_date''', '''chemi_date'',''chemi_ask_extra''');
end $$;

-- 화면이 읽는 상태. 무료 수는 포인트로 산 질문을 세지 않는다. 포인트로 더 물을 수 있는 수·값·잔액을 함께 준다.
create or replace function public.chemi_ask_state(p_user uuid, p_reading uuid default null, p_character text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d date := public.dukjil_kst_date();
  w date := date_trunc('week', d::timestamp)::date;
  free_left integer;
  extra_left integer;
  passes integer;
  fresh boolean;
begin
  if p_user is null then raise exception 'CHEMI_INVALID'; end if;
  select greatest(public.chemi_ask_daily_free() - count(*) filter (where point_ledger_id is null), 0)::integer,
    greatest(public.chemi_ask_daily_extra() - count(*) filter (where point_ledger_id is not null), 0)::integer
    into free_left, extra_left
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
    'extraLeft', extra_left, 'extraCost', public.chemi_ask_extra_cost(),
    'points', public.group_wallet_balance(p_user, 'fan_point'),
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

-- 질문 1개. 무료 → 이용권 → (p_extra 일 때만) 20P 순서로 쓴다. 난감한 질문(p_klass)은 차감하지 않는다.
drop function public.chemi_ask_submit(uuid, uuid, text, text, uuid, text, text, text, text, text);
create function public.chemi_ask_submit(p_user uuid, p_id uuid, p_character text, p_content text, p_reading uuid,
  p_topic text, p_question text, p_hash text, p_klass text, p_answer text, p_extra boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.chemi_ask_threads;
  lot public.chemi_pass_lots;
  d date := public.dukjil_kst_date();
  at_time timestamptz := pg_catalog.clock_timestamp();
  strikes integer;
  paid boolean := false;
begin
  perform public.chemi_lock_user(p_user, coalesce(p_extra, false));
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
      and hold_lot_id is null and point_ledger_id is null
      and (created_at at time zone 'Asia/Seoul')::date = d) >= public.chemi_ask_daily_free() then
    select * into lot from public.chemi_pass_lots
      where user_id = p_user and pass_kind = 'ask' and closed_at is null and remaining > 0
        and (expires_at is null or expires_at > at_time)
      order by expires_at nulls last, granted_at limit 1 for update;
    if found then
      update public.chemi_pass_lots set remaining = remaining - 1 where id = lot.id;
      insert into public.chemi_pass_ledger (user_id, lot_id, pass_kind, reason, delta, ref_kind, ref_id, created_at)
      values (p_user, lot.id, 'ask', 'use', -1, 'ask', p_id::text, at_time);
    elsif coalesce(p_extra, false) and (select count(*) from public.chemi_ask_threads where user_id = p_user
        and status = 'answered' and point_ledger_id is not null
        and (created_at at time zone 'Asia/Seoul')::date = d) < public.chemi_ask_daily_extra() then
      paid := true;
    else
      raise exception 'CHEMI_LIMIT';
    end if;
  end if;
  insert into public.chemi_ask_threads (id, user_id, character, content, reading_id, topic, question, request_hash,
    status, hold_lot_id, answer, answered_at)
  values (p_id, p_user, p_character, p_content, p_reading, p_topic, p_question, p_hash, 'answered', lot.id, p_answer, at_time)
  returning * into t;
  if paid then
    -- 잔액이 모자라면 GROUP_WALLET_INSUFFICIENT_BALANCE 로 거래 전체(질문 저장 포함)가 되돌아간다.
    update public.chemi_ask_threads
      set point_ledger_id = public.group_wallet_post(p_user, 'fan_point', -public.chemi_ask_extra_cost(), 'chemi_ask_extra', p_id)
      where id = p_id returning * into t;
  end if;
  return jsonb_build_object('thread', public.chemi_ask_thread_json(t), 'charged', true, 'paid', paid, 'replayed', false,
    'state', public.chemi_ask_state(p_user, p_reading, p_character));
end $$;

revoke all on function public.chemi_ask_extra_cost(), public.chemi_ask_daily_extra(),
  public.chemi_ask_state(uuid, uuid, text),
  public.chemi_ask_submit(uuid, uuid, text, text, uuid, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.chemi_ask_state(uuid, uuid, text),
  public.chemi_ask_submit(uuid, uuid, text, text, uuid, text, text, text, text, text, boolean) to service_role;
