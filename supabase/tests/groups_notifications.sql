\set ON_ERROR_STOP on
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();page uuid:=gen_random_uuid();post uuid;comment uuid;notice uuid;app uuid;r jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(a,'did:privy:group-notify-'||a,a||'@example.test'),(b,'did:privy:group-notify-'||b,b||'@example.test');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Notification fixture');insert into public.group_memberships(page_id,app_user_id,role)values(page,a,'owner'),(page,b,'member');
 post:=(public.groups_content_dispatch('post',a,page,null,jsonb_build_object('title','Private board','body','Private','visibility','members','requestId',gen_random_uuid()))->>'id')::uuid;
 comment:=(public.groups_content_dispatch('comment',b,page,post,jsonb_build_object('body','Reply','requestId',gen_random_uuid()))->>'id')::uuid;
 if not exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=a and target_id=comment and target_type='group_comment')then raise exception 'comment notification missing';end if;
 perform public.fan_web_drain_notification_intents(a,100);
 select id into notice from public.fan_notifications where app_user_id=a and payload->>'targetId'=comment::text;
 if public.fan_web_notification_path(a,notice)<>'/pages/groups/'||page::text||'?tab=board&postId='||post::text then raise exception 'comment notification path invalid';end if;
 if public.fan_web_notification_path(b,notice)is not null then raise exception 'notification path crossed owner';end if;
 perform public.fan_web_emit_notification(a,'content_reply','group_comment',comment,2,now()+interval '1 day');
 perform public.groups_content_dispatch('set-notifications',a,page,null,jsonb_build_object('enabled',false));
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=a and target_id=comment)then raise exception 'mute did not clear queued page intents';end if;
 comment:=(public.groups_content_dispatch('comment',b,page,post,jsonb_build_object('body','Muted reply','requestId',gen_random_uuid()))->>'id')::uuid;
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=a and target_id=comment)then raise exception 'muted page generated notification';end if;
 insert into public.group_applications(applicant_id,kind,name,description)values(b,'hobby','New page','Description')returning id into app;
 update public.group_applications set status='reviewing'where id=app;
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=b and target_id=app)then raise exception 'review start notified as result';end if;
 update public.group_applications set status='changes_requested',reason='Please edit',reviewed_at=now()where id=app;
 perform public.fan_web_drain_notification_intents(b,100);
 select id into notice from public.fan_notifications where app_user_id=b and payload->>'targetId'=app::text;
 if public.fan_web_notification_path(b,notice)<>'/pages/groups/apply?applicationId='||app::text then raise exception 'application notification path invalid';end if;
end $$;
rollback;
