-- 케미 질문하기 AI 답: 하루 상한과 사용량 기록. 표(chemi_ai_usage)는 20270110030000 그대로 쓰고 함수만 추가한다.
-- 사용자 정보·질문 글은 남기지 않는다(날짜별 호출 수·토큰 수만).

-- AI 를 부르기 전에 한 번 부른다. 불러도 되면 그날 호출 수를 1 올리고 true.
-- 한 사람 상한은 그날 답 받은 질문 + 이어 묻기 수로 센다(질문 표에서 읽으므로 새 표가 없다).
create function public.chemi_ai_reserve(p_user uuid, p_purpose text, p_user_calls integer, p_day_calls bigint, p_day_tokens bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  d date := public.dukjil_kst_date();
  used integer;
begin
  if p_user is null or p_purpose is null or p_user_calls is null or p_day_calls is null or p_day_tokens is null then
    raise exception 'CHEMI_INVALID';
  end if;
  select (count(*) filter (where status = 'answered' and (created_at at time zone 'Asia/Seoul')::date = d)
    + count(*) filter (where followup_status = 'answered' and (updated_at at time zone 'Asia/Seoul')::date = d))::integer
    into used from public.chemi_ask_threads
    where user_id = p_user and (created_at >= d::timestamp at time zone 'Asia/Seoul' or updated_at >= d::timestamp at time zone 'Asia/Seoul');
  if used >= p_user_calls or p_day_calls < 1 then return false; end if;
  insert into public.chemi_ai_usage as u (kst_date, purpose, calls) values (d, p_purpose, 1)
  on conflict (kst_date, purpose) do update set calls = u.calls + 1
    where u.calls < p_day_calls and u.tokens_in + u.tokens_out < p_day_tokens;
  return found;
end $$;

-- 답을 받은 뒤 쓴 토큰 수를 더한다.
create function public.chemi_ai_record(p_purpose text, p_in bigint, p_out bigint)
returns void language sql security definer set search_path = '' as $$
  update public.chemi_ai_usage set tokens_in = tokens_in + greatest(coalesce(p_in, 0), 0),
    tokens_out = tokens_out + greatest(coalesce(p_out, 0), 0)
  where kst_date = public.dukjil_kst_date() and purpose = p_purpose
$$;

revoke all on function public.chemi_ai_reserve(uuid, text, integer, bigint, bigint),
  public.chemi_ai_record(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.chemi_ai_reserve(uuid, text, integer, bigint, bigint),
  public.chemi_ai_record(text, bigint, bigint) to service_role;
