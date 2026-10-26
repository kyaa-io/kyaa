-- Disposable local database only. All fixtures roll back; no external sends.
begin;
select public.configure_telegram_alerts('-1001234567890',true);
delete from public.telegram_alert_outbox;
insert into public.telegram_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at,winner_count)
select 'draw_published',gen_random_uuid(),s.activation_id,s.chat_id,clock_timestamp(),1
from public.telegram_alert_settings s cross join generate_series(1,20);
do $$
declare batch jsonb; token uuid;
begin
  if public.claim_telegram_alert_batch_with_cs_content('-1009999999999') is not null then
    raise exception 'wrong destination claimed a batch';
  end if;
  batch:=public.claim_telegram_alert_batch_with_cs_content('-1001234567890');
  token:=(batch->>'batch_id')::uuid;
  -- Seven short events fit the existing 3600-unit budget; the old count cap allowed only five.
  if jsonb_array_length(batch->'alerts')<>7
    or (select count(*) from public.telegram_alert_outbox where status='pending')<>13 then
    raise exception 'larger batch must retain the existing text budget and defer overflow';
  end if;
  if public.claim_telegram_alert_batch_with_cs_content('-1001234567890') is not null then
    raise exception 'parallel claim bypassed the lease';
  end if;
  if not public.begin_telegram_alert_send(token,'-1001234567890')
    or not public.finish_telegram_alert_batch(token,'sent',123) then
    raise exception 'larger batch cannot complete';
  end if;
  if (select count(*) from public.telegram_alert_outbox where status='sent')<>7
    or public.claim_telegram_alert_batch_with_cs_content('-1001234567890') is not null then
    raise exception 'completion or room throttle changed';
  end if;
  raise notice 'PASS expanded Telegram batch, text budget, overflow, destination, lease and throttle';
end $$;
rollback;
