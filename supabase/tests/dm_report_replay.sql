-- Isolated full-migration database only; fixtures roll back.
begin;
do $$
declare
 sender uuid:=extensions.gen_random_uuid();recipient uuid:=extensions.gen_random_uuid();outsider uuid:=extensions.gen_random_uuid();
 conversation uuid:=extensions.gen_random_uuid();message uuid:=extensions.gen_random_uuid();
 first_request uuid:=extensions.gen_random_uuid();next_request uuid:=extensions.gen_random_uuid();
 original jsonb;again jsonb;original_created timestamptz;original_report uuid;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values
 (sender,'did:privy:dm-replay-sender','dm-replay-sender@example.invalid'),
 (recipient,'did:privy:dm-replay-recipient','dm-replay-recipient@example.invalid'),
 (outsider,'did:privy:dm-replay-outsider','dm-replay-outsider@example.invalid');
 insert into public.social_dm_conversations(id,user_low_id,user_high_id,requester_id,status,request_id,payload_hash)
 values(conversation,least(sender,recipient),greatest(sender,recipient),sender,'accepted',extensions.gen_random_uuid(),md5('dm replay'));
 insert into public.social_dm_messages(id,conversation_id,sender_id,body,request_id,payload_hash)
 values(message,conversation,sender,'Harmless report replay fixture',extensions.gen_random_uuid(),md5('dm replay'));
 execute 'set local role service_role';
 original:=public.report_social_dm_message(recipient,message,'spam','Original details',first_request);
 execute 'reset role';
 original_report:=(original->>'id')::uuid;
 select created_at into strict original_created from public.social_dm_message_reports where id=original_report;
 execute 'set local role service_role';
 again:=public.report_social_dm_message(recipient,message,'harassment','Different details',next_request);
 if again is distinct from original or again->>'reported'<>'true'then raise exception 'new request did not return the existing success';end if;
 if public.report_social_dm_message(recipient,message,'harassment','Different details',next_request)is distinct from original then raise exception 'same request replay changed';end if;
 execute 'reset role';
 if(select count(*)from public.social_dm_message_reports where message_id=message and reporter_id=recipient)<>1
 or not exists(select 1 from public.social_dm_message_reports where id=original_report and created_at=original_created and reason='spam'and details='Original details'and request_id=first_request)then raise exception 'repeat changed the original report or timestamp';end if;
 if(select count(*)from public.content_reports where target_type='dm_message'and target_id=message and app_user_id=recipient)<>1
 or not exists(select 1 from public.content_reports where id=original_report and created_at=original_created and status='open')then raise exception 'repeat reset the deadline or duplicated the queue';end if;
 if not exists(select 1 from public.social_action_requests where actor_id=recipient and request_id=next_request and response=original)then raise exception 'new request outcome was not stored';end if;
 begin
 perform public.report_social_dm_message(outsider,message,'spam',null,extensions.gen_random_uuid());
 raise exception 'outsider reported private DM';
 exception when others then if sqlerrm<>'SOCIAL_NOT_FOUND'then raise;end if;end;
 begin
 perform public.report_social_dm_message(sender,message,'spam',null,extensions.gen_random_uuid());
 raise exception 'sender reported own DM';
 exception when others then if sqlerrm<>'SOCIAL_NOT_FOUND'then raise;end if;end;
 begin
 perform public.report_social_dm_message(recipient,message,'spam',null,next_request);
 raise exception 'request payload conflict was ignored';
 exception when others then if sqlerrm<>'SOCIAL_IDEMPOTENCY_CONFLICT'then raise;end if;end;
 if has_function_privilege('anon','public.report_social_dm_message(uuid,uuid,text,text,uuid)','execute')
 or has_function_privilege('authenticated','public.report_social_dm_message(uuid,uuid,text,text,uuid)','execute')
 or not has_function_privilege('service_role','public.report_social_dm_message(uuid,uuid,text,text,uuid)','execute')then raise exception 'DM report RPC role boundary changed';end if;
end $$;
rollback;
