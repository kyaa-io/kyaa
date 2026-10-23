begin;
create table public.webhook_intake_inbox (
 provider text not null,
 event_key text not null,
 body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 command_hash text not null,
 processed_at timestamptz not null default clock_timestamp(),
 primary key(provider,event_key)
);
alter table public.webhook_intake_inbox enable row level security;
alter table public.webhook_intake_inbox force row level security;
revoke all on public.webhook_intake_inbox from public,anon,authenticated,service_role;
create function public.replay_buffered_webhook(p_provider text,p_event_key text,p_body_hash text,p_commands jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c jsonb; a jsonb; expected text; prior text; command_hash text; old_update bigint;
begin
 expected:=case p_provider when 'store-apple' then 'mobile_store_apply_entitlement_verified' when 'store-google' then 'mobile_store_apply_entitlement_verified' when 'apple-account' then 'apply_apple_account_notification' when 'solapi' then 'record_kakao_notification_receipt' when 'telegram' then 'ingest_telegram_bug_report' when 'instagram-deauthorize' then 'instagram_delete_subject' when 'instagram-deletion' then 'instagram_delete_subject' end;
 if expected is null or p_event_key is null or length(p_event_key) not between 1 and 1000 or p_body_hash is null or p_body_hash!~'^[a-f0-9]{64}$' or jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 100 or (p_provider<>'solapi' and jsonb_array_length(p_commands)<>1) then raise exception 'INVALID_WEBHOOK'; end if;
 command_hash:=encode(extensions.digest(p_commands::text,'sha256'),'hex');
 -- Serializes duplicate deliveries and keeps inbox+all business effects in this transaction.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webhook:'||p_provider||':'||p_event_key,0));
 select i.command_hash into prior from public.webhook_intake_inbox i where i.provider=p_provider and i.event_key=p_event_key;
 if found then
   if prior<>command_hash then raise exception 'WEBHOOK_EVENT_CONFLICT'; end if;
   return false;
 end if;
 for c in select value from jsonb_array_elements(p_commands) loop
  if c->>'name' is distinct from expected or jsonb_typeof(c->'args') is distinct from 'object' then raise exception 'INVALID_WEBHOOK_OPERATION'; end if;
  a:=c->'args';
  case expected
   when 'mobile_store_apply_entitlement_verified' then
    if (p_provider='store-apple' and a->>'p_store'<>'apple') or (p_provider='store-google' and a->>'p_store'<>'google') then raise exception 'INVALID_WEBHOOK_STORE'; end if;
    perform public.mobile_store_apply_entitlement_verified(a->>'p_store',a->>'p_environment',a->>'p_external_transaction_id',(a->>'p_profile_id')::uuid,a->>'p_product_id',a->>'p_currency',(a->>'p_amount_krw')::bigint,(a->>'p_refunded_krw')::bigint,a->>'p_store_state',a->>'p_verification_fingerprint',(a->>'p_store_event_at')::timestamptz);
   when 'apply_apple_account_notification' then perform public.apply_apple_account_notification(a->'p_event');
   when 'record_kakao_notification_receipt' then perform public.record_kakao_notification_receipt((a->>'p_delivery_id')::uuid,a->>'p_provider_message_id',a->>'p_group_id');
   when 'instagram_delete_subject' then perform public.instagram_delete_subject(a->>'p_scoped_id',(a->>'p_issued_at')::timestamptz,a->>'p_confirmation_hash');
   when 'ingest_telegram_bug_report' then
    -- Redelivery of an old message must never roll back a later edit, including edits received outside the buffer.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram:'||(a->>'p_telegram_chat_id')||':'||(a->>'p_telegram_message_id'),0));
    select telegram_update_id into old_update from public.telegram_bug_reports where telegram_chat_id=(a->>'p_telegram_chat_id')::bigint and telegram_message_id=(a->>'p_telegram_message_id')::bigint for update;
    if not found or old_update<(a->>'p_telegram_update_id')::bigint then
     perform public.ingest_telegram_bug_report((a->>'p_telegram_update_id')::bigint,(a->>'p_telegram_message_id')::bigint,(a->>'p_telegram_chat_id')::bigint,a->>'p_update_kind',(a->>'p_message_sent_at')::timestamptz,(a->>'p_message_edited_at')::timestamptz,a->'p_sender',a->>'p_report_text',a->'p_media',(a->>'p_reply_to_message_id')::bigint);
    end if;
   else raise exception 'INVALID_WEBHOOK_OPERATION';
  end case;
 end loop;
 insert into public.webhook_intake_inbox(provider,event_key,body_hash,command_hash) values(p_provider,p_event_key,p_body_hash,command_hash);
 return true;
end $$;
revoke all on function public.replay_buffered_webhook(text,text,text,jsonb) from public,anon,authenticated;
do $$ begin if not exists(select 1 from pg_roles where rolname='webhook_replay_executor') then create role webhook_replay_executor nologin; end if; end $$;
grant usage on schema public to webhook_replay_executor;
grant execute on function public.replay_buffered_webhook(text,text,text,jsonb) to service_role,webhook_replay_executor;
commit;
