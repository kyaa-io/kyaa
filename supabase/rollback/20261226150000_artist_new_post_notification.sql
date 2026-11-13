begin;
CREATE OR REPLACE FUNCTION public.fan_web_content_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_id uuid;
begin
  if tg_table_name='fan_post_comments' then
    if new.parent_id is null then select app_user_id into owner_id from public.fan_posts where id=new.post_id;
    else select app_user_id into owner_id from public.fan_post_comments where id=new.parent_id; end if;
    if owner_id<>new.app_user_id and exists(select 1 from public.app_users where id=owner_id and status='active')
      and public.fan_web_content_visible(owner_id,'fan_post_comment',new.id) then
      perform public.fan_web_emit_notification(owner_id,'content_reply','fan_post_comment',new.id,1,pg_catalog.clock_timestamp()); end if;
  elsif new.publication_status='published' and new.ever_published_at is not null
    and (tg_op='INSERT' or old.ever_published_at is null) then
    for owner_id in select p.app_user_id from public.fan_passports p join public.app_users u on u.id=p.app_user_id and u.status='active'
      where p.celebrity_id=new.celebrity_id and p.business_status='issued' order by p.app_user_id loop
      if public.fan_web_content_visible(owner_id,'notice',new.id) then
        perform public.fan_web_emit_notification(owner_id,'official_post','notice',new.id,1,pg_catalog.clock_timestamp()); end if;
    end loop;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.fan_web_drain_notification_intents(p_app_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
commit;
