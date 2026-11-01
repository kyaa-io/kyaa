begin;
alter table public.social_friendships alter column celebrity_id drop not null;
create unique index social_global_pending_pair on public.social_friendships(user_low_id,user_high_id) where celebrity_id is null and status in ('pending','accepted');

create or replace function public.request_social_friend(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c_id uuid; f public.social_friendships; h text:=md5(p_profile_id::text||':'||coalesce(p_celebrity_slug,'global'));
begin
 if p_app_user_id=p_profile_id then raise exception 'SOCIAL_CONFLICT'; end if;
 perform public.social_request_lock(p_app_user_id,p_request_id);
 perform public.social_lock_pair(p_app_user_id,p_profile_id);
 select * into f from public.social_friendships where requester_id=p_app_user_id and request_id=p_request_id;
 if found then
  if f.payload_hash<>h then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',f.id,'status',f.status,'replayed',true);
 end if;
 if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
 if not coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_profile_id),false) then raise exception 'SOCIAL_NOT_FOUND'; end if;
 if p_celebrity_slug is not null then
  select id into c_id from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  if c_id is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
 end if;
 if exists(select 1 from public.social_friendships where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) and status in ('pending','accepted')) then raise exception 'SOCIAL_CONFLICT'; end if;
 if exists(select 1 from public.social_friendships where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) and retry_at>now()) then raise exception 'SOCIAL_RATE_LIMITED'; end if;
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)
 values(p_app_user_id,p_profile_id,c_id,'pending',p_request_id,h) returning * into f;
 return jsonb_build_object('id',f.id,'status',f.status,'replayed',false);
end $$;

create or replace function public.resolve_social_friend(p_app_user_id uuid,p_friendship_id uuid,p_action text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.social_friendships; other_id uuid; replay jsonb; result jsonb; operation text:='resolve-friend:'||p_friendship_id::text; payload text:=md5(p_action);
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 select * into f from public.social_friendships where id=p_friendship_id;
 if not found or p_app_user_id not in(f.requester_id,f.addressee_id) then raise exception 'SOCIAL_NOT_FOUND'; end if;
 other_id:=case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end;
 perform public.social_lock_pair(p_app_user_id,other_id);
 select * into f from public.social_friendships where id=p_friendship_id for update;
 replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);
 if replay is not null then return replay; end if;
 if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if;
 if p_action='accept' and f.status='pending' and f.addressee_id=p_app_user_id then
  update public.social_friendships set status='accepted',accepted_at=now() where id=f.id;
  update public.social_friendships set status='cancelled',ended_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status='pending' and id<>f.id;
  update public.social_dm_conversations set status='accepted',retry_at=null,updated_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status='pending';
 elsif p_action in ('reject','cancel') and f.status='pending' and ((p_action='reject' and f.addressee_id=p_app_user_id) or (p_action='cancel' and f.requester_id=p_app_user_id)) then
  update public.social_friendships set status=case p_action when 'reject' then 'rejected' else 'cancelled' end,ended_at=now(),retry_at=now()+interval '24 hours' where id=f.id;
 elsif p_action='unfriend' and f.status='accepted' then
  update public.social_friendships set status=case status when 'accepted' then 'unfriended' else 'cancelled' end,ended_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status in ('accepted','pending');
  if coalesce((select dm_policy from public.social_profile_settings where app_user_id=p_app_user_id),'friends')='friends' or coalesce((select dm_policy from public.social_profile_settings where app_user_id=other_id),'friends')='friends' then
   update public.social_dm_conversations set status='cancelled',updated_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status='accepted';
  end if;
 else raise exception 'SOCIAL_CONFLICT'; end if;
 result:=jsonb_build_object('id',f.id,'status',case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'cancel' then 'cancelled' else 'unfriended' end,'requestId',p_request_id);
 return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result);
end $$;

