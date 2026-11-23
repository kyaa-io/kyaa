-- 게임 시작을 눌렀지만 판을 받기 전에 페이지가 바뀐 경우(새로고침·이탈), 그 요청으로 발급된 판을 쓰지 않은 것으로 돌린다.
-- 클라이언트는 시작 요청 키를 들고 있다가 응답을 받지 못한 채 떠나면 그 키로 취소를 보낸다.
-- 발급 뒤 30초가 지난 판, 이미 끝났거나 나간 판은 돌리지 않는다(판 도중 나가면 그 판은 끝, K-72c220②).
-- 취소가 발급보다 먼저 도착하면 같은 키로 '돌린 판' 자리 표시를 남겨, 늦게 도착한 발급 요청이 판을 쓰지 못하게 한다.
create function public.chemi_cancel_play(p_user uuid, p_game text, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare play public.chemi_game_plays;
begin
  if p_request_key is null or p_game is null or p_game not in ('match','run') then raise exception 'CHEMI_INVALID'; end if;
  perform public.chemi_lock_user(p_user,true);
  select * into play from public.chemi_game_plays where user_id=p_user and request_key=p_request_key for update;
  if not found then
    insert into public.chemi_game_plays(user_id,game,character,map,kst_date,slot_kind,slot_no,request_key,request_hash,seed,status)
      values(p_user,p_game,'dosa','cancelled',public.dukjil_kst_date(),'free',1,p_request_key,
        encode(sha256(convert_to('cancelled','UTF8')),'hex'),0,'refunded');
    return jsonb_build_object('refunded',false);
  end if;
  if play.game<>p_game then raise exception 'CHEMI_INVALID'; end if;
  if play.status='refunded' then return jsonb_build_object('refunded',true); end if;
  if play.status<>'issued' or play.issued_at<now()-interval '30 seconds' then
    return jsonb_build_object('refunded',false);
  end if;
  perform public.chemi_refund_play(p_user,play.id);
  return jsonb_build_object('refunded',true);
end $$;

revoke all on function public.chemi_cancel_play(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.chemi_cancel_play(uuid,text,uuid) to service_role;
