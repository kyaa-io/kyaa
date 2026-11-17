-- Run before D1, after D1, and after restoring its original definition.
begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,
  migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
do $$
declare u uuid:=gen_random_uuid(); s text; k uuid; entry uuid; amount bigint;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:'||u,u||'@example.invalid');
  foreach s in array array['group_exchange','group_check_in','group_capsule','group_support','dukjil_action',
    'dukjil_streak','dukjil_proof','dukjil_correction','group_mission','group_raffle_entry','group_raffle_refund']
  loop
    foreach amount in array array[10,-10] loop
      k:=gen_random_uuid();
      entry:=public.group_wallet_post(u,'fan_point',amount,s,k);
      if public.group_wallet_post(u,'fan_point',amount,s,k) is distinct from entry then raise exception 'replay %',s; end if;
      if public.group_wallet_balance(u,'fan_point') <> greatest(amount,0) then raise exception 'balance %',s; end if;
    end loop;
  end loop;
  begin
    perform public.group_wallet_post(u,'fan_point',10,'unknown_source',gen_random_uuid());
    raise exception 'accepted unknown source';
  exception when raise_exception then
    if sqlerrm <> 'GROUP_WALLET_INVALID' then raise; end if;
  end;
end $$;
rollback;
