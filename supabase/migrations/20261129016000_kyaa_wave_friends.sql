-- Wave reuses social relationships and conversations; check-in replaces passport/favorite gates.
create function public.assert_kyaa_wave_friend_pair(p_app_user_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.fan_web_lock_active_user(least(p_app_user_id,p_profile_id));
 if p_app_user_id<>p_profile_id then perform public.fan_web_lock_active_user(greatest(p_app_user_id,p_profile_id)); end if;
 perform 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id for share;
 if not found then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 perform 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_profile_id for share;
 if not found then raise exception 'SOCIAL_NOT_FOUND'; end if;
 if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
end $$;

create function public.read_owned_kyaa_wave_friends(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_app_user_id);
 return jsonb_build_object('friendships',coalesce((
 select jsonb_agg(jsonb_build_object('id',f.id,'profileId',u.id,
 'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
 'avatarUrl',public.public_fan_avatar_url(u.id),
 'status',case when f.status='accepted' then 'friends' when f.addressee_id=p_app_user_id then 'incoming' else 'outgoing' end) order by f.created_at desc,f.id)
 from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null
 join public.app_users u on u.id=case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end and u.status='active'
 join public.kyaa_wave_participants receipt on receipt.app_user_id=u.id and receipt.event_key='kyaa-wave-2026'
 left join public.user_profiles p on p.app_user_id=u.id
 where p_app_user_id in(f.requester_id,f.addressee_id) and f.status in('pending','accepted') and not public.fan_web_blocked(p_app_user_id,u.id)
 ),'[]'::jsonb));
end $$;

create function public.read_owned_kyaa_wave_profile_link(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_app_user_id);
 return public.read_owned_social_profile_link(p_app_user_id);
end $$;

create function public.resolve_kyaa_wave_profile_link(p_app_user_id uuid,p_token uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; relation public.social_friendships%rowtype;
begin
 select app_user_id into target from public.social_profile_links where token=p_token and expires_at>now();
 if target is null then
  perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_app_user_id);
  raise exception 'SOCIAL_NOT_FOUND';
 end if;
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,target);
 select f.* into relation from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null
 where f.user_low_id=least(p_app_user_id,target) and f.user_high_id=greatest(p_app_user_id,target) and f.status in('pending','accepted');
 return jsonb_build_object('profile',jsonb_build_object('id',target,
 'nickname',coalesce((select nullif(btrim(nickname),'') from public.user_profiles where app_user_id=target),case when p_locale='ko' then '팬' else 'Fan' end),
 'avatarUrl',public.public_fan_avatar_url(target)),
 'relationship',jsonb_build_object('friendshipId',relation.id,'status',case when relation.status='accepted' then 'friends' when relation.addressee_id=p_app_user_id then 'incoming' when relation.requester_id=p_app_user_id then 'outgoing' else 'none' end),'isSelf',target=p_app_user_id);
end $$;

create function public.request_kyaa_wave_friend(p_app_user_id uuid,p_profile_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c_id uuid; f public.social_friendships%rowtype; h text:=md5(p_profile_id::text||':kyaa-wave-fanpage'); begin
  perform public.social_request_lock(p_app_user_id,p_request_id);
  perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_profile_id);
  if p_app_user_id=p_profile_id then raise exception 'SOCIAL_CONFLICT'; end if;
  perform public.social_lock_pair(p_app_user_id,p_profile_id);
  select * into f from public.social_friendships where requester_id=p_app_user_id and request_id=p_request_id;
  if found then if f.payload_hash<>h then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('id',f.id,'status',f.status,'replayed',true); end if;
  if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
  select id into c_id from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null;
  if c_id is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
  if exists(select 1 from public.social_friendships x where x.user_low_id=least(p_app_user_id,p_profile_id) and x.user_high_id=greatest(p_app_user_id,p_profile_id) and x.celebrity_id=c_id and x.status in('rejected','cancelled') and x.retry_at>now()) then raise exception 'SOCIAL_RATE_LIMITED'; end if;
  if exists(select 1 from public.social_friendships x where x.user_low_id=least(p_app_user_id,p_profile_id) and x.user_high_id=greatest(p_app_user_id,p_profile_id) and x.celebrity_id=c_id and x.status in('pending','accepted')) then raise exception 'SOCIAL_CONFLICT'; end if;
  insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash) values(p_app_user_id,p_profile_id,c_id,'pending',p_request_id,h) returning * into f;
  return jsonb_build_object('id',f.id,'status',f.status,'replayed',false);
