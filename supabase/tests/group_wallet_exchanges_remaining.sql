-- Replay check for 20261209260000_group_wallet_exchanges_remaining.sql. Disposable clean-chain database only.
-- Run (own temporary PostgreSQL, applies every migration first):
--   BYUS_CLEAN_DB_PORT=55481 BYUS_CLEAN_DB_ASSERTION_FILE=$PWD/supabase/tests/group_wallet_exchanges_remaining.sql \
--     scripts/verify-clean-migration-chain.sh
-- Session rows cannot be deleted (append-only trigger), so the fixtures stay in the throwaway database.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
create function pg_temp.qty_assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',message;end if;raise notice 'PASS %',message;end $$;
create function pg_temp.qty_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise exception 'FAIL % raised %',statement,sqlerrm;end;raise exception 'FAIL % did not raise %',statement,expected;end $$;
create function pg_temp.qty_consume(owner uuid,at_time timestamptz)returns void language sql as $$
 insert into public.group_wallet_ad_sessions(app_user_id,issued_at,expires_at,shown_at,granted_at,consumed_at,consumed_request_key)
 values(owner,at_time-interval'2 hours',at_time+interval'1 day',at_time-interval'1 hour',at_time-interval'1 hour',at_time,extensions.gen_random_uuid())
$$;
create function pg_temp.qty_as(role_name text,statement text)returns text language plpgsql as $$declare r text;begin
 begin execute format('set local role %I',role_name);execute statement into r;execute 'reset role';return r;
 exception when others then execute 'reset role';return 'ERR:'||sqlerrm;end;end $$;
insert into public.app_users(id,privy_user_id,verified_email)values
 ('e9100000-0000-4000-8000-000000000001','did:privy:qty-a','qty-a@example.test'),
 ('e9100000-0000-4000-8000-000000000002','did:privy:qty-b','qty-b@example.test'),
 ('e9100000-0000-4000-8000-000000000003','did:privy:qty-c','qty-c@example.test');

-- 1. Re-applying the migration is harmless (create or replace, repeatable grants).
\ir ../migrations/20261209260000_group_wallet_exchanges_remaining.sql

-- 2. Privileges.
do $$declare fn regprocedure:='public.read_owned_group_wallet_exchanges_remaining(uuid,integer)'::regprocedure;begin
 perform pg_temp.qty_assert(has_function_privilege('service_role',fn,'execute')and not has_function_privilege('anon',fn,'execute')and not has_function_privilege('authenticated',fn,'execute')and not exists(select 1 from pg_proc p,aclexplode(p.proacl)x where p.oid=fn and x.grantee=0),'only service_role may execute the new reader');
 perform pg_temp.qty_assert(not has_function_privilege('service_role','public.group_wallet_ad_consumed_today(uuid)','execute')and not has_function_privilege('anon','public.group_wallet_ad_consumed_today(uuid)','execute')and not has_function_privilege('authenticated','public.group_wallet_ad_consumed_today(uuid)','execute'),'API roles cannot execute the consumed-today aggregate');
 perform pg_temp.qty_assert(not has_function_privilege('service_role','public.group_wallet_ad_need(integer[])','execute'),'API roles cannot execute the config check helper');
end $$;
select pg_temp.qty_assert(pg_temp.qty_as('service_role',$$select public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000001',3)::text$$)='{"exchangesRemainingToday": 3}','service_role reads the full cap when nothing is consumed');
select pg_temp.qty_assert(pg_temp.qty_as('service_role',$$select public.group_wallet_ad_consumed_today('e9100000-0000-4000-8000-000000000001')::text$$)like'ERR:permission denied%','service_role cannot call the aggregate directly');
select pg_temp.qty_assert(pg_temp.qty_as('authenticated',$$select public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000001',3)::text$$)like'ERR:permission denied%','authenticated cannot call the new reader');
select pg_temp.qty_assert(pg_temp.qty_as('anon',$$select public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000001',3)::text$$)like'ERR:permission denied%','anon cannot call the new reader');

-- 3. Values, KST midnight boundary, and isolation between accounts.
do $$declare a uuid:='e9100000-0000-4000-8000-000000000001';b uuid:='e9100000-0000-4000-8000-000000000002';ds timestamptz:=public.group_wallet_ad_day_start();begin
 perform pg_temp.qty_assert(ds=(date_trunc('day',clock_timestamp()at time zone'Asia/Seoul'))at time zone'Asia/Seoul','day start is Asia/Seoul midnight');
 perform pg_temp.qty_consume(a,ds-interval'1 microsecond');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(a,3)->>'exchangesRemainingToday'='3','a session consumed just before KST midnight is not counted');
 perform pg_temp.qty_consume(a,ds);
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(a,3)->>'exchangesRemainingToday'='2','a session consumed exactly at KST midnight is counted');
 perform pg_temp.qty_consume(b,ds+interval'1 second');perform pg_temp.qty_consume(b,ds+interval'2 seconds');perform pg_temp.qty_consume(b,ds+interval'3 seconds');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(a,3)->>'exchangesRemainingToday'='2','another account consumption does not change this value');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(b,3)->>'exchangesRemainingToday'='0','cap reached gives 0');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(b,2)->>'exchangesRemainingToday'='0','consumed above a lowered cap stays 0, not negative');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining(b,5)->>'exchangesRemainingToday'='2','a raised cap gives the difference');
 -- 5. Bad input.
 perform pg_temp.qty_error(format('select public.read_owned_group_wallet_exchanges_remaining(%L,-1)',a),'GROUP_WALLET_AD_CONFIG_MISSING');
 perform pg_temp.qty_error(format('select public.read_owned_group_wallet_exchanges_remaining(%L,0)',a),'GROUP_WALLET_AD_CONFIG_MISSING');
 perform pg_temp.qty_error(format('select public.read_owned_group_wallet_exchanges_remaining(%L,null)',a),'GROUP_WALLET_AD_CONFIG_MISSING');
 perform pg_temp.qty_assert(public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-0000000000ff',3)->>'exchangesRemainingToday'='3','unknown account reads as the full cap (nothing consumed, nothing leaked)');
end $$;

-- 4. Function owner differs from the helpers' owner (20261209150000 pattern).
create role qty_definer nologin;
alter function public.read_owned_group_wallet_exchanges_remaining(uuid,integer) owner to qty_definer;
do $q$begin
 perform pg_temp.qty_error($$select public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000001',3)$$,'permission denied');
 raise notice 'PASS without the grant a non-superuser owner is denied (this is what the grant block fixes)';
end $q$;
\ir ../migrations/20261209260000_group_wallet_exchanges_remaining.sql
select pg_temp.qty_assert(pg_temp.qty_as('service_role',$$select (public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000002',3)->>'exchangesRemainingToday')||(public.read_owned_group_wallet_exchanges_remaining('e9100000-0000-4000-8000-000000000001',3)->>'exchangesRemainingToday')$$)='02','different owner works after the migration grants its owner');
select pg_temp.qty_assert(pg_temp.qty_as('service_role',$$select public.group_wallet_ad_consumed_today('e9100000-0000-4000-8000-000000000001')::text$$)like'ERR:permission denied%','aggregate still closed to service_role with a different owner');
select pg_temp.qty_assert(not has_function_privilege('service_role','public.group_wallet_ad_consumed_today(uuid)','execute')and has_function_privilege('qty_definer','public.group_wallet_ad_consumed_today(uuid)','execute'),'aggregate stays closed to API roles; only the definer owner was granted');
