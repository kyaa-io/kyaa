-- Synthetic-only assertions for 20261219070000: one granted ad session buys N tickets in one exchange (N*100 points), the daily cap
-- counts exchanges (consumed sessions) not tickets, and every refusal leaves balances, session and receipts as they were. All changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.units_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected %',expected;end $$;
create function pg_temp.units_granted(owner uuid)returns uuid language plpgsql as $$declare ad uuid;begin
 ad:=(public.issue_owned_group_wallet_ad_session(owner,600,50,3600,10)->>'sessionId')::uuid;
 perform public.report_owned_group_wallet_ad_session(owner,ad,'shown',1);perform pg_sleep(1.1);
 if public.report_owned_group_wallet_ad_session(owner,ad,'granted',1)->>'status'<>'granted' then raise exception 'fixture session not granted';end if;
 return ad;end $$;
do $$
declare
 owner uuid:=extensions.gen_random_uuid();other uuid:=extensions.gen_random_uuid();
 ad uuid;k uuid:=extensions.gen_random_uuid();k2 uuid:=extensions.gen_random_uuid();answer jsonb;pt0 bigint;tk0 bigint;
begin
 update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=coalesce(migration_evidence_sha256,repeat('a',64)),rewards_start_on=least(coalesce(rewards_start_on,current_date),current_date-1);
 insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:ticket-units-'||owner,owner||'@example.test'),(other,'did:privy:ticket-units-'||other,other||'@example.test');
 perform public.group_wallet_post(owner,'fan_point',350,'group_check_in',extensions.gen_random_uuid());
 pt0:=public.group_wallet_balance(owner,'fan_point');tk0:=public.group_wallet_balance(owner,'ticket');
 if pt0<>350 or tk0<>0 then raise exception 'fixture balances wrong: % %',pt0,tk0;end if;

 -- Bounds and the session gate are unchanged.
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',3)',owner,extensions.gen_random_uuid()),'GROUP_WALLET_AD_SESSION_REQUIRED');
 ad:=pg_temp.units_granted(owner);
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',0,%L,10)',owner,extensions.gen_random_uuid(),ad),'GROUP_WALLET_INVALID');
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',1001,%L,10)',owner,extensions.gen_random_uuid(),ad),'GROUP_WALLET_INVALID');
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',3,%L,10)',other,extensions.gen_random_uuid(),ad),'GROUP_WALLET_AD_SESSION_INVALID');
 -- More tickets than the points cover: refused as a whole, the session stays unspent.
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',4,%L,10)',owner,extensions.gen_random_uuid(),ad),'GROUP_WALLET_INSUFFICIENT_BALANCE');
 if public.group_wallet_balance(owner,'fan_point')<>350 or public.group_wallet_balance(owner,'ticket')<>0
    or (select consumed_at from public.group_wallet_ad_sessions where id=ad) is not null
    or exists(select 1 from public.group_wallet_receipts where app_user_id=owner) then raise exception 'refused exchanges changed state';end if;

 -- One ad, three tickets.
 answer:=public.exchange_owned_group_wallet(owner,k,'group-wallet-v1','ticket',3,ad,10);
 if (answer->>'units')::int<>3 or (answer->>'pointsSpent')::int<>300 or (answer->>'replayed')::boolean then raise exception 'N exchange answer wrong: %',answer;end if;
 if public.group_wallet_balance(owner,'fan_point')<>50 or public.group_wallet_balance(owner,'ticket')<>3 then raise exception 'N exchange balances wrong';end if;
 if (select consumed_request_key from public.group_wallet_ad_sessions where id=ad)<>k
    or (select count(*) from public.group_wallet_ad_sessions where app_user_id=owner and consumed_at is not null)<>1 then raise exception 'one session must be consumed once';end if;
 if (select count(*) from public.mobile_fan_economy_ledger where app_user_id=owner and source_type='group_exchange' and source_id=k and asset='fan_point' and amount=-300)<>1
    or (select count(*) from public.fan_ticket_ledger where app_user_id=owner and source_type='group_exchange' and source_id=k and amount=3)<>1
    or (select count(*) from public.group_wallet_receipts where app_user_id=owner and request_key=k and input->>'units'='3')<>1 then raise exception 'one debit row, one credit row and one receipt expected';end if;

 -- Retry of the same request replays; another quantity under the same key conflicts.
 if public.exchange_owned_group_wallet(owner,k,'group-wallet-v1','ticket',3,ad,10)<>answer||'{"replayed":true}'::jsonb then raise exception 'replay differs';end if;
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',2,%L,10)',owner,k,ad),'GROUP_WALLET_REQUEST_CONFLICT');
 if public.group_wallet_balance(owner,'fan_point')<>50 or public.group_wallet_balance(owner,'ticket')<>3 then raise exception 'replay or conflict moved balances';end if;

 -- The daily cap counts exchanges: after one 3-ticket exchange, cap 2 leaves one exchange, cap 1 none.
 if (public.read_owned_group_wallet_exchanges_remaining(owner,2)->>'exchangesRemainingToday')::int<>1
    or (public.read_owned_group_wallet_exchanges_remaining(owner,1)->>'exchangesRemainingToday')::int<>0 then raise exception 'cap must count exchanges';end if;
 perform public.group_wallet_post(owner,'fan_point',200,'group_check_in',extensions.gen_random_uuid());
 ad:=pg_temp.units_granted(owner);
 perform pg_temp.units_error(format('select public.exchange_owned_group_wallet(%L,%L,''group-wallet-v1'',''ticket'',2,%L,1)',owner,k2,ad),'GROUP_WALLET_AD_DAILY_LIMIT');
 if public.group_wallet_balance(owner,'fan_point')<>250 or (select consumed_at from public.group_wallet_ad_sessions where id=ad) is not null then raise exception 'daily limit moved state';end if;
 answer:=public.exchange_owned_group_wallet(owner,k2,'group-wallet-v1','ticket',2,ad,2);
 if public.group_wallet_balance(owner,'fan_point')<>50 or public.group_wallet_balance(owner,'ticket')<>5 or (answer->>'units')::int<>2 then raise exception 'second exchange wrong: %',answer;end if;
 if (public.read_owned_group_wallet_exchanges_remaining(owner,2)->>'exchangesRemainingToday')::int<>0 then raise exception 'two exchanges must use a cap of two';end if;
 raise notice 'PASS group_wallet_ticket_units';
end $$;
rollback;
