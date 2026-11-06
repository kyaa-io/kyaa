\set ON_ERROR_STOP on
-- Started conversations carry on. Ones that ended stay ended.
do $$
declare a uuid:='7a000000-0000-4000-8000-000000000001';
 st text;
begin
 if (select status from public.social_dm_conversations where id='7b000000-0000-4000-8000-000000000002')<>'accepted' then raise exception 'accepted conversation changed';end if;
 if (select status from public.social_dm_conversations where id='7b000000-0000-4000-8000-000000000003')<>'accepted' then raise exception 'friends who kept talking must carry on';end if;
 if (select status from public.social_dm_conversations where id='7b000000-0000-4000-8000-000000000004')<>'cancelled' then raise exception 'a silent cancelled conversation must stay ended';end if;
 if (select status from public.social_dm_conversations where id='7b000000-0000-4000-8000-000000000005')<>'cancelled' then raise exception 'non-friends must not be reopened';end if;
 perform public.send_social_dm_message(a,'7b000000-0000-4000-8000-000000000002','still going',gen_random_uuid());
 perform public.send_social_dm_message('7a000000-0000-4000-8000-000000000002','7b000000-0000-4000-8000-000000000002','still going too',gen_random_uuid());
 perform public.send_social_dm_message(a,'7b000000-0000-4000-8000-000000000003','still going',gen_random_uuid());
 begin perform public.send_social_dm_message(a,'7b000000-0000-4000-8000-000000000004','ended',gen_random_uuid());raise exception 'ended conversation accepted a message';exception when others then if sqlerrm<>'SOCIAL_FORBIDDEN' then raise;end if;end;
 st:=public.social_dm_request_state(a,'7a000000-0000-4000-8000-000000000004');
 if st<>'available' then raise exception 'a friend can ask again after it ended, got %',st;end if;
 raise notice 'PASS started conversations carry on';
end $$;
-- Fixture accounts leave no trace for later migrations, including the product events that sending wrote.
set session_replication_role=replica;
delete from public.social_dm_messages where conversation_id::text like '7b000000-%';
delete from public.social_dm_conversations where id::text like '7b000000-%';
delete from public.social_friendships where payload_hash='upgrade';
delete from public.fan_product_events where app_user_id::text like '7a000000-%';
delete from public.app_users where id::text like '7a000000-%';
set session_replication_role=origin;
