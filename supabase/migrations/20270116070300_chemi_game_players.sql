-- 케미 게임 랭킹 위 참여자 수(대표 11/26 193861 "랭킹 위에 누적 참여자 수 같은 스탯"). 실제 숫자만(K-7ddb53): 끝낸 판이 있는 사람 수.
-- total = 지금까지, week = 이번 주(월요일 0시 한국 기준, 주간 랭킹과 같은 주). 판을 시작만 하고 끝내지 않은 사람은 세지 않는다.
create or replace function public.chemi_game_players(p_game text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', count(distinct p.user_id),
    'week', count(distinct p.user_id) filter (where p.kst_date >= date_trunc('week', now() at time zone 'Asia/Seoul')::date)
  )
  from public.chemi_game_plays p
  where p.game = p_game and p.status in ('submitted', 'verified')
$$;

revoke all on function public.chemi_game_players(text) from public, anon, authenticated;
grant execute on function public.chemi_game_players(text) to service_role;
