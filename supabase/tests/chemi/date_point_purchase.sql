-- Disposable local database. Start with nine activity points and one paid point.
begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
do $$
declare
  member uuid := gen_random_uuid();
  ord uuid := gen_random_uuid();
  day date := public.dukjil_kst_date()+1;
  payload jsonb := '{"locked":false,"score":75}';
  response jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(member,'did:privy:'||member,member||'@example.invalid');
  perform public.group_wallet_post(member,'fan_point',9,'chemi_reward',gen_random_uuid());
  insert into public.chemi_point_orders(id,user_id) values(ord,member);
  perform public.chemi_settle_point_order(member,ord,'dev_points_100',1000,'DONE');
  insert into public.chemi_paid_point_ledger(user_id,reason,purchase_id,amount) values(member,'chemi_purchase',gen_random_uuid(),-99);
  response := public.chemi_point_date(member,'dosa',day,null,'test');
  assert response = '{"price":10,"balance":10}';
  raise notice 'before: activity=9 paid=1 entitlement=0';
  begin
    perform public.chemi_point_date(member,'dosa',day,payload,repeat('x',50));
    raise exception 'expected result storage failure';
  exception when check_violation then null;
  end;
  assert (select total_points=10 from public.chemi_point_balances(member));
  assert not exists(select from public.chemi_entitlements where user_id=member);
  response := public.chemi_point_date(member,'dosa',day,payload,'test');
  assert response->>'balance'='0';
  assert (public.chemi_point_date(member,'dosa',day,payload,'test')->>'replayed')::boolean;
  assert public.chemi_point_date(member,'dosa',day+1,payload,'test')='{"price":10,"balance":0}';
  assert (select activity_points=0 and paid_points=0 from public.chemi_point_balances(member));
  assert (select count(*)=1 from public.chemi_entitlements where user_id=member);
  raise notice 'after: activity=0 paid=0 entitlement=1';
end $$;
rollback;
