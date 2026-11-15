-- Disposable local database only. No network calls or real Telegram sends.
-- Rows are created through the real content_reports trigger and claimed through the real claim function.
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
insert into public.telegram_alert_settings(singleton) values(true) on conflict do nothing;
select public.configure_telegram_alerts('-1001234567890',true);
delete from public.telegram_alert_outbox;
do $$
declare u uuid:=gen_random_uuid(); batch jsonb; token uuid; ids uuid[]; n integer; role_name text; failed boolean;
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'reject-rows-'||u,'reject-rows-'||u||'@example.test','active');
  for i in 1..3 loop
    insert into public.content_reports(app_user_id,target_type,target_id,target_revision,reason,idempotency_key,created_at)
      values(u,'fan_post',gen_random_uuid(),1,'reject rows '||i,gen_random_uuid(),clock_timestamp());
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    perform pg_temp.expect(not has_function_privilege(role_name,'public.reject_telegram_alert_rows(uuid,text,integer[])','execute'),'row rejection is service-only');
  end loop;
  perform pg_temp.expect(has_function_privilege('service_role','public.reject_telegram_alert_rows(uuid,text,integer[])','execute'),'service can reject rows');

  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890');
  token:=(batch->>'batch_id')::uuid;
  perform pg_temp.expect(jsonb_array_length(batch->'alerts')=3 and batch#>>'{alerts,0,kind}'='content_report_created'
    and batch#>'{alerts,0,activity_quantity}'='null'::jsonb and batch#>'{alerts,0,activity_source_id}' is null,'content report claims in the shape the worker sees');
  select array_agg(id order by created_at,id) into ids from public.telegram_alert_outbox where batch_id=token;

  -- Wrong destination, wrong batch and out-of-range positions change nothing.
  perform pg_temp.expect(not public.reject_telegram_alert_rows(token,'-1009999999999',array[2]),'wrong chat is refused');
  perform pg_temp.expect(not public.reject_telegram_alert_rows(gen_random_uuid(),'-1001234567890',array[2]),'wrong batch is refused');
  failed:=false;
  begin perform public.reject_telegram_alert_rows(token,'-1001234567890',array[2,9]);
  exception when raise_exception then failed:=sqlerrm='TELEGRAM_ROW_POSITION_INVALID'; end;
  perform pg_temp.expect(failed,'out-of-range position raises');
  failed:=false;
  begin perform public.reject_telegram_alert_rows(token,'-1001234567890','{}');
  exception when raise_exception then failed:=sqlerrm='TELEGRAM_ROW_POSITION_INVALID'; end;
  perform pg_temp.expect(failed,'empty position list raises');
  perform pg_temp.expect((select count(*)=3 from public.telegram_alert_outbox where batch_id=token and status='claimed'),'refused calls leave every row claimed');

  -- Closing the middle row: only that row fails, with a code and one recorded attempt.
  perform pg_temp.expect(public.reject_telegram_alert_rows(token,'-1001234567890',array[2,2]),'row 2 rejected');
  perform pg_temp.expect((select status='failed' and last_error='INVALID_PAYLOAD' and attempt_count=1 and finished_at is not null and lease_expires_at is null
    from public.telegram_alert_outbox where id=ids[2]),'closed row failed with INVALID_PAYLOAD and one attempt');
  perform pg_temp.expect((select count(*)=2 from public.telegram_alert_outbox where batch_id=token and status='claimed'),'other rows stay claimed');
  perform pg_temp.expect((select batch_id=token from public.telegram_alert_settings where singleton),'batch lease is kept while rows remain');

  -- The rest sends in the same batch.
  update public.telegram_alert_settings set next_send_at='-infinity' where singleton;
  perform pg_temp.expect(public.begin_telegram_alert_send(token,'-1001234567890'),'begin for the remaining rows');
  perform pg_temp.expect(public.finish_telegram_alert_batch(token,'sent',4242,null),'finish remaining rows');
  perform pg_temp.expect((select count(*)=2 from public.telegram_alert_outbox where id in (ids[1],ids[3]) and status='sent' and attempt_count=1),'remaining rows sent');
  perform pg_temp.expect((select status='failed' and attempt_count=1 from public.telegram_alert_outbox where id=ids[2]),'closed row untouched by send');

  -- The closed row is never claimed again.
  update public.telegram_alert_settings set next_send_at='-infinity' where singleton;
  perform pg_temp.expect(public.claim_telegram_alert_batch_with_cs_content('-1001234567890') is null,'closed row is not claimed again');

  -- Closing every row releases the batch lease.
  insert into public.content_reports(app_user_id,target_type,target_id,target_revision,reason,idempotency_key,created_at)
    values(u,'notice',gen_random_uuid(),1,'reject all',gen_random_uuid(),clock_timestamp());
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890');
  token:=(batch->>'batch_id')::uuid;
  perform pg_temp.expect(public.reject_telegram_alert_rows(token,'-1001234567890',array[1]),'only row rejected');
  perform pg_temp.expect((select batch_id is null and lease_expires_at is null from public.telegram_alert_settings where singleton),'lease released when nothing remains');
  select count(*) into n from public.telegram_alert_outbox where status='failed' and last_error='INVALID_PAYLOAD';
  perform pg_temp.expect(n=2,'two rows closed in total');
end $$;
rollback;
