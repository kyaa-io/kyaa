begin;
do $$
declare u uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); late uuid:=gen_random_uuid(); play uuid; lobby jsonb;
  replay jsonb := '{"ticks":780,"pairs":12,"misses":1,"moves":[]}';
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:cancel-play-test','cancel@example.test');
  -- 판을 받기 전에 떠남: 발급된 판을 돌리고 무료 판은 그대로.
  play:=(public.chemi_issue_play(u,k,'match','changha',false)->>'playId')::uuid;
  if public.chemi_cancel_play(u,'match',k)->>'refunded'<>'true' then raise exception 'unseen play not refunded'; end if;
  if public.chemi_cancel_play(u,'match',k)->>'refunded'<>'true' then raise exception 'cancel not idempotent'; end if;
  lobby:=public.chemi_match_lobby(u,null);
  if lobby->>'freeRemaining'<>'3' then raise exception 'free play spent after cancel %',lobby; end if;
  -- 같은 키로 다시 발급해도 돌린 판이 되살아나지 않는다(새로고침해도 중복 차감 없음).
  begin
    perform public.chemi_match_finish(u,play,111,replay);
    raise exception 'cancelled play accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_INVALID' then raise; end if; end;
  -- 취소가 발급보다 먼저 도착: 늦은 발급은 판을 쓰지 못한다.
  if public.chemi_cancel_play(u,'match',late)->>'refunded'<>'false' then raise exception 'early cancel'; end if;
  begin
    perform public.chemi_issue_play(u,late,'match','changha',false);
    raise exception 'late issue accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_REQUEST_KEY_REUSED' then raise; end if; end;
  if public.chemi_match_lobby(u,null)->>'freeRemaining'<>'3' then raise exception 'late issue spent'; end if;
  -- 판 도중 나감(leave)은 그 판을 쓴 것으로 남는다.
  k:=gen_random_uuid();
  play:=(public.chemi_issue_play(u,k,'match','changha',false)->>'playId')::uuid;
  perform public.chemi_match_leave(u,play);
  if public.chemi_cancel_play(u,'match',k)->>'refunded'<>'false' then raise exception 'left play refunded'; end if;
  if public.chemi_match_lobby(u,null)->>'freeRemaining'<>'2' then raise exception 'left play not counted'; end if;
  -- 발급 뒤 30초가 지난 판은 돌리지 않는다.
  k:=gen_random_uuid();
  play:=(public.chemi_issue_play(u,k,'match','changha',false)->>'playId')::uuid;
  update public.chemi_game_plays set issued_at=now()-interval '31 seconds' where id=play;
  if public.chemi_cancel_play(u,'match',k)->>'refunded'<>'false' then raise exception 'old play refunded'; end if;
  if public.chemi_match_lobby(u,null)->>'freeRemaining'<>'1' then raise exception 'old play not counted'; end if;
  -- 다른 게임 이름으로는 돌릴 수 없다.
  begin
    perform public.chemi_cancel_play(u,'run',k);
    raise exception 'cross game cancel accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_INVALID' then raise; end if; end;
end $$;
rollback;
