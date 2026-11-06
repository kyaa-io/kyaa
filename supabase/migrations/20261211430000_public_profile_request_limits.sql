begin;
-- Third review of the all-public profile change.
-- 1. Creator support rows carry no amounts, and the order no longer follows the viewer's blocks. Comparing a creator's total before and after blocking someone gave that member's exact amount.
-- 2. The wave friend request path counts against the same daily friend request limit. Both paths write the same table, so the limit is shared.
-- 3. Message requests to people who are not friends get their own daily limit. It counts first messages, because a cancelled or rejected conversation is reused and its row says nothing about when it was sent.

-- Change the number here to change the limit. Starts at the same value as friend requests.
create function public.social_dm_request_daily_limit()returns integer language sql immutable set search_path='' as $$select 30$$;
revoke all on function public.social_dm_request_daily_limit()from public,anon,authenticated,service_role;

do $patch$
declare def text;anchor text;f record;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_owned_mobile_fan_support_rankings(uuid,public.content_locale,integer,integer)'::regprocedure);
 anchor:=$a$public.mobile_fan_public_support(p_app_user_id)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: creator ranking source';end if;
 def:=replace(def,anchor,$a$public.mobile_fan_public_support(null)$a$);
 anchor:=$a$'imageUrl',image_url,'supportUnits',units,'supportKrw',krw)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: creator ranking fields';end if;
 execute replace(def,anchor,$a$'imageUrl',image_url)$a$);

 def:=pg_catalog.pg_get_functiondef('public.request_kyaa_wave_friend(uuid,uuid,uuid)'::regprocedure);
 anchor:=$a$  insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: request_kyaa_wave_friend';end if;
 execute replace(def,anchor,$a$  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-friend-daily:'||p_app_user_id::text,0));
  if(select count(*)from public.social_friendships where requester_id=p_app_user_id and created_at>now()-interval'24 hours')>=public.social_friend_request_daily_limit()then raise exception 'SOCIAL_RATE_LIMITED';end if;
$a$||anchor);

 -- Placed before the conversation lookup because the code after that lookup reads FOUND.
 def:=pg_catalog.pg_get_functiondef('public.request_social_dm(uuid,uuid,text,uuid)'::regprocedure);
 anchor:=$a$  select * into d from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) for update;$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: request_social_dm';end if;
 execute replace(def,anchor,$a$  if not friends then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-dm-daily:'||p_app_user_id::text,0));
    if(select count(*)from public.social_dm_conversations cv join public.social_dm_messages fm on fm.conversation_id=cv.id and fm.sender_id=cv.requester_id and fm.request_id=cv.request_id where cv.requester_id=p_app_user_id and fm.created_at>now()-interval'24 hours')>=public.social_dm_request_daily_limit()then raise exception 'SOCIAL_RATE_LIMITED';end if;
  end if;
$a$||anchor);

 for f in select distinct o.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner
  where p.oid in('public.request_kyaa_wave_friend(uuid,uuid,uuid)'::regprocedure,'public.request_social_dm(uuid,uuid,text,uuid)'::regprocedure) and not o.rolsuper loop
  execute format('grant execute on function public.social_friend_request_daily_limit(),public.social_dm_request_daily_limit() to %I',f.rolname);
 end loop;
end $patch$;
commit;
