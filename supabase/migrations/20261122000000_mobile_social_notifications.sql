-- Keep private social activity on the existing inbox/native-push intent path.
alter type public.notification_kind add value if not exists 'fan_friend_request';
alter type public.notification_kind add value if not exists 'fan_dm_request';
alter type public.notification_kind add value if not exists 'fan_dm_message';
alter type public.notification_kind add value if not exists 'friend_post';
alter type public.notification_kind add value if not exists 'friend_reaction';

alter table public.fan_post_likes add column notification_id uuid not null default extensions.gen_random_uuid() unique;
alter table public.mobile_content_comment_reactions add column notification_id uuid not null default extensions.gen_random_uuid() unique;

create or replace function public.fan_web_notification_kind(p_kind text)
returns boolean language sql immutable set search_path='' as $$
 select p_kind in('content_reply','official_post','schedule_reminder','schedule_changed','schedule_cancelled',
  'schedule_suggestion_reviewed','fanpage_request_reviewed','fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction')
$$;

create or replace function public.mobile_notification_category(p_kind text)
returns text language sql immutable set search_path='' as $$
 select case when p_kind in('live_24h','live_10m','live_reserved','live_changed','live_cancelled','schedule_reminder','schedule_changed','schedule_cancelled') then 'schedule'
  when p_kind in('benefit_available','benefit_unlocked','benefit_won','recipient_information_required','fulfillment_meaningful_update','collectible_claim_available','collectible_claim_expiring') then 'benefit'
  when p_kind in('content_reply','official_post','fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction') then 'community'
  when p_kind in('participation_checkin','participation_result','survey_reminder') then 'participation'
  else 'account' end
$$;

