begin;
do $$
declare member uuid:=gen_random_uuid(); game text; paid jsonb; l jsonb; key uuid; i int;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(member,'did:privy:'||member,member||'@example.invalid');
  perform public.group_wallet_post(member,'fan_point',25,'chemi_reward',gen_random_uuid());
  foreach game in array array['run','match'] loop
    l:=case when game='run' then public.chemi_run_lobby(member) else public.chemi_match_lobby(member) end;
    if (l->>'points')::integer is distinct from 25 or (l->>'extraCost')::integer is distinct from 10 then raise exception 'wrong quote'; end if;
    for i in 1..3 loop perform public.chemi_issue_play(member,gen_random_uuid(),game,'changha',false); end loop;
    key:=gen_random_uuid(); paid:=public.chemi_issue_play(member,key,game,'changha',true);
    perform public.chemi_issue_play(member,key,game,'changha',true);
    if public.group_wallet_balance(member,'fan_point')<>15 then raise exception 'incorrect debit';end if;
    perform public.chemi_refund_play(member,(paid->>'playId')::uuid);
    perform public.chemi_refund_play(member,(paid->>'playId')::uuid);
    if public.group_wallet_balance(member,'fan_point')<>25 then raise exception 'incorrect refund';end if;
  end loop;
end $$;
rollback;
