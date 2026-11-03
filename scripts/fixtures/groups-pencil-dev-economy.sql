-- Explicit synthetic credits; never masquerade as earned rewards or mint onchain assets.
begin;
set local lock_timeout='5s';
set local statement_timeout='55s';
select pg_advisory_xact_lock(hashtextextended('groups-pencil-dev-v1',0));
create temp table fixture_economy_actors(n integer primary key,actor uuid unique)on commit drop;
insert into fixture_economy_actors select n,('f1610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n;
do $$declare r record;identity jsonb;begin
 if current_setting('byus.groups_pencil_dev',true)is distinct from'SEED_GROUPS_PENCIL_DEV_ONLY' or jsonb_array_length(current_setting('byus.groups_pencil_identities')::jsonb)<>3 then raise exception 'DEV_FIXTURE_IDENTITY_CONFIRMATION';end if;
 for r in select *from fixture_economy_actors order by n loop
  select x into identity from jsonb_array_elements(current_setting('byus.groups_pencil_identities')::jsonb)x where (x->>'n')::int=r.n;
  if not exists(select 1 from public.app_users u where u.id=r.actor and u.status='active'and u.privy_user_id=coalesce(identity->>'privyUserId','fixture:groups-pencil-dev:'||r.n)and u.verified_email=coalesce(identity->>'email','groups-pencil-dev-'||r.n||'@example.test'))then raise exception 'DEV_FIXTURE_IDENTITY_COLLISION';end if;
  perform public.group_wallet_lock(r.actor);
 end loop;
 if not exists(select 1 from public.group_pages p join public.group_memberships m on m.page_id=p.id where p.id='f1630000-0000-4000-8000-000000000001'and p.status='published'and m.app_user_id='f1610000-0000-4000-8000-000000000001'and m.role='owner')then raise exception 'DEV_FIXTURE_PAGE_COLLISION';end if;
end $$;
create or replace function pg_temp.fixture_credit(n integer,asset text,amount bigint,slot integer)returns uuid language plpgsql as $$
declare actor uuid:=('f1610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;source uuid:=('f1750000-0000-4000-8000-'||lpad(slot::text,12,'0'))::uuid;entry uuid;existing jsonb;sequence bigint;begin
 if (select count(*)from public.fan_ticket_ledger where source_id=source)+(select count(*)from public.mobile_fan_economy_ledger where source_id=source)>1 then raise exception 'DEV_FIXTURE_LEDGER_COLLISION';end if;
 select row into existing from(select to_jsonb(l)||jsonb_build_object('asset','ticket')row from public.fan_ticket_ledger l where l.source_id=source union all select to_jsonb(l)from public.mobile_fan_economy_ledger l where l.source_id=source)rows;
 if existing is not null then
  if existing->>'app_user_id'<>actor::text or (existing->>'amount')::bigint<>amount or existing->>'source_type'<>'groups_pencil_dev_fixture'or existing->>'celebrity_id'is not null or existing->>'asset'<>asset then raise exception 'DEV_FIXTURE_LEDGER_COLLISION';end if;
  return (existing->>'id')::uuid;
 end if;
 if asset='ticket'then
  select coalesce(max(owner_sequence),0)+1 into sequence from public.fan_ticket_ledger where app_user_id=actor and celebrity_id is null;
  insert into public.fan_ticket_ledger(app_user_id,celebrity_id,entry_kind,amount,source_type,source_id,idempotency_key,policy_version,owner_sequence,resulting_balance)
  values(actor,null,case when amount>0 then 'credit'else 'debit'end,amount,'groups_pencil_dev_fixture',source,source,(select policy_version from public.reward_policy_activation where singleton),sequence,0)returning id into entry;
 else
  select coalesce(max(owner_sequence),0)+1 into sequence from public.mobile_fan_economy_ledger where app_user_id=actor and celebrity_id is null and mobile_fan_economy_ledger.asset=fixture_credit.asset;
  insert into public.mobile_fan_economy_ledger(app_user_id,celebrity_id,asset,amount,source_type,source_id,group_policy_version,owner_sequence,resulting_balance)
  values(actor,null,asset,amount,'groups_pencil_dev_fixture',source,'group-wallet-v1',sequence,0)returning id into entry;
 end if;return entry;
end $$;
do $$declare n integer;begin
 for n in 1..3 loop
  perform pg_temp.fixture_credit(n,'fan_point',240,n*10+1);
  perform pg_temp.fixture_credit(n,'support_voucher',2,n*10+2);
  perform pg_temp.fixture_credit(n,'ticket',case when n=2 then 42 else 12 end,n*10+3);
 end loop;
 for n in 4..6 loop perform pg_temp.fixture_credit(n,'ticket',90,n*10+3);end loop;
end $$;
do $$begin
 if exists(select 1 from public.group_raffles where id='f1740000-0000-4000-8000-000000000001'and(page_id<>'f1630000-0000-4000-8000-000000000001'or created_by<>'f1610000-0000-4000-8000-000000000001'or title<>'엔카이브 굿즈 추첨'or winner_quantity<>5 or per_user_limit<>100 or opens_at<>'2026-11-01T00:00:00Z'::timestamptz or closes_at<>'2026-11-07T09:00:00Z'::timestamptz or submission_days<>7 or fulfillment_method<>'physical_shipping'))then raise exception 'DEV_FIXTURE_RAFFLE_COLLISION';end if;
end $$;
insert into public.group_raffles(id,page_id,title,summary,winner_quantity,per_user_limit,opens_at,closes_at,submission_days,fulfillment_method,created_by)
values('f1740000-0000-4000-8000-000000000001','f1630000-0000-4000-8000-000000000001','엔카이브 굿즈 추첨','페이지 가입 회원 · 1인 최대 100장',5,100,'2026-11-01T00:00:00Z','2026-11-07T09:00:00Z',7,'physical_shipping','f1610000-0000-4000-8000-000000000001')on conflict(id)do nothing;
update public.group_raffles set image_url='/images/groups/nchive-prize-pencil.png'where id='f1740000-0000-4000-8000-000000000001'and image_url is null;
do $$declare n integer;quantity integer;entry uuid;actor uuid;key uuid;begin
 foreach n in array array[2,4,5,6]loop
  quantity:=case n when 2 then 30 else 90 end;
  actor:=('f1610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  key:=('f1760000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  entry:=pg_temp.fixture_credit(n,'ticket',-quantity,n*10+4);
  if exists(select 1 from public.group_raffle_entries where request_key=key and(app_user_id<>actor or raffle_id<>'f1740000-0000-4000-8000-000000000001'or amount<>quantity or ledger_id<>entry))then raise exception 'DEV_FIXTURE_ENTRY_COLLISION';end if;
  insert into public.group_raffle_entries(raffle_id,app_user_id,request_key,amount,ledger_id)values('f1740000-0000-4000-8000-000000000001',actor,key,quantity,entry)on conflict(app_user_id,request_key)do nothing;
 end loop;
end $$;
select jsonb_build_object('fixture','groups-pencil-dev-economy-v1','walletSeeded',true,'rafflesSeeded',true,'viewerTickets',public.group_wallet_balance('f1610000-0000-4000-8000-000000000002','ticket'));
commit;
