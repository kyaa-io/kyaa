-- Disposable local database only. No network calls or real Telegram sends.
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
select public.configure_telegram_cs_alerts('-1001234567891',true);
delete from public.telegram_cs_alert_outbox;
do $$
declare batch jsonb; token uuid; ids uuid[]; msg uuid; role_name text; failed boolean;
begin
  -- Fixture rows only: skip foreign keys and the capture trigger, keep the real claim and close functions.
  set local session_replication_role=replica;
  for i in 1..3 loop
    msg:=gen_random_uuid();
    insert into public.cs_messages(id,inquiry_id,actor_app_user_id,operation,body,idempotency_key,created_at)
      values(msg,gen_random_uuid(),gen_random_uuid(),'create','문의 '||i,gen_random_uuid(),clock_timestamp());
    insert into public.telegram_cs_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at)
      select 'cs_inquiry_created',msg,activation_id,chat_id,clock_timestamp() from public.telegram_cs_alert_settings where singleton;
  end loop;
  set local session_replication_role=origin;
  foreach role_name in array array['anon','authenticated'] loop
    perform pg_temp.expect(not has_function_privilege(role_name,'public.reject_telegram_cs_alert_rows(uuid,text,integer[])','execute'),'CS row rejection is service-only');
  end loop;
  perform pg_temp.expect(has_function_privilege('service_role','public.reject_telegram_cs_alert_rows(uuid,text,integer[])','execute'),'service can reject CS rows');

  batch:=public.claim_telegram_cs_alert_batch('-1001234567891');
  token:=(batch->>'batch_id')::uuid;
  perform pg_temp.expect(jsonb_array_length(batch->'alerts')=3,'three CS rows claimed');
  select array_agg(id order by created_at,id) into ids from public.telegram_cs_alert_outbox where batch_id=token;

  perform pg_temp.expect(not public.reject_telegram_cs_alert_rows(token,'-1009999999999',array[1]),'wrong chat is refused');
  failed:=false;
  begin perform public.reject_telegram_cs_alert_rows(token,'-1001234567891',array[4]);
  exception when raise_exception then failed:=sqlerrm='TELEGRAM_ROW_POSITION_INVALID'; end;
  perform pg_temp.expect(failed,'out-of-range position raises');

  perform pg_temp.expect(public.reject_telegram_cs_alert_rows(token,'-1001234567891',array[1]),'row 1 rejected');
  perform pg_temp.expect((select status='failed' and last_error='INVALID_PAYLOAD' and attempt_count=1 from public.telegram_cs_alert_outbox where id=ids[1]),'closed CS row failed with a code');
  perform pg_temp.expect((select count(*)=2 from public.telegram_cs_alert_outbox where batch_id=token and status='claimed'),'other CS rows stay claimed');

  update public.telegram_cs_alert_settings set next_send_at='-infinity' where singleton;
  perform pg_temp.expect(public.begin_telegram_cs_alert_send(token,'-1001234567891'),'begin remaining CS rows');
  perform pg_temp.expect(public.finish_telegram_cs_alert_batch(token,'sent',99,null),'finish remaining CS rows');
  perform pg_temp.expect((select count(*)=2 from public.telegram_cs_alert_outbox where status='sent'),'remaining CS rows sent');
  update public.telegram_cs_alert_settings set next_send_at='-infinity' where singleton;
  perform pg_temp.expect(public.claim_telegram_cs_alert_batch('-1001234567891') is null,'closed CS row is not claimed again');
end $$;
rollback;
