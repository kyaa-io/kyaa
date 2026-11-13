-- Artist new-post notification (1113). A published artist post (SNS-collected or posted by the artist) notifies the artist's passport
-- holders and fan-page members through the existing official_post kind: same inbox row, same settings switch
-- (notification_preferences.official_post_notifications), same per-page switch (group_notification_settings), same open path.
--   Recipients: fan_web_content_notifications (trigger on celebrity_notices) adds the fan page's members for post_type='artist_post'.
--   Batching:   fan_web_drain_notification_intents folds artist posts into one row per artist and fan per 2 hours (count in payload).
-- No new kind, column or table. Inbox only (official_post rows are web_only); push stays off.
-- Rollback: supabase/rollback/20261226150000_artist_new_post_notification.sql.
begin;
set local lock_timeout = '5s';

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
    -- An artist post goes to the passport holders and to the members of the artist's fan page; other notices to passport holders only.
    -- fan_web_content_visible below applies the screen's own rule, so a members-only post never reaches someone who cannot open it.
    for owner_id in select x.app_user_id from (
        select p.app_user_id from public.fan_passports p where p.celebrity_id=new.celebrity_id and p.business_status='issued'
        union
        select m.app_user_id from public.group_memberships m join public.group_pages g on g.id=m.page_id
          where new.post_type='artist_post' and g.celebrity_id=new.celebrity_id and g.status='published'
      ) x join public.app_users u on u.id=x.app_user_id and u.status='active' order by x.app_user_id loop
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
declare owner_id uuid; intent public.fan_web_notification_intents%rowtype; enabled boolean; inserted integer:=0; artist_id uuid; bundled boolean;
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
    bundled:=false;
    if intent.kind='official_post' then
     select n.celebrity_id into artist_id from public.celebrity_notices n where n.id=intent.target_id and n.post_type='artist_post';
     if artist_id is not null then
      -- Artist posts: one row per artist and fan in any 2 hours. Posts that arrive inside it raise the row's count, point it at the
      -- newest post and make it unread again, so a batch of collected posts is one notification, not one per post.
      update public.fan_notifications f set read_at=null,
        payload=f.payload||jsonb_build_object('targetId',intent.target_id,'revision',intent.revision,'count',coalesce((f.payload->>'count')::integer,1)+1)
       where f.app_user_id=owner_id and f.kind::text='official_post' and f.superseded_at is null and f.web_only
        and f.payload->>'celebrityId'=artist_id::text and f.payload->>'targetId'<>intent.target_id::text
        and f.scheduled_for>intent.scheduled_for-interval '2 hours' and f.scheduled_for<=intent.scheduled_for;
      bundled:=found;
     end if;
    end if;
    if not bundled then
     insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
      values(owner_id,intent.kind::public.notification_kind,'web:'||intent.kind||':'||intent.target_id||':'||intent.revision,intent.scheduled_for,'/my',
       jsonb_build_object('targetType',intent.target_type,'targetId',intent.target_id,'revision',intent.revision)
        ||case when artist_id is null then '{}'::jsonb else jsonb_build_object('celebrityId',artist_id,'count',1) end,true)
      on conflict(app_user_id,source_key) do nothing;
     if found then inserted:=inserted+1; end if;
    end if;
    artist_id:=null;
   end if;
   delete from public.fan_web_notification_intents where id=intent.id;
  end loop;
 end loop;
 return inserted;
end $function$;

commit;
