do $$begin if not (select enabled from public.fan_ticket_activity_policy where celebrity_id='57000000-0000-4000-8000-000000000002') then raise exception 'expansion disabled legacy policy';end if;raise notice 'PASS expansion_keeps_existing_legacy_policy';end $$;
-- Test-only historical cutover setup for the existing source fixtures.
create function pg_temp.fixture_mobile_fan_cutover() returns trigger language plpgsql as $$ begin
 if new.kind='earning' then insert into public.mobile_fan_earning_cutovers values(new.celebrity_id,new.id,new.effective_at,new.version) on conflict do nothing;end if;return new;end $$;
create trigger fixture_mobile_fan_cutover after insert on public.mobile_fan_economy_policies for each row execute function pg_temp.fixture_mobile_fan_cutover();
\ir mobile_fan_economy.sql
begin;
do $$declare intent jsonb;tx jsonb;begin
 intent:=public.mobile_store_create_intent('57000000-0000-4000-8000-000000000001','apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1','57000000-0000-4000-8000-000000000005','paid-campaign-v1','57000000-0000-4000-8000-000000000004');
 if intent->>'replayed'<>'true'then raise exception 'Legacy pending intent lost';end if;
 begin perform public.mobile_store_create_intent('57000000-0000-4000-8000-000000000001','apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1','57000000-0000-4000-8000-000000000005','paid-campaign-v1',extensions.gen_random_uuid());raise exception 'New legacy sale survived';exception when others then if sqlerrm<>'MOBILE_STORE_PRODUCT_UNAVAILABLE'then raise;end if;end;
 tx:=public.mobile_store_apply_owned_verified_transaction('57000000-0000-4000-8000-000000000001','apple','sandbox','upgrade-original-pending',(intent->>'id')::uuid,'kr.byus.ticket.10','KRW',1000,0,'purchased',repeat('a',64),now());
 if tx->>'state'<>'granted'or tx->>'ticketQuantity'<>'10'or tx->>'supportKrw'<>'100'then raise exception 'Original legacy receipt changed %',tx;end if;
 tx:=public.mobile_store_apply_owned_verified_transaction('57000000-0000-4000-8000-000000000001','apple','sandbox','upgrade-original-pending',(intent->>'id')::uuid,'kr.byus.ticket.10','KRW',1000,500,'purchased',repeat('b',64),now());
 if tx->>'refundedKrw'<>'500'or tx->>'supportKrw'<>'50'then raise exception 'Legacy refund recovery failed %',tx;end if;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values('57000000-0000-4000-8000-000000000002','dedup-fixture','earning','{"comment":50}',now()-interval'1 day');
 perform public.award_mobile_fan_activity('57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002','comment','once');
 if public.mobile_fan_economy_balance('57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002','fan_point')<>0 then raise exception 'Consumed historical grant duplicated as points';end if;
 raise notice 'PASS old pending intent/new legacy sale blocked/original legacy verification and refund';
end $$;rollback;

\ir mobile_fan_reward_sources.sql


\ir mobile_fan_certification_cutover.sql
\ir mobile_fan_membership_cutover.sql

\ir mobile_fan_free_lucky.sql

\ir mobile_fan_native_producers_cutover.sql
drop trigger fixture_mobile_fan_cutover on public.mobile_fan_economy_policies;
\ir mobile_fan_activation_correction.sql
