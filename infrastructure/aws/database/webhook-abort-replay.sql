-- Install once as the existing source operator; never changes source/public ACLs.
begin;
do $$ begin
 if current_user <> 'postgres' or session_user <> 'postgres'
    or not exists(select 1 from pg_catalog.pg_namespace n join pg_catalog.pg_roles r on r.oid=n.nspowner where n.nspname='_byus_migration' and r.rolname='postgres')
 then raise exception 'WEBHOOK_REPLAY_OPERATOR_REQUIRED'; end if;
end $$;
create table _byus_migration.webhook_abort_inbox (
 provider text not null,
 event_key text not null,
 body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 command_hash text not null,
 processed_at timestamptz not null default clock_timestamp(),
 primary key(provider,event_key)
);
create table _byus_migration.webhook_replay_control (
 run_id text primary key,
 mode text not null check(mode in ('hold','aborted','prepared-cancel-complete')),
 proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),
 authorized_at timestamptz not null default clock_timestamp()
);
revoke all on _byus_migration.webhook_abort_inbox,_byus_migration.webhook_replay_control from public,anon,authenticated,service_role;
create function _byus_migration.replay_aborted_webhook(p_run_id text,p_provider text,p_event_key text,p_body_hash text,p_commands jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c jsonb; a jsonb; expected text; prior text; command_hash text; old_update bigint;
 fence_run text; fence_value boolean; source_side text; source_present boolean := false;
 replay_mode text; proof text; barrier_present boolean;
begin
 if current_user <> 'postgres' or session_user <> 'postgres' then raise exception 'WEBHOOK_REPLAY_OPERATOR_REQUIRED'; end if;
 if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then raise exception 'WEBHOOK_REPLAY_READ_COMMITTED_REQUIRED'; end if;
 if p_run_id is null or p_run_id='' then raise exception 'WEBHOOK_REPLAY_RUN_REQUIRED'; end if;
 -- These leases are retained through the caller's COMMIT, including duplicate returns.
 select f.run_id,f.fenced into fence_run,fence_value from _byus_migration.auth_fence f where f.singleton for share;
 if not found or fence_run is distinct from p_run_id or fence_value is distinct from false then raise exception 'WEBHOOK_REPLAY_AUTH_FENCED'; end if;
 if pg_catalog.to_regclass('_byus_migration.state') is not null then
  select s.side,s.fenced into source_side,fence_value from _byus_migration.state s where s.run_id=p_run_id for share;
  if found then
   if source_side is distinct from 'source' or fence_value is distinct from false then raise exception 'WEBHOOK_REPLAY_SOURCE_FENCED'; end if;
   source_present := true;
  end if;
  perform 1 from _byus_migration.state s where s.side='source' and s.fenced is distinct from false for share;
  if found then raise exception 'WEBHOOK_REPLAY_SOURCE_FENCED'; end if;
 end if;
 select f.run_id,f.fenced into fence_run,fence_value from _byus_migration.storage_fence f where f.singleton for share;
 if not found or fence_run is distinct from p_run_id or fence_value is distinct from false then raise exception 'WEBHOOK_REPLAY_STORAGE_FENCED'; end if;
 select r.mode,r.proof_hash into replay_mode,proof from _byus_migration.webhook_replay_control r where r.run_id=p_run_id for share;
 if not found or proof is null or proof !~ '^[a-f0-9]{64}$' or replay_mode not in ('aborted','prepared-cancel-complete') then raise exception 'WEBHOOK_REPLAY_NOT_AUTHORIZED'; end if;
 if exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='byus_migration_guard') then raise exception 'WEBHOOK_REPLAY_PUBLIC_GUARD_PRESENT'; end if;
 if replay_mode='aborted' and not source_present then raise exception 'WEBHOOK_REPLAY_SOURCE_MISSING'; end if;
 if replay_mode='prepared-cancel-complete' then
  if source_present then raise exception 'WEBHOOK_REPLAY_PREPARED_SOURCE_PRESENT'; end if;
  if pg_catalog.to_regclass('_byus_barrier.barriers') is not null then
   select exists(select 1 from _byus_barrier.barriers) into barrier_present;
   if barrier_present then raise exception 'WEBHOOK_REPLAY_PREPARED_BARRIER_PRESENT'; end if;
  end if;
 end if;
 expected:=case p_provider when 'store-apple' then 'mobile_store_apply_entitlement_verified' when 'store-google' then 'mobile_store_apply_entitlement_verified' when 'apple-account' then 'apply_apple_account_notification' when 'solapi' then 'record_kakao_notification_receipt' when 'telegram' then 'ingest_telegram_bug_report' when 'instagram-deauthorize' then 'instagram_delete_subject' when 'instagram-deletion' then 'instagram_delete_subject' end;
 if expected is null or p_event_key is null or length(p_event_key) not between 1 and 1000 or p_body_hash is null or p_body_hash!~'^[a-f0-9]{64}$' or jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 100 or (p_provider<>'solapi' and jsonb_array_length(p_commands)<>1) then raise exception 'INVALID_WEBHOOK'; end if;
 command_hash:=encode(extensions.digest(p_commands::text,'sha256'),'hex');
 -- Serializes duplicate deliveries and keeps inbox+all business effects in this transaction.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webhook:'||p_provider||':'||p_event_key,0));
 select i.command_hash into prior from _byus_migration.webhook_abort_inbox i where i.provider=p_provider and i.event_key=p_event_key;
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
 insert into _byus_migration.webhook_abort_inbox(provider,event_key,body_hash,command_hash) values(p_provider,p_event_key,p_body_hash,command_hash);
 return true;
end $$;
revoke all on function _byus_migration.replay_aborted_webhook(text,text,text,text,jsonb) from public,anon,authenticated,service_role;
-- Fail closed if pre-existing operator default privileges granted another role access.
do $$ begin
 if exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where c.oid in ('_byus_migration.webhook_abort_inbox'::regclass,'_byus_migration.webhook_replay_control'::regclass) and a.grantee<>c.relowner)
 or exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid='_byus_migration.replay_aborted_webhook(text,text,text,text,jsonb)'::regprocedure and a.grantee<>p.proowner)
 then raise exception 'WEBHOOK_REPLAY_PRIVATE_ACL_REQUIRED'; end if;
end $$;
commit;