create function public.mobile_social_notification_path(p_owner uuid,p_kind text,p_type text,p_target uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare path text; actor uuid; creator uuid; content jsonb;
begin
 if not exists(select 1 from public.app_users where id=p_owner and status='active') then return null; end if;
 if p_kind='fan_friend_request' and p_type='social_friendship' then
  select '/people/'||f.requester_id||'/friend-request?favorite='||c.slug into path
   from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.status='published' and c.archived_at is null
   join public.app_users u on u.id=f.requester_id and u.status='active'
   where f.id=p_target and f.addressee_id=p_owner and f.status='pending'
    and not public.fan_web_blocked(p_owner,f.requester_id)
    and exists(select 1 from public.fan_passports where app_user_id=p_owner and celebrity_id=c.id and business_status='issued')
    and exists(select 1 from public.fan_passports where app_user_id=f.requester_id and celebrity_id=c.id and business_status='issued');
  return path;
 elsif p_kind in('fan_dm_request','fan_dm_message') and p_type='social_dm_message' then
  select '/messages/'||d.id into path from public.social_dm_messages m
   join public.social_dm_conversations d on d.id=m.conversation_id and d.status in('pending','accepted')
   join public.app_users u on u.id=m.sender_id and u.status='active'
   where m.id=p_target and p_owner in(d.user_low_id,d.user_high_id) and m.sender_id<>p_owner
    and not public.fan_web_blocked(p_owner,m.sender_id)
    and not exists(select 1 from public.social_dm_message_deletions z where z.message_id=m.id and z.app_user_id=p_owner);
  return path;
 elsif p_kind='friend_post' and p_type='fan_post' then
  content:=public.fan_web_content_target(p_owner,'fan_post',p_target);
  actor:=(content->>'appUserId')::uuid; creator:=(content->>'celebrityId')::uuid;
 elsif p_kind='friend_reaction' and p_type='fan_post_like' then
  select l.app_user_id,public.fan_web_content_target(p_owner,'fan_post',l.post_id)
   into actor,content from public.fan_post_likes l where l.notification_id=p_target;
  if content->>'appUserId' is distinct from p_owner::text then return null; end if;
  creator:=(content->>'celebrityId')::uuid;
 elsif p_kind='friend_reaction' and p_type='fan_post_comment_reaction' then
  select r.app_user_id,public.fan_web_content_target(p_owner,'fan_post_comment',r.target_id)
   into actor,content from public.mobile_content_comment_reactions r
   where r.notification_id=p_target and r.target_type='fan_post_comment';
  if content->>'appUserId' is distinct from p_owner::text then return null; end if;
  creator:=(content->>'celebrityId')::uuid;
 else return null;
 end if;
 if actor is null or actor=p_owner or not exists(select 1 from public.app_users where id=actor and status='active')
   or public.fan_web_blocked(p_owner,actor) or not exists(select 1 from public.social_friendships
    where user_low_id=least(p_owner,actor) and user_high_id=greatest(p_owner,actor) and celebrity_id=creator and status='accepted') then
  return null;
 end if;
 return content->>'deepLink';
end $$;
revoke all on function public.mobile_social_notification_path(uuid,text,text,uuid) from public,anon,authenticated,service_role;

alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_social;
revoke all on function public.fan_web_notification_path_before_social(uuid,uuid) from public,anon,authenticated,service_role;
create function public.fan_web_notification_path(p_owner uuid,p_notification uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications%rowtype;
begin
 select * into n from public.fan_notifications where id=p_notification and app_user_id=p_owner
  and scheduled_for<=pg_catalog.now() and superseded_at is null;
 if not found then return null; end if;
 if n.kind::text not in('fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction') then
  return public.fan_web_notification_path_before_social(p_owner,p_notification);
 end if;
 if n.payload->>'targetId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 return public.mobile_social_notification_path(p_owner,n.kind::text,n.payload->>'targetType',(n.payload->>'targetId')::uuid);
end $$;
revoke all on function public.fan_web_notification_path(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fan_web_notification_path(uuid,uuid) to service_role;

create function public.mobile_enqueue_social_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; kind text; target_type text; target uuid; conversation public.social_dm_conversations%rowtype;
begin
 if tg_table_name='social_friendships' then
  if new.status<>'pending' then return new; end if;
  recipient:=new.addressee_id; kind:='fan_friend_request'; target_type:='social_friendship'; target:=new.id;
 elsif tg_table_name='social_dm_messages' then
  select * into strict conversation from public.social_dm_conversations where id=new.conversation_id;
  recipient:=case when new.sender_id=conversation.user_low_id then conversation.user_high_id else conversation.user_low_id end;
  kind:=case when conversation.status='pending' then 'fan_dm_request' else 'fan_dm_message' end;
  target_type:='social_dm_message'; target:=new.id;
 elsif tg_table_name='fan_posts' then
  for recipient in select case when f.requester_id=new.app_user_id then f.addressee_id else f.requester_id end
   from public.social_friendships f where f.celebrity_id=new.celebrity_id and new.app_user_id in(f.requester_id,f.addressee_id) and f.status='accepted' loop
   if public.mobile_social_notification_path(recipient,'friend_post','fan_post',new.id) is not null then
    perform public.fan_web_emit_notification(recipient,'friend_post','fan_post',new.id,1,pg_catalog.clock_timestamp());
   end if;
  end loop;
  return new;
 elsif tg_table_name='fan_post_likes' then
  select app_user_id into recipient from public.fan_posts where id=new.post_id;
  kind:='friend_reaction'; target_type:='fan_post_like'; target:=new.notification_id;
 elsif tg_table_name='mobile_content_comment_reactions' then
  if new.target_type<>'fan_post_comment' then return new; end if;
  select app_user_id into recipient from public.fan_post_comments where id=new.target_id;
  kind:='friend_reaction'; target_type:='fan_post_comment_reaction'; target:=new.notification_id;
 end if;
 if recipient is not null and public.mobile_social_notification_path(recipient,kind,target_type,target) is not null then
  perform public.fan_web_emit_notification(recipient,kind,target_type,target,1,pg_catalog.clock_timestamp());
 end if;
 return new;
end $$;
revoke all on function public.mobile_enqueue_social_notification() from public,anon,authenticated,service_role;
create trigger mobile_friend_request_notification after insert on public.social_friendships for each row execute function public.mobile_enqueue_social_notification();
create trigger mobile_dm_message_notification after insert on public.social_dm_messages for each row execute function public.mobile_enqueue_social_notification();
create trigger mobile_friend_post_notification after insert on public.fan_posts for each row execute function public.mobile_enqueue_social_notification();
create trigger mobile_friend_post_like_notification after insert on public.fan_post_likes for each row execute function public.mobile_enqueue_social_notification();
create trigger mobile_friend_comment_reaction_notification after insert on public.mobile_content_comment_reactions for each row execute function public.mobile_enqueue_social_notification();

create or replace function public.fan_web_drain_notification_intents(p_app_user_id uuid default null,p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare owner_id uuid; intent public.fan_web_notification_intents%rowtype; enabled boolean; inserted integer:=0;
begin
 if p_limit not between 1 and 1000 then raise exception 'INVALID_NOTIFICATION_BATCH'; end if;
 for owner_id in select distinct recipient_app_user_id from public.fan_web_notification_intents
  where (p_app_user_id is null or recipient_app_user_id=p_app_user_id) and scheduled_for<=pg_catalog.clock_timestamp()
  order by recipient_app_user_id limit p_limit loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||owner_id::text,0));
  if not exists(select 1 from public.app_users where id=owner_id and status='active') then
   delete from public.fan_web_notification_intents where recipient_app_user_id=owner_id; continue;
  end if;
  for intent in select * from public.fan_web_notification_intents where recipient_app_user_id=owner_id
   and scheduled_for<=pg_catalog.clock_timestamp() order by scheduled_for,id limit p_limit for update skip locked loop
   select case when intent.kind='content_reply' then reply_notifications when intent.kind='official_post' then official_post_notifications
    when intent.kind in('fan_friend_request','fan_dm_request','fan_dm_message') then social_notifications
    when intent.kind in('friend_post','friend_reaction') then friend_activity_notifications else schedule_notifications end
    into enabled from public.notification_preferences where app_user_id=owner_id;
   if enabled is distinct from false and (intent.kind not in('fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction')
     or public.mobile_social_notification_path(owner_id,intent.kind,intent.target_type,intent.target_id) is not null) then
    insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
     values(owner_id,intent.kind::public.notification_kind,'web:'||intent.kind||':'||intent.target_id||':'||intent.revision,intent.scheduled_for,'/my',
      jsonb_build_object('targetType',intent.target_type,'targetId',intent.target_id,'revision',intent.revision),true)
     on conflict(app_user_id,source_key) do nothing;
    if found then inserted:=inserted+1; end if;
   end if;
   delete from public.fan_web_notification_intents where id=intent.id;
  end loop;
 end loop;
 return inserted;
end $$;
