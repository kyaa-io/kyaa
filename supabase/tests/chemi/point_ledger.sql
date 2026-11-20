-- Disposable local database. Activity points (fan_point wallet) and paid points (chemi_paid_point_ledger)
-- are separate ledgers; a chemi purchase spends activity first, then paid.
begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
create function pg_temp.new_member(activity integer) returns uuid language plpgsql as $$
declare member uuid := gen_random_uuid();
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(member,'did:privy:'||member,member||'@example.invalid');
  if activity > 0 then perform public.group_wallet_post(member,'fan_point',activity,'chemi_reward',gen_random_uuid()); end if;
  return member;
end $$;
create function pg_temp.new_order(member uuid) returns uuid language sql as $$
  select public.chemi_open_point_order(member)
$$;
create function pg_temp.balances(member uuid) returns text language sql as $$
  select activity_points||'/'||paid_points||'/'||total_points from public.chemi_point_balances(member)
$$;
do $$
declare
  member uuid; other uuid; ord uuid; ord2 uuid; response jsonb; msg text;
  day date := public.dukjil_kst_date()+1;
  payload jsonb := '{"locked":false,"score":75}';
begin
  -- 1. top-up: wrong amount rejected, DONE is idempotent, other owner cannot settle it
  member := pg_temp.new_member(3); other := pg_temp.new_member(0);
  ord := pg_temp.new_order(member);
  assert public.chemi_owned_point_order(member, ord) and not public.chemi_owned_point_order(other, ord);
  begin perform public.chemi_settle_point_order(member,ord,'dev_points_100',999,'DONE'); raise exception 'amount accepted';
  exception when others then get stacked diagnostics msg = message_text; assert msg='POINT_ORDER_MISMATCH', msg; end;
  begin perform public.chemi_settle_point_order(other,ord,'dev_points_100',1000,'DONE'); raise exception 'foreign owner accepted';
  exception when others then get stacked diagnostics msg = message_text; assert msg='POINT_ORDER_MISMATCH', msg; end;
  assert pg_temp.balances(member)='3/0/3';
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  assert pg_temp.balances(member)='3/100/103', pg_temp.balances(member);
  raise notice 'topup: 3/0/3 -> DONE x2 -> %', pg_temp.balances(member);

  -- 2. purchase while holding both kinds: 3P price drains activity first, no paid used
  response := public.chemi_point_date(member,'dosa',day,payload,'test');
  assert response->>'balance'='100', response::text;
  assert pg_temp.balances(member)='0/100/100';
  -- next purchase uses paid only
  response := public.chemi_point_date(member,'dosa',day+1,payload,'test');
  assert pg_temp.balances(member)='0/97/97', pg_temp.balances(member);
  assert (select amount=-3 from public.chemi_paid_point_ledger where user_id=member and reason='chemi_purchase');
  raise notice 'purchase: activity first (3/100 -> 0/100), then paid (0/100 -> 0/97)';

  -- 3. activity 2 + paid 100: price 3 spends 2 activity then 1 paid
  member := pg_temp.new_member(2); ord := pg_temp.new_order(member);
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  response := public.chemi_point_date(member,'dosa',day,payload,'test');
  assert pg_temp.balances(member)='0/99/99', pg_temp.balances(member);
  assert (select amount=-1 from public.chemi_paid_point_ledger where user_id=member and reason='chemi_purchase');
  raise notice 'split: 2/100 -> price 3 -> %', pg_temp.balances(member);

  -- 4. shortage: nothing written, quote only
  member := pg_temp.new_member(2);
  response := public.chemi_point_date(member,'dosa',day,payload,'test');
  assert response='{"price":3,"balance":2}'::jsonb, response::text;
  assert pg_temp.balances(member)='2/0/2' and not exists(select from public.chemi_entitlements where user_id=member);

  -- 5. cancel after DONE removes the paid points; second cancel and late DONE change nothing
  member := pg_temp.new_member(3); ord := pg_temp.new_order(member);
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'CANCELED');
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'CANCELED');
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  assert pg_temp.balances(member)='3/0/3', pg_temp.balances(member);
  raise notice 'cancel x2 + late DONE: -> %', pg_temp.balances(member);

  -- 6. cancel arriving before approval records both legs
  ord2 := pg_temp.new_order(member);
  perform public.chemi_settle_point_order(member,ord2,'dev_points_100',1000,'CANCELED');
  assert pg_temp.balances(member)='3/0/3' and (select count(*)=2 from public.chemi_paid_point_ledger where order_id=ord2);

  -- 7. cancel after the paid points were spent needs review and writes nothing
  member := pg_temp.new_member(0); ord := pg_temp.new_order(member);
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  perform public.chemi_point_date(member,'dosa',day,payload,'test');
  assert pg_temp.balances(member)='0/97/97';
  begin perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'CANCELED'); raise exception 'refund accepted';
  exception when others then get stacked diagnostics msg = message_text; assert msg='POINT_REFUND_REVIEW', msg; end;
  assert pg_temp.balances(member)='0/97/97' and not exists(select from public.chemi_paid_point_ledger where order_id=ord and reason='cancel');
  raise notice 'refund after spending: POINT_REFUND_REVIEW, balance stays %', pg_temp.balances(member);

  -- 8. paid points cannot become a ticket: the exchange posts against the activity ledger only
  member := pg_temp.new_member(0); ord := pg_temp.new_order(member);
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  assert pg_temp.balances(member)='0/100/100';
  begin perform public.group_wallet_post(member,'fan_point',-100,'group_exchange',gen_random_uuid()); raise exception 'paid points exchanged';
  exception when others then get stacked diagnostics msg = message_text; assert msg<>'paid points exchanged', msg; raise notice 'activity-ledger exchange debit with paid-only wallet: %', msg; end;
  assert public.group_wallet_balance(member,'fan_point')=0 and pg_temp.balances(member)='0/100/100';
  begin perform public.exchange_owned_group_wallet(member,gen_random_uuid(),'v1','ticket',1); raise exception 'paid points exchanged';
  exception when others then get stacked diagnostics msg = message_text; assert msg<>'paid points exchanged', msg; raise notice 'exchange with paid-only wallet rejected: %', msg; end;
  assert pg_temp.balances(member)='0/100/100' and public.group_wallet_balance(member,'ticket')=0;

  -- 9. clients cannot call the ledger functions
  assert not has_function_privilege('authenticated','public.chemi_settle_point_order(uuid,uuid,text,integer,text)','execute');
  assert not has_function_privilege('authenticated','public.chemi_point_balances(uuid)','execute');
  assert not has_function_privilege('anon','public.chemi_debit_paid_points(uuid,uuid,integer)','execute');
  assert not has_table_privilege('authenticated','public.chemi_paid_point_ledger','select');
  assert has_function_privilege('service_role','public.chemi_point_date(uuid,text,date,jsonb,text)','execute');
  -- 10. ledger rows cannot be edited
  begin update public.chemi_paid_point_ledger set amount=amount+1; raise exception 'ledger edited';
  exception when others then get stacked diagnostics msg = message_text; assert msg<>'ledger edited', msg; end;
  raise notice 'point_ledger: all assertions passed';
end $$;
rollback;