create or replace function public.read_owned_social_friends(p_app_user_id uuid,p_locale public.content_locale) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object(
    'friendships',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,
      'profileId',o.id,
      'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(o.id),
      'celebritySlug',c.slug,
      'status',case when f.status='accepted' then 'friends' when f.requester_id=p_app_user_id then 'outgoing' else 'incoming' end,
      'createdAt',f.created_at,
      'retryAt',f.retry_at
    ) order by coalesce(f.accepted_at,f.created_at) desc,f.id desc)
    from (select distinct on (user_low_id,user_high_id) * from public.social_friendships where status in ('pending','accepted') order by user_low_id,user_high_id,(status='accepted') desc,created_at desc,id) f
    join public.app_users o on o.id=case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end and o.status='active'
    left join public.user_profiles p on p.app_user_id=o.id
    left join public.celebrities c on c.id=f.celebrity_id
    where p_app_user_id in(f.requester_id,f.addressee_id) and f.status in('pending','accepted') and not public.fan_web_blocked(p_app_user_id,o.id)),'[]'::jsonb),
    'exchanges',coalesce((select jsonb_agg(jsonb_build_object(
      'profileId',e.profile_id,
      'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(e.profile_id),
      'favoriteSlug',c.slug,
      'scannedAt',e.scanned_at
    ) order by e.scanned_at desc,e.profile_id)
    from (select * from public.social_profile_exchanges where viewer_id=p_app_user_id order by scanned_at desc limit 20)e
    join public.app_users u on u.id=e.profile_id and u.status='active'
    left join public.user_profiles p on p.app_user_id=e.profile_id
    join public.celebrities c on c.id=e.celebrity_id
    where not public.fan_web_blocked(p_app_user_id,e.profile_id)),'[]'::jsonb)
  );
end $$;


alter function public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) rename to read_social_fan_profile_before_groups;
create function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale,p_before timestamptz,p_before_id uuid,p_before_kind text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; f public.social_friendships; d public.social_dm_conversations; policy text;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_app_user_id<>p_profile_id and (public.fan_web_blocked(p_app_user_id,p_profile_id) or not coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_profile_id),false)) then return null; end if;
 result:=public.read_social_fan_profile_before_groups(p_app_user_id,p_profile_id,p_celebrity_slug,p_locale,p_before,p_before_id,p_before_kind,p_limit);
 if result is null then
  select jsonb_build_object('profile',jsonb_build_object('id',u.id,'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),'avatarUrl',public.public_fan_avatar_url(u.id),'accountLevel',public.mobile_profile_account_level(u.id)),
   'favorite',null,'publicActivityCount',0,'activities','[]'::jsonb,'activityNextCursor',null,'commonFavorites','[]'::jsonb,'isSelf',u.id=p_app_user_id) into result
   from public.app_users u left join public.user_profiles p on p.app_user_id=u.id where u.id=p_profile_id and u.status='active';
  if result is null then return null; end if;
 end if;
 select * into f from public.social_friendships where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) and status in ('pending','accepted') order by (status='accepted') desc,created_at desc,id limit 1;
 select * into d from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id);
 policy:=coalesce((select dm_policy from public.social_profile_settings where app_user_id=p_profile_id),'friends');
 return result||jsonb_build_object('relationship',jsonb_build_object('friendshipId',f.id,'status',case when f.status='accepted' then 'friends' when f.requester_id=p_app_user_id then 'outgoing' when f.id is not null then 'incoming' else 'none' end,'celebritySlug',(select slug from public.celebrities where id=f.celebrity_id)),
  'dm',jsonb_build_object('conversationId',d.id,'status',case when d.status='accepted' then 'accepted' when d.status='pending' and d.requester_id=p_app_user_id then 'outgoing_request' when d.status='pending' then 'incoming_request' when d.status='rejected' then 'rejected' else 'none' end,
   'canSend',p_app_user_id<>p_profile_id and policy<>'none' and (f.status='accepted' or policy='requests' and d.status='accepted') is true),
  'capabilities',jsonb_build_object('canRequestFriend',p_app_user_id<>p_profile_id and f.id is null,'canRequestDm',coalesce(p_app_user_id<>p_profile_id and policy<>'none' and (policy='requests' or f.status='accepted') and (d.id is null or d.status in ('rejected','cancelled') and coalesce(d.retry_at,'-infinity'::timestamptz)<=now()),false),'canBlock',p_app_user_id<>p_profile_id));
