\set ON_ERROR_STOP on
\ir groups-pencil-dev-bind-identities.test.sql
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date+1;
create temp table economy_protected as select
 (select count(*)from public.blockchain_jobs)jobs,(select count(*)from public.fan_action_outbox)outbox,
 (select count(*)from public.telegram_alert_outbox)alerts,(select count(*)from public.fan_web_notification_intents)notifications;
\ir fixtures/groups-pencil-dev-economy.sql
do $$begin
 if public.group_wallet_balance('f1610000-0000-4000-8000-000000000002','fan_point')<>240 or public.group_wallet_balance('f1610000-0000-4000-8000-000000000002','support_voucher')<>2 or public.group_wallet_balance('f1610000-0000-4000-8000-000000000002','ticket')<>12 then raise exception 'Pencil wallet differs';end if;
 if(select sum(amount)from public.group_raffle_entries where raffle_id='f1740000-0000-4000-8000-000000000001')<>300 then raise exception 'Pencil raffle count differs';end if;
end $$;
\getenv fixture_repo PWD
create temp table fixture_economy_source as select regexp_replace(pg_read_file(:'fixture_repo'||'/scripts/fixtures/groups-pencil-dev-economy.sql'),'(?m)^begin;|^commit;','','g')sql;
-- A competing row with the same source cannot be silently accepted.
begin;
insert into public.fan_ticket_ledger(app_user_id,entry_kind,amount,source_type,source_id,idempotency_key,policy_version,owner_sequence,resulting_balance)
select 'f1610000-0000-4000-8000-000000000001','credit',1,'group_support','f1750000-0000-4000-8000-000000000023','f1770000-0000-4000-8000-000000000002',(select policy_version from public.reward_policy_activation where singleton),coalesce(max(owner_sequence),0)+1,0 from public.fan_ticket_ledger where app_user_id='f1610000-0000-4000-8000-000000000001'and celebrity_id is null;
do $$begin
 begin execute(select sql from fixture_economy_source);raise exception 'Expected collision';
 exception when raise_exception then if sqlerrm<>'DEV_FIXTURE_LEDGER_COLLISION'then raise;end if;end;
end $$;
rollback;
select public.group_wallet_post('f1610000-0000-4000-8000-000000000002','ticket',-1,'group_capsule','f1770000-0000-4000-8000-000000000001');
create temp table economy_before as select
 (select jsonb_agg(to_jsonb(l)order by id)from public.fan_ticket_ledger l)tickets,
 (select jsonb_agg(to_jsonb(l)order by id)from public.mobile_fan_economy_ledger l)economy,
 (select jsonb_agg(to_jsonb(l)order by id)from public.group_raffles l)raffles,
 (select jsonb_agg(to_jsonb(l)order by id)from public.group_raffle_entries l)entries;
\ir fixtures/groups-pencil-dev-economy.sql
do $$begin
 if(select tickets from economy_before)is distinct from(select jsonb_agg(to_jsonb(l)order by id)from public.fan_ticket_ledger l)or(select economy from economy_before)is distinct from(select jsonb_agg(to_jsonb(l)order by id)from public.mobile_fan_economy_ledger l)or(select raffles from economy_before)is distinct from(select jsonb_agg(to_jsonb(l)order by id)from public.group_raffles l)or(select entries from economy_before)is distinct from(select jsonb_agg(to_jsonb(l)order by id)from public.group_raffle_entries l)then raise exception 'Economy replay changed data';end if;
 if public.group_wallet_balance('f1610000-0000-4000-8000-000000000002','ticket')<>11 then raise exception 'Replay reset spent balance';end if;
 if(select jobs from economy_protected)<>(select count(*)from public.blockchain_jobs)or(select outbox from economy_protected)<>(select count(*)from public.fan_action_outbox)or(select alerts from economy_protected)<>(select count(*)from public.telegram_alert_outbox)or(select notifications from economy_protected)<>(select count(*)from public.fan_web_notification_intents)then raise exception 'Fixture emitted external effects';end if;
end $$;
begin;
update public.group_raffles set per_user_limit=1 where id='f1740000-0000-4000-8000-000000000001';
do $$begin
 begin execute(select sql from fixture_economy_source);raise exception 'Expected raffle collision';
 exception when raise_exception then if sqlerrm<>'DEV_FIXTURE_RAFFLE_COLLISION'then raise;end if;end;
end $$;
rollback;
-- A failure after a new credit must roll back that credit too.
do $$declare before_rows jsonb;begin
 select jsonb_agg(to_jsonb(l)order by id)into before_rows from public.fan_ticket_ledger l;
 begin
  execute(select sql from fixture_economy_source);
  perform pg_temp.fixture_credit(2,'ticket',1,99);
  raise exception 'FIXTURE_TEST_ROLLBACK';
 exception when raise_exception then if sqlerrm<>'FIXTURE_TEST_ROLLBACK'then raise;end if;end;
 if before_rows is distinct from(select jsonb_agg(to_jsonb(l)order by id)from public.fan_ticket_ledger l)then raise exception 'Failed seed retained partial credit';end if;
end $$;
