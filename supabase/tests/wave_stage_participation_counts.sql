-- Synthetic fixtures only; all mutations roll back in a disposable local database.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required';end if;end $$;
begin;
\ir wave_stage_upgrade_before.sql
create function pg_temp.expect_count_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;else raise;end if;end;raise exception 'Expected %',expected;end $$;
do $$
declare actor uuid:='92900000-0000-4000-8000-000000000001';admin_id uuid:='92900000-0000-4000-8000-000000000002';
 owner_id uuid:=md5('wave-stage-fixture:1')::uuid;creator_id uuid;wena_id uuid;message_id uuid;result jsonb;items jsonb;checked_at timestamptz:=clock_timestamp();
 contract text:='0x'||repeat('a',40);hash text:='0x'||repeat('b',64);target jsonb;expected bigint;
begin
 select id into strict creator_id from public.celebrities where slug='changha';select id into strict wena_id from public.celebrities where slug='wena';
 assert not has_table_privilege('anon','public.participation_count_snapshot','SELECT');
 assert not has_table_privilege('authenticated','public.participation_count_snapshot','SELECT');
 assert not has_function_privilege('authenticated','public.store_participation_count_snapshot(text,text,text,timestamptz,jsonb,text,text)','EXECUTE');
 assert has_function_privilege('service_role','public.store_participation_count_snapshot(text,text,text,timestamptz,jsonb,text,text)','EXECUTE');
 perform pg_temp.expect_count_error(format('select public.read_admin_wave_stage_participation(%L,%L)',owner_id,admin_id),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_count_error(format('select public.read_admin_wave_stage_participation(%L,%L,''wrong'')',actor,admin_id),'FAN_WEB_INVALID_INPUT');
 update public.admin_allowlist set role='viewer' where id=admin_id;
 result:=public.read_admin_wave_stage_participation(actor,admin_id);
 assert result->'onchain'->>'state'='unavailable' and result->'creators'->0->>'comments'='0';
 assert not(result ? 'missions');
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values
  (owner_id,creator_id,'First fixture',extensions.gen_random_uuid(),'2026-01-01T00:00:00Z'),
  (owner_id,creator_id,'Second fixture',extensions.gen_random_uuid(),'2026-01-01T00:00:01Z'),
  (owner_id,wena_id,'Other creator',extensions.gen_random_uuid(),'2026-01-01T00:00:00Z');
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at,removed_at) values
  (owner_id,creator_id,'Removed fixture',extensions.gen_random_uuid(),'2026-01-01T00:00:00Z',clock_timestamp());
 result:=public.read_admin_wave_stage_participation(actor,admin_id);
 assert result->'creators'->0->>'comments'='2' and result->'creators'->0->>'engagedFans'='1';
 assert result->'creators'->1->>'comments'='1' and result->'creators'->1->>'engagedFans'='1';
 assert not(result::text ~ '(appUserId|email|wallet|source_id|participant|body|salt)');
 update public.participation_config set contract_address=contract,relayer='0x'||repeat('c',40);
 select jsonb_agg((c-array['name','pending','failed'])||jsonb_build_object('scope',scope) order by c->>'slug',scope) into items
 from jsonb_array_elements(result->'creators') c cross join unnest(array['all','event-day']) scope;
 perform public.store_participation_count_snapshot(contract,'100',hash,checked_at,items,'included','80');
 result:=public.read_admin_wave_stage_participation(actor,admin_id);
 assert result->'onchain'->>'state'='available' and result->'onchain'->>'finality'='included';
 assert result->'onchain'->>'blockNumber'='100' and result->'onchain'->>'finalizedBlockNumber'='80';
 assert result->'onchain'->'creators'->0->>'comments'='2';
 assert (result->'creators'->0->>'pending')::integer>=2,'matching counts do not imply finality';
 perform public.store_participation_count_snapshot(contract,'99',hash,checked_at+interval '1 second',items,'included','80');
 assert(select block_number=100 from public.participation_count_snapshot),'reject old block rollback';
 perform pg_temp.expect_count_error(format('select public.store_participation_count_snapshot(%L,''101'',%L,%L,%L,''finalized'',''80'')',contract,hash,checked_at,items),'PARTICIPATION_SNAPSHOT_INVALID');
 perform pg_temp.expect_count_error(format('select public.store_participation_count_snapshot(%L,''101'',%L,%L,%L,''included'',''80'')',contract,hash,checked_at,jsonb_set(items,'{0,comments}','"2"'::jsonb)),'PARTICIPATION_SNAPSHOT_INVALID');
 perform pg_temp.expect_count_error(format('select public.store_participation_count_snapshot(%L,''101'',%L,%L,%L,''included'',''80'')',contract,hash,checked_at,jsonb_set(items,'{0,comments}','9007199254740992'::jsonb)),'PARTICIPATION_SNAPSHOT_INVALID');
 perform pg_temp.expect_count_error(format('select public.store_participation_count_snapshot(%L,''101'',%L,%L,%L,''included'',''80'')',contract,hash,checked_at,jsonb_set(items,'{1}',items->0)),'PARTICIPATION_SNAPSHOT_INVALID');
 select id into message_id from public.fan_lounge_messages where celebrity_id=creator_id and removed_at is null order by created_at limit 1;
 update public.fan_lounge_messages set removed_at=clock_timestamp() where id=message_id;
 result:=public.read_admin_wave_stage_participation(actor,admin_id);
 assert result->'creators'->0->>'comments'='1' and result->'onchain'->'creators'->0->>'comments'='2';
 update public.app_users set status='disabled' where id=owner_id;
 result:=public.read_admin_wave_stage_participation(actor,admin_id);
 assert result->'creators'->0->>'comments'='0' and result->'creators'->1->>'engagedFans'='0';
 update public.app_users set status='active' where id=owner_id;
 insert into public.fan_lounge_messages(app_user_id,celebrity_id,body,idempotency_key,created_at) values
  (owner_id,creator_id,'Before boundary',extensions.gen_random_uuid(),'2026-10-21T14:59:59.999999Z'),
  (owner_id,creator_id,'At boundary',extensions.gen_random_uuid(),'2026-10-21T15:00:00Z'),
  (owner_id,creator_id,'Next day',extensions.gen_random_uuid(),'2026-10-22T15:00:00Z');
 result:=public.read_admin_wave_stage_participation(actor,admin_id,'event-day');
 expected:=case when statement_timestamp()>'2026-10-21T15:00:00Z'::timestamptz then 1 else 0 end;
 assert (result->'creators'->0->>'comments')::bigint=expected;
 assert (result->>'from')::timestamptz='2026-10-21T15:00:00Z'::timestamptz;
 select value into target from jsonb_array_elements(public.list_participation_count_targets()) where value->>'slug'='changha' and value->>'scope'='event-day';
 assert target->>'creator'='0x'||rpad(encode(convert_to('changha','UTF8'),'hex'),64,'0');
 assert (target->>'day')::bigint=((1792594800+32400)/86400+1);
end $$;
rollback;
