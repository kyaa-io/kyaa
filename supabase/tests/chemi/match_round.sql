begin;
do $$
declare u uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); play uuid; next_play uuid;
  receipt jsonb; lobby jsonb; trial jsonb; replay jsonb := '{"ticks":780,"pairs":12,"misses":1,"moves":[]}';
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:match-round-test','match@example.test');
  lobby:=public.chemi_match_lobby(u,true);
  if lobby->>'freeRemaining'<>'3' or lobby->>'sound'<>'true' then raise exception 'initial lobby'; end if;
  play:=(public.chemi_issue_play(u,k,'match','changha',false)->>'playId')::uuid;
  if (public.chemi_issue_play(u,k,'match','changha',false)->>'playId')::uuid<>play then raise exception 'duplicate ticket'; end if;
  receipt:=public.chemi_match_finish(u,play,242760,replay);
  if receipt<>public.chemi_match_finish(u,play,242760,replay) or receipt->>'exp'<>'10' then raise exception 'unstable receipt'; end if;
  lobby:=public.chemi_match_lobby(u,null);
  if lobby->>'freeRemaining'<>'2' or lobby->>'extraRemaining'<>'3'
    or lobby#>>'{ranking,0,place}'<>'1' or lobby#>>'{ranking,0,isMe}'<>'true'
    or lobby#>>'{ranking,0,misses}'<>'1' then raise exception 'lobby %',lobby; end if;
  trial:=public.chemi_match_challenge(receipt->>'shareId',null);
  if trial->>'available'<>'true' or trial->>'ticks'<>'780' or trial#>>'{ranking,0,isMe}'<>'false'
    then raise exception 'challenge preview'; end if;
  trial:=public.chemi_match_challenge(receipt->>'shareId',k);
  if trial->>'seed'<>public.chemi_match_info(u,play)->>'seed' then raise exception 'trial board differs'; end if;
  if trial<>public.chemi_match_challenge(receipt->>'shareId',k) then raise exception 'trial retry'; end if;
  begin
    perform public.chemi_match_challenge(receipt->>'shareId',gen_random_uuid());
    raise exception 'duplicate trial accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_LIMIT' then raise; end if; end;
  next_play:=(public.chemi_issue_play(u,gen_random_uuid(),'match','changha',false)->>'playId')::uuid;
  if public.chemi_match_finish(u,next_play,111,replay)->>'exp'<>'0' then raise exception 'duplicate exp'; end if;
  next_play:=(public.chemi_issue_play(u,gen_random_uuid(),'match','changha',false)->>'playId')::uuid;
  perform public.chemi_match_leave(u,next_play);
  begin
    perform public.chemi_match_finish(u,next_play,111,replay);
    raise exception 'left play accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_INVALID' then raise; end if; end;
  begin
    perform public.chemi_issue_play(u,gen_random_uuid(),'match','changha',false);
    raise exception 'fourth free play accepted';
  exception when raise_exception then if sqlerrm<>'CHEMI_LIMIT' then raise; end if; end;
  update public.chemi_game_plays set submitted_at=now()-interval '31 days' where id=play;
  if public.chemi_match_challenge(receipt->>'shareId',null) is not null then raise exception 'expired invitation'; end if;
end $$;
rollback;