end $$;

create function public.resolve_kyaa_wave_friend(p_app_user_id uuid,p_friendship_id uuid,p_action text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 select case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end into target
 from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null
 where f.id=p_friendship_id and p_app_user_id in(f.requester_id,f.addressee_id);
 if target is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,target);
 return public.resolve_social_friend(p_app_user_id,p_friendship_id,p_action,p_request_id);
end $$;

create function public.assert_kyaa_wave_dm_pair(p_app_user_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_profile_id);
 perform public.social_lock_pair(p_app_user_id,p_profile_id);
 if not exists(select 1 from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null
 where f.user_low_id=least(p_app_user_id,p_profile_id) and f.user_high_id=greatest(p_app_user_id,p_profile_id) and f.status='accepted') then raise exception 'SOCIAL_FORBIDDEN'; end if;
end $$;

create function public.read_kyaa_wave_friend_messages(p_app_user_id uuid,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare conversation uuid; result jsonb;
begin
 perform public.assert_kyaa_wave_dm_pair(p_app_user_id,p_profile_id);
 select id into conversation from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id);
 with recent as (
 select m.id,m.body,m.created_at,m.sender_id from public.social_dm_messages m
 where m.conversation_id=conversation and m.hidden_at is null and length(btrim(m.body))>0 and not exists(select 1 from public.social_dm_message_deletions d where d.message_id=m.id and d.app_user_id=p_app_user_id)
 order by m.created_at desc,m.id desc limit 101
 ), page as (select * from recent order by created_at desc,id desc limit 100)
 select jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'text',body,'createdAt',created_at,'isMine',sender_id=p_app_user_id) order by created_at,id) from page),'[]'::jsonb),'hasMore',(select count(*)>100 from recent)) into result;
 return result;
end $$;

create function public.send_kyaa_wave_friend_message(p_app_user_id uuid,p_profile_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare conversation uuid; replay jsonb; result jsonb;
 operation text:='wave-dm:'||p_profile_id::text; payload text:=md5(btrim(p_body));
begin
 perform public.social_request_lock(p_app_user_id,p_request_id);
 perform public.assert_kyaa_wave_dm_pair(p_app_user_id,p_profile_id);
 if p_body is null or length(btrim(p_body)) not between 1 and 1000 then raise exception 'SOCIAL_CONFLICT'; end if;
 -- Claim outside create/send: their first-message and later-message hashes differ.
 replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);
 if replay is not null then return replay; end if;
 select id into conversation from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id);
 if conversation is null then result:=public.request_social_dm(p_app_user_id,p_profile_id,p_body,p_request_id);
 else result:=public.send_social_dm_message(p_app_user_id,conversation,p_body,p_request_id); end if;
 return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result);
end $$;

revoke all on function public.assert_kyaa_wave_friend_pair(uuid,uuid),public.read_owned_kyaa_wave_friends(uuid,public.content_locale),public.read_owned_kyaa_wave_profile_link(uuid),public.resolve_kyaa_wave_profile_link(uuid,uuid,public.content_locale),public.request_kyaa_wave_friend(uuid,uuid,uuid),public.resolve_kyaa_wave_friend(uuid,uuid,text,uuid),public.assert_kyaa_wave_dm_pair(uuid,uuid),public.read_kyaa_wave_friend_messages(uuid,uuid),public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.assert_kyaa_wave_friend_pair(uuid,uuid),public.read_owned_kyaa_wave_friends(uuid,public.content_locale),public.read_owned_kyaa_wave_profile_link(uuid),public.resolve_kyaa_wave_profile_link(uuid,uuid,public.content_locale),public.request_kyaa_wave_friend(uuid,uuid,uuid),public.resolve_kyaa_wave_friend(uuid,uuid,text,uuid),public.assert_kyaa_wave_dm_pair(uuid,uuid),public.read_kyaa_wave_friend_messages(uuid,uuid),public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid) to service_role;
