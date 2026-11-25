begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,
  migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
do $$
declare
  member uuid:=gen_random_uuid(); request_key uuid:=gen_random_uuid();
  price integer; issued jsonb; replay jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    values(member,'did:privy:'||member,member||'@example.invalid');
  for i in 1..3 loop
    perform public.chemi_issue_play(member,gen_random_uuid(),'run','changha',false,null);
  end loop;
  price:=(public.chemi_run_lobby(member)->>'extraCost')::int;
  perform public.group_wallet_post(member,'fan_point',2*price,'chemi_reward',gen_random_uuid());
  issued:=public.chemi_issue_play(member,request_key,'run','changha',true,price);
  replay:=public.chemi_issue_play(member,request_key,'run','changha',true,price);
  if replay->>'playId' is distinct from issued->>'playId' or replay->>'replayed' is distinct from 'true' then
    raise exception 'retry did not return the original ticket';
  end if;
  if public.group_wallet_balance(member,'fan_point') is distinct from price
    or (select count(*) from public.chemi_game_plays where user_id=member and game='run' and slot_kind='extra')<>1 then
    raise exception 'retry did not preserve one paid play and one debit';
  end if;
end $$;
rollback;
