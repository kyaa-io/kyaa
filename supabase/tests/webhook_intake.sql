begin;
create function pg_temp.webhook_assert(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare commands jsonb; result boolean; before_count bigint; update_id bigint:=900000000000000; report uuid;
begin
 commands:=jsonb_build_array(jsonb_build_object('name','instagram_delete_subject','args',jsonb_build_object('p_scoped_id','9999999999991','p_issued_at',clock_timestamp(),'p_confirmation_hash',repeat('a',64))));
 result:=public.replay_buffered_webhook('instagram-deletion','fixture-event',repeat('b',64),commands);
 perform pg_temp.webhook_assert(result,'first webhook not applied');
 perform pg_temp.webhook_assert(exists(select 1 from public.instagram_deletion_receipts where confirmation_hash=repeat('a',64)),'business receipt missing');
 perform pg_temp.webhook_assert(not public.replay_buffered_webhook('instagram-deletion','fixture-event',repeat('b',64),commands),'duplicate applied');
 begin
  perform public.replay_buffered_webhook('instagram-deletion','fixture-event',repeat('b',64),jsonb_set(commands,'{0,args,p_confirmation_hash}',to_jsonb(repeat('c',64))));
  raise exception 'expected duplicate conflict';
 exception when others then if sqlerrm='expected duplicate conflict' then raise; end if; end;
 select count(*) into before_count from public.webhook_intake_inbox;
 begin
  perform public.replay_buffered_webhook('solapi','fixture-rollback',repeat('b',64),jsonb_build_array(jsonb_build_object('name','record_kakao_notification_receipt','args',jsonb_build_object('p_delivery_id','not-a-uuid'))));
  raise exception 'expected business failure';
 exception when others then if sqlerrm='expected business failure' then raise; end if; end;
 perform pg_temp.webhook_assert((select count(*) from public.webhook_intake_inbox)=before_count,'failed business call left inbox success');
 begin
  perform public.replay_buffered_webhook('instagram-deletion','fixture-arbitrary',repeat('b',64),'[{"name":"begin_owned_account_deletion","args":{}}]');
  raise exception 'expected allowlist failure';
 exception when others then if sqlerrm='expected allowlist failure' then raise; end if; end;
 commands:=jsonb_build_array(jsonb_build_object('name','ingest_telegram_bug_report','args',jsonb_build_object('p_telegram_update_id',update_id,'p_telegram_message_id',900000000000001,'p_telegram_chat_id',-5187701508,'p_update_kind','edited_message','p_message_sent_at',clock_timestamp(),'p_message_edited_at',clock_timestamp(),'p_sender','{}'::jsonb,'p_report_text','latest fixture','p_media','[]'::jsonb)));
 perform public.replay_buffered_webhook('telegram','fixture-edit',repeat('d',64),commands);
 commands:=jsonb_set(jsonb_set(commands,'{0,args,p_telegram_update_id}',to_jsonb(update_id-1)),'{0,args,p_report_text}','"stale fixture"');
 perform public.replay_buffered_webhook('telegram','fixture-stale',repeat('e',64),commands);
 perform pg_temp.webhook_assert((select report_text='latest fixture' from public.telegram_bug_reports where telegram_chat_id=-5187701508 and telegram_message_id=900000000000001),'old buffered Telegram event overwrote later edit');
 perform pg_temp.webhook_assert(not has_table_privilege('service_role','public.webhook_intake_inbox','select'),'service role can read inbox');
 perform pg_temp.webhook_assert(not has_function_privilege('anon','public.replay_buffered_webhook(text,text,text,jsonb)','execute'),'anonymous replay allowed');
 perform pg_temp.webhook_assert(has_function_privilege('webhook_replay_executor','public.replay_buffered_webhook(text,text,text,jsonb)','execute'),'worker executor missing');
end $$;
-- Controlled business-RPC fault proves earlier effects in the same batch roll back too.
create temporary table webhook_fixture_effects(value text);
create or replace function public.record_kakao_notification_receipt(p_delivery_id uuid,p_provider_message_id text,p_group_id text)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 if p_provider_message_id='fixture-fail' then raise exception 'FIXTURE_BUSINESS_FAILURE'; end if;
 insert into pg_temp.webhook_fixture_effects values(p_provider_message_id); return true;
end $$;
do $$ declare commands jsonb; begin
 commands:=jsonb_build_array(
  jsonb_build_object('name','record_kakao_notification_receipt','args',jsonb_build_object('p_delivery_id',extensions.gen_random_uuid(),'p_provider_message_id','fixture-first','p_group_id','fixture-group')),
  jsonb_build_object('name','record_kakao_notification_receipt','args',jsonb_build_object('p_delivery_id',extensions.gen_random_uuid(),'p_provider_message_id','fixture-fail','p_group_id','fixture-group')));
 begin
  perform public.replay_buffered_webhook('solapi','fixture-atomic-batch',repeat('f',64),commands);
  raise exception 'expected injected business failure';
 exception when others then if sqlerrm<>'FIXTURE_BUSINESS_FAILURE' then raise; end if; end;
 perform pg_temp.webhook_assert(not exists(select 1 from pg_temp.webhook_fixture_effects),'partial batch business effect survived rollback');
 perform pg_temp.webhook_assert(not exists(select 1 from public.webhook_intake_inbox where provider='solapi' and event_key='fixture-atomic-batch'),'failed batch committed inbox');
end $$;
rollback;
