-- Local fixtures only; all changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); allow_id uuid:=gen_random_uuid(); inquiry uuid; batch jsonb; old_batch jsonb; token uuid; outcome text; expected text;
begin
 insert into public.app_users(id,privy_user_id,verified_email,status) values
 (fan,'did:privy:cs-room-test','cs-room@example.invalid','active'),
 (adm,'did:privy:cs-room-admin','cs-room-admin@example.invalid','active');
 insert into public.admin_allowlist(id,email,role,active) values(allow_id,'cs-room-admin@example.invalid','operator',true);
 perform public.configure_telegram_cs_alerts(null,false);
 inquiry:=(public.cs_create(fan,'Before activation','Before activation','ko',gen_random_uuid())->>'id')::uuid;
 perform public.configure_telegram_alerts('-123455',true);
 perform public.configure_telegram_cs_alerts('-123456',true);
 update public.telegram_alert_settings set activated_at=now()-interval '1 second';
 update public.telegram_cs_alert_settings set activated_at=now()-interval '1 second';
 if exists(select 1 from public.telegram_cs_alert_outbox) then raise exception 'backfilled preactivation'; end if;
 inquiry:=(public.cs_create(fan,'CS room test','Fixture body','ko',gen_random_uuid())->>'id')::uuid;
 perform public.cs_post(fan,inquiry,'Followup',gen_random_uuid());
 perform public.cs_post(adm,inquiry,'Admin response',gen_random_uuid(),allow_id,gen_random_uuid());
 if (select count(*) from public.telegram_cs_alert_outbox)<>2 then raise exception 'customer capture or admin exclusion'; end if;
 if (select count(*) from public.telegram_alert_outbox where kind like 'cs_%' and activation_id=(select activation_id from public.telegram_alert_settings))<>2 then raise exception 'old room capture changed'; end if;
 if public.claim_telegram_cs_alert_batch('-999999') is not null then raise exception 'wrong destination'; end if;
 batch:=public.claim_telegram_cs_alert_batch('-123456');
 if jsonb_array_length(batch->'alerts')<>2 or batch->'alerts'->0->>'message_body' <> 'Fixture body' then raise exception 'content missing'; end if;
 old_batch:=public.claim_telegram_alert_batch_with_cs_content('-123455');
 if jsonb_array_length(old_batch->'alerts')<>2 then raise exception 'old queue blocked by CS claim'; end if;
 if not public.begin_telegram_alert_send((old_batch->>'batch_id')::uuid,'-123455') then raise exception 'old begin failed'; end if;
 perform public.finish_telegram_alert_batch((old_batch->>'batch_id')::uuid,'sent',987,null);
 token:=(batch->>'batch_id')::uuid;
 if not public.begin_telegram_cs_alert_send(token,'-123456') then raise exception 'begin missing'; end if;
 perform public.finish_telegram_cs_alert_batch(token,'unknown',null,null);
 if exists(select 1 from public.telegram_alert_outbox where kind like 'cs_%' and activation_id=(select activation_id from public.telegram_alert_settings) and status<>'sent') then raise exception 'new failure changed old status'; end if;
 update public.telegram_cs_alert_settings set next_send_at='-infinity';
 if public.claim_telegram_cs_alert_batch('-123456') is not null then raise exception 'uncertain delivery retried'; end if;
 if (select count(*) from public.telegram_cs_alert_outbox where status='delivery_unknown')<>2 then raise exception 'uncertain state missing'; end if;
 foreach outcome in array array['sent','throttled','rejected','expired'] loop
  perform public.cs_post(fan,inquiry,'Lifecycle '||outcome,gen_random_uuid());
  update public.telegram_cs_alert_settings set next_send_at='-infinity';
  batch:=public.claim_telegram_cs_alert_batch('-123456'); token:=(batch->>'batch_id')::uuid;
  if token is null then raise exception 'missing lifecycle claim'; end if;
  -- Claimed-but-unsent leases may safely recover.
  update public.telegram_cs_alert_outbox set lease_expires_at=now()-interval '1 second' where batch_id=token;
  update public.telegram_cs_alert_settings set lease_expires_at=now()-interval '1 second';
  batch:=public.claim_telegram_cs_alert_batch('-123456'); token:=(batch->>'batch_id')::uuid;
  if token is null or not public.begin_telegram_cs_alert_send(token,'-123456') then raise exception 'claim recovery failed'; end if;
  if outcome='expired' then
   update public.telegram_cs_alert_outbox set lease_expires_at=now()-interval '1 second' where batch_id=token;
   perform public.maintain_telegram_cs_alerts(); expected:='delivery_unknown';
  else
   perform public.finish_telegram_cs_alert_batch(token,outcome,case when outcome='sent' then 988 else null end,60);
   expected:=case outcome when 'sent' then 'sent' when 'throttled' then 'pending' else 'failed' end;
  end if;
  if not exists(select 1 from public.telegram_cs_alert_outbox where batch_id=token and status=expected) then raise exception 'wrong outcome %',outcome; end if;
  if outcome='sent' and not exists(select 1 from public.telegram_cs_alert_outbox c join public.telegram_alert_outbox o on o.source_id=c.source_id and o.kind=c.kind where c.batch_id=token and c.status='sent' and o.status='pending') then raise exception 'new success changed old pending state'; end if;
  if outcome='throttled' then
   if public.claim_telegram_cs_alert_batch('-123456') is not null then raise exception 'throttle bypassed'; end if;
   update public.telegram_cs_alert_outbox set available_at=now()-interval '1 second' where batch_id=token;
   update public.telegram_cs_alert_settings set next_send_at='-infinity';
   batch:=public.claim_telegram_cs_alert_batch('-123456'); token:=(batch->>'batch_id')::uuid;
   if token is null or not public.begin_telegram_cs_alert_send(token,'-123456') then raise exception 'throttle retry missing'; end if;
   perform public.finish_telegram_cs_alert_batch(token,'sent',989,null);
  end if;
 end loop;
 update public.telegram_cs_alert_settings set next_send_at='-infinity';
 if public.claim_telegram_cs_alert_batch('-123456') is not null then raise exception 'terminal or expired send retried'; end if;
 if has_function_privilege('service_role','public.configure_telegram_cs_alerts(text,boolean)','execute') then raise exception 'configuration exposed'; end if;
end $$;
rollback;
