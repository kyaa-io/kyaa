-- A second client request for an already reported DM preserves the first report.
create or replace function public.report_social_dm_message(p_app_user_id uuid,p_message_id uuid,p_reason text,p_details text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report_id uuid; replay jsonb; result jsonb;
 operation text:='report-message:'||p_message_id::text;
 payload text:=md5(p_reason||':'||coalesce(p_details,''));
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 perform public.fan_web_lock_active_user(p_app_user_id);
 replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);
 if replay is not null then return replay;end if;
 if p_reason is null or p_reason not in('spam','harassment','sexual','hate','other')or not exists(
  select 1 from public.social_dm_messages m join public.social_dm_conversations c on c.id=m.conversation_id
  where m.id=p_message_id and p_app_user_id in(c.user_low_id,c.user_high_id)and m.sender_id<>p_app_user_id
 )then raise exception 'SOCIAL_NOT_FOUND';end if;
 if length(p_details)>500 then raise exception 'SOCIAL_CONFLICT';end if;
 insert into public.social_dm_message_reports(message_id,reporter_id,reason,details,request_id)
 values(p_message_id,p_app_user_id,p_reason,p_details,p_request_id)
 on conflict(message_id,reporter_id)do nothing returning id into report_id;
 if report_id is null then
  select id into report_id from public.social_dm_message_reports where message_id=p_message_id and reporter_id=p_app_user_id;
 end if;
 result:=jsonb_build_object('id',report_id,'reported',true);
 return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result);
end $$;
revoke all on function public.report_social_dm_message(uuid,uuid,text,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.report_social_dm_message(uuid,uuid,text,text,uuid)to service_role;
