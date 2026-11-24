begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,
  migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
do $$
declare member uuid:=gen_random_uuid(); mode text; paid jsonb; lobby jsonb; key uuid; price int; balance int;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(member,'did:privy:'||member,member||'@example.invalid');
  foreach mode in array array['run','match'] loop
    perform public.group_wallet_post(member,'fan_point',2900,'chemi_reward',gen_random_uuid());
    for i in 1..3 loop perform public.chemi_issue_play(member,gen_random_uuid(),mode,'changha',false); end loop;
    foreach price in array array[100,300,500,1000,1000] loop
      lobby:=case when mode='run' then public.chemi_run_lobby(member) else public.chemi_match_lobby(member) end;
      if (lobby->>'extraCost')::int is distinct from price then raise exception 'quote %',lobby; end if;
      key:=gen_random_uuid();
      balance:=public.group_wallet_balance(member,'fan_point');
      paid:=public.chemi_issue_play(member,key,mode,'changha',true,price);
      perform public.chemi_issue_play(member,key,mode,'changha',true,price);
      if public.group_wallet_balance(member,'fan_point')<>balance-price then raise exception 'incorrect debit';end if;
    end loop;
    begin
      perform public.chemi_issue_play(member,gen_random_uuid(),mode,'changha',true,1000);
      raise exception 'accepted without points';
    exception when raise_exception then
      if sqlerrm<>'GROUP_WALLET_INSUFFICIENT_BALANCE' then raise; end if;
    end;
    perform public.chemi_refund_play(member,(paid->>'playId')::uuid);
    perform public.chemi_refund_play(member,(paid->>'playId')::uuid);
    if public.group_wallet_balance(member,'fan_point')<>1000 then raise exception 'incorrect refund';end if;
    perform public.chemi_issue_play(member,gen_random_uuid(),mode,'changha',true,1000);
  end loop;
  if public.dukjil_kst_date('2026-11-24T14:59:59Z')=public.dukjil_kst_date('2026-11-24T15:00:00Z') then raise exception 'KST boundary'; end if;
  update public.chemi_game_plays set kst_date=kst_date-1 where user_id=member;
  foreach mode in array array['run','match'] loop
    lobby:=case when mode='run' then public.chemi_run_lobby(member) else public.chemi_match_lobby(member) end;
    if lobby->>'freeRemaining' is distinct from '3' or lobby->>'extraCost' is distinct from '100' then raise exception 'day reset %',lobby; end if;
  end loop;
end $$;
rollback;