end $$;
revoke all on function public.read_social_fan_profile_before_groups(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) to service_role;

-- Reuse both existing text and validated-media producers after checking current consent.
alter function public.send_social_dm_message(uuid,uuid,text,uuid) rename to send_social_dm_message_before_groups_text;
create function public.send_social_dm_message(p_app_user_id uuid,p_conversation_id uuid,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations; other_id uuid; policy text;
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 select * into d from public.social_dm_conversations where id=p_conversation_id;
 if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if;
 other_id:=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end;
 perform public.social_lock_pair(p_app_user_id,other_id);
 policy:=coalesce((select dm_policy from public.social_profile_settings where app_user_id=other_id),'friends');
 if policy='none' or policy='friends' and not exists(select 1 from public.social_friendships where user_low_id=d.user_low_id and user_high_id=d.user_high_id and status='accepted') then raise exception 'SOCIAL_FORBIDDEN'; end if;
 return public.send_social_dm_message_before_groups_text(p_app_user_id,p_conversation_id,p_body,p_request_id);
end $$;
revoke all on function public.send_social_dm_message_before_groups_text(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_social_dm_message(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.send_social_dm_message(uuid,uuid,text,uuid) to service_role;
alter function public.send_social_dm_message(uuid,uuid,text,uuid,uuid) rename to send_social_dm_message_before_groups_media;
create function public.send_social_dm_message(p_app_user_id uuid,p_conversation_id uuid,p_body text,p_asset_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations; other_id uuid; policy text;
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 select * into d from public.social_dm_conversations where id=p_conversation_id;
 if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if;
 other_id:=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end;
 perform public.social_lock_pair(p_app_user_id,other_id);
 policy:=coalesce((select dm_policy from public.social_profile_settings where app_user_id=other_id),'friends');
 if policy='none' or policy='friends' and not exists(select 1 from public.social_friendships where user_low_id=d.user_low_id and user_high_id=d.user_high_id and status='accepted') then raise exception 'SOCIAL_FORBIDDEN'; end if;
 return public.send_social_dm_message_before_groups_media(p_app_user_id,p_conversation_id,p_body,p_asset_id,p_request_id);
end $$;
revoke all on function public.send_social_dm_message_before_groups_media(uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_social_dm_message(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.send_social_dm_message(uuid,uuid,text,uuid,uuid) to service_role;

alter function public.mobile_social_notification_path(uuid,text,text,uuid) rename to mobile_social_notification_path_before_groups;
create function public.mobile_social_notification_path(p_owner uuid,p_kind text,p_type text,p_target uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare path text;
begin
 if p_kind='fan_friend_request' and p_type='social_friendship' then
  select '/my/friends?profileId='||f.requester_id::text into path from public.social_friendships f
  join public.app_users u on u.id=f.requester_id and u.status='active'
  join public.app_users recipient on recipient.id=f.addressee_id and recipient.status='active'
  where f.id=p_target and f.addressee_id=p_owner and f.status='pending' and not public.fan_web_blocked(p_owner,f.requester_id);
  return path;
 elsif p_kind in ('fan_dm_request','fan_dm_message') and p_type='social_dm_message' then
  select '/my/friends?conversationId='||d.id::text into path from public.social_dm_messages m join public.social_dm_conversations d on d.id=m.conversation_id
  where m.id=p_target and p_owner in(d.user_low_id,d.user_high_id) and m.sender_id<>p_owner and d.status in ('pending','accepted')
  and not public.fan_web_blocked(p_owner,m.sender_id) and exists(select 1 from public.app_users where id=p_owner and status='active')
  and not exists(select 1 from public.social_dm_message_deletions where message_id=m.id and app_user_id=p_owner);
  return path;
 end if;
 return public.mobile_social_notification_path_before_groups(p_owner,p_kind,p_type,p_target);
end $$;
revoke all on function public.mobile_social_notification_path_before_groups(uuid,text,text,uuid),public.mobile_social_notification_path(uuid,text,text,uuid) from public,anon,authenticated,service_role;

commit;
