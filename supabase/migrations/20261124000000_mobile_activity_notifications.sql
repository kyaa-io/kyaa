-- New activity notifications use the existing idempotent inbox and native delivery queue.
alter type public.notification_kind add value if not exists 'support_reply';
alter type public.notification_kind add value if not exists 'stamp_issued';
alter type public.notification_kind add value if not exists 'participation_deadline';

create or replace function public.fan_web_notification_kind(p_kind text)
returns boolean language sql immutable set search_path='' as $$
 select p_kind in('content_reply','official_post','schedule_reminder','schedule_changed','schedule_cancelled',
  'schedule_suggestion_reviewed','fanpage_request_reviewed','fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction','support_reply','stamp_issued','participation_deadline')
$$;

create or replace function public.mobile_notification_category(p_kind text)
returns text language sql immutable set search_path='' as $$
 select case when p_kind in('live_24h','live_10m','live_reserved','live_changed','live_cancelled','schedule_reminder','schedule_changed','schedule_cancelled') then 'schedule'
  when p_kind in('benefit_available','benefit_unlocked','benefit_won','recipient_information_required','fulfillment_meaningful_update','collectible_claim_available','collectible_claim_expiring') then 'benefit'
  when p_kind in('content_reply','official_post','fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction') then 'community'
  when p_kind in('participation_checkin','participation_result','survey_reminder','stamp_issued','participation_deadline') then 'participation'
  else 'account' end
$$;


create function public.mobile_activity_notification_path(p_owner uuid,p_kind text,p_type text,p_target uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare path text;
begin
 if not exists(select 1 from public.app_users where id=p_owner and status='active') then return null; end if;
 if p_kind='support_reply' and p_type='cs_message' then
  select '/support/'||i.id into path from public.cs_messages m join public.cs_inquiries i on i.id=m.inquiry_id
   where m.id=p_target and i.app_user_id=p_owner and m.actor_admin_allowlist_id is not null and m.operation='post';
 elsif p_kind='stamp_issued' and p_type='stamp' then
  select '/stamps/'||s.id into path from public.stamps s
   where s.id=p_target and s.app_user_id=p_owner and s.business_status='issued';
 elsif p_kind='stamp_issued' and p_type='community_stamp' then
  select '/my/community-stamps' into path from public.community_stamps s where s.id=p_target and s.app_user_id=p_owner;
 elsif p_kind='participation_deadline' and p_type='participation_activity' then
  select '/activities/'||a.id into path from public.mobile_participation_activity_policies a
   join public.mobile_participation_activity_sources src on src.id=a.source_id and src.state='active' and src.source_kind='mission'
   join public.mobile_participation_contexts c on c.id=a.context_id and c.state='published'
   join public.mobile_participation_events e on e.id=c.source_event_id and e.event_kind='byus_day' and e.state='published'
   join public.celebrities f on f.id=c.celebrity_id and f.status='published' and f.archived_at is null
   where a.id=p_target and a.activity_kind='mission' and a.state='published'
    and pg_catalog.now()>=a.opens_at and a.closes_at>pg_catalog.now() and a.closes_at<=pg_catalog.now()+interval '24 hours'
    and c.opens_at<=pg_catalog.now() and c.closes_at>pg_catalog.now()
    and public.mobile_participation_context_access(p_owner,c.id,false)
    and exists(select 1 from public.mobile_participation_activity_sessions s where s.activity_id=a.id and s.app_user_id=p_owner and s.state='viewing' and s.source_id=src.id and s.source_revision=src.revision);
 end if;
 return path;
end $$;
revoke all on function public.mobile_activity_notification_path(uuid,text,text,uuid) from public,anon,authenticated,service_role;

alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_activity;
revoke all on function public.fan_web_notification_path_before_activity(uuid,uuid) from public,anon,authenticated,service_role;
create function public.fan_web_notification_path(p_owner uuid,p_notification uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications%rowtype;
begin
 select * into n from public.fan_notifications where id=p_notification and app_user_id=p_owner
  and scheduled_for<=pg_catalog.now() and superseded_at is null;
 if not found then return null; end if;
 if n.kind::text not in('support_reply','stamp_issued','participation_deadline') then
  return public.fan_web_notification_path_before_activity(p_owner,p_notification);
 end if;
 if n.payload->>'targetId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 return public.mobile_activity_notification_path(p_owner,n.kind::text,n.payload->>'targetType',(n.payload->>'targetId')::uuid);
end $$;
revoke all on function public.fan_web_notification_path(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fan_web_notification_path(uuid,uuid) to service_role;

create function public.mobile_enqueue_activity_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; kind text; target_type text;
begin
 if tg_table_name='cs_messages' then
  if new.actor_admin_allowlist_id is null or new.operation<>'post' then return new; end if;
  select app_user_id into recipient from public.cs_inquiries where id=new.inquiry_id;
  kind:='support_reply'; target_type:='cs_message';
 else
  recipient:=new.app_user_id; kind:='stamp_issued';
  target_type:=case when tg_table_name='stamps' then 'stamp' else 'community_stamp' end;
 end if;
 if public.mobile_activity_notification_path(recipient,kind,target_type,new.id) is not null then
  perform public.fan_web_emit_notification(recipient,kind,target_type,new.id,1,pg_catalog.clock_timestamp());
 end if;
 return new;
end $$;
revoke all on function public.mobile_enqueue_activity_notification() from public,anon,authenticated,service_role;
create trigger mobile_support_reply_notification after insert on public.cs_messages for each row execute function public.mobile_enqueue_activity_notification();
create trigger mobile_stamp_notification after insert on public.stamps for each row execute function public.mobile_enqueue_activity_notification();
create trigger mobile_community_stamp_notification after insert on public.community_stamps for each row execute function public.mobile_enqueue_activity_notification();

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
    when intent.kind in('friend_post','friend_reaction') then friend_activity_notifications
    when intent.kind in('stamp_issued','participation_deadline') then participation_notifications
    when intent.kind='support_reply' then true else schedule_notifications end
    into enabled from public.notification_preferences where app_user_id=owner_id;
   if enabled is distinct from false and (intent.kind not in('fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction')
     or public.mobile_social_notification_path(owner_id,intent.kind,intent.target_type,intent.target_id) is not null)
     and (intent.kind not in('support_reply','stamp_issued','participation_deadline')
      or public.mobile_activity_notification_path(owner_id,intent.kind,intent.target_type,intent.target_id) is not null) then
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

alter function public.enqueue_due_fan_notifications(timestamptz) rename to enqueue_due_fan_notifications_before_activity;
revoke all on function public.enqueue_due_fan_notifications_before_activity(timestamptz) from public,anon,authenticated,service_role;
create function public.enqueue_due_fan_notifications(p_now timestamptz default pg_catalog.now())
returns integer language plpgsql security definer set search_path='' as $$
declare activity record;
begin
 -- Only people who started an unfinished ByUs Day mission receive a closing reminder.
 for activity in select s.app_user_id,a.id,a.revision from public.mobile_participation_activity_sessions s
  join public.mobile_participation_activity_policies a on a.id=s.activity_id
  where s.state='viewing' and a.state='published' and a.activity_kind='mission'
   and a.opens_at<=p_now and a.closes_at>p_now and a.closes_at<=p_now+interval '24 hours'
   and public.mobile_activity_notification_path(s.app_user_id,'participation_deadline','participation_activity',a.id) is not null
  order by s.app_user_id,a.id loop
  perform public.fan_web_emit_notification(activity.app_user_id,'participation_deadline','participation_activity',activity.id,activity.revision,p_now);
 end loop;
 return public.enqueue_due_fan_notifications_before_activity(p_now);
end $$;
revoke all on function public.enqueue_due_fan_notifications(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_due_fan_notifications(timestamptz) to service_role;
