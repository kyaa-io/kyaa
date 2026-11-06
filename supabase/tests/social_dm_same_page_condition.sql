\set ON_ERROR_STOP on
-- 2026-11-07 user decision Q2. Every answer of social_dm_request_state, and the request function agreeing with it.
begin;
do $$
declare creator uuid:=extensions.gen_random_uuid();pub uuid:=extensions.gen_random_uuid();anon uuid:=extensions.gen_random_uuid();hidden uuid:=extensions.gen_random_uuid();
 viewer uuid:=extensions.gen_random_uuid();peer uuid:=extensions.gen_random_uuid();stranger uuid:=extensions.gen_random_uuid();anon_peer uuid:=extensions.gen_random_uuid();hidden_peer uuid:=extensions.gen_random_uuid();off_peer uuid:=extensions.gen_random_uuid();friends_peer uuid:=extensions.gen_random_uuid();pal uuid:=extensions.gen_random_uuid();pal_two uuid:=extensions.gen_random_uuid();off_pal uuid:=extensions.gen_random_uuid();blocked uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();gone uuid:=extensions.gen_random_uuid();late_friend uuid:=extensions.gen_random_uuid();artist uuid:=extensions.gen_random_uuid();anon_artist uuid:=extensions.gen_random_uuid();filler uuid:=extensions.gen_random_uuid();
 u uuid;r jsonb;conv uuid;raised boolean;i integer;message text;
 expect_state constant text:='state of % should be %, got %';
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'dm-same-page-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','같은 페이지','소개','사진'),(creator,'en','Same page','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(pub,'fan',creator,'Same page');
 insert into public.group_pages(id,kind,name,anonymous)values(anon,'hobby','Anonymous page',true);
 insert into public.group_pages(id,kind,name,status)values(hidden,'hobby','Hidden page','hidden');
 foreach u in array array[viewer,peer,stranger,anon_peer,hidden_peer,off_peer,friends_peer,pal,pal_two,off_pal,blocked,sanctioned,gone,late_friend,artist,anon_artist,filler] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:dm-page-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'d'||left(u::text,8),'d'||left(u::text,8));
 end loop;
 foreach u in array array[viewer,peer,off_peer,friends_peer,blocked,sanctioned,gone,artist] loop insert into public.group_memberships(page_id,app_user_id)values(pub,u);end loop;
 insert into public.group_memberships(page_id,app_user_id)values(anon,viewer),(anon,anon_peer),(anon,anon_artist),(hidden,viewer),(hidden,hidden_peer);
 insert into public.social_profile_settings(app_user_id,dm_policy)values(off_peer,'none'),(friends_peer,'friends'),(off_pal,'none');
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash)values(viewer,pal,'accepted',extensions.gen_random_uuid(),'fixture'),(viewer,off_pal,'accepted',extensions.gen_random_uuid(),'fixture'),(viewer,pal_two,'accepted',extensions.gen_random_uuid(),'fixture');
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocked,viewer);
 update public.app_users set status='disabled' where id=gone;
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'대화 조건 시험용 제재 사유입니다',extensions.gen_random_uuid());
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by)values(pub,artist,extensions.gen_random_uuid()),(anon,anon_artist,extensions.gen_random_uuid());
 set local session_replication_role=origin;

 -- A setting that was never saved now means open.
 if (select column_default from information_schema.columns where table_schema='public' and table_name='social_profile_settings' and column_name='dm_policy') not like '''requests''%' then raise exception 'column default not changed';end if;
 if public.read_owned_social_settings(peer)->>'dmPolicy'<>'requests' then raise exception 'unset setting should read as requests';end if;
 if (select dm_policy from public.social_profile_settings where app_user_id=friends_peer)<>'friends' then raise exception 'a saved setting must stay';end if;

 if public.social_dm_request_state(viewer,viewer)<>'self' then raise exception 'self';end if;
 if public.social_dm_request_state(viewer,peer)<>'available' then raise exception 'same page, no setting';end if;
 if public.social_dm_request_state(viewer,pal)<>'available' then raise exception 'friend without a shared page';end if;
 if public.social_dm_request_state(viewer,stranger)<>'not_eligible' then raise exception 'no page, no friendship';end if;
 if public.social_dm_request_state(viewer,anon_peer)<>'not_eligible' then raise exception 'an anonymous page must not count';end if;
 if public.social_dm_request_state(viewer,hidden_peer)<>'not_eligible' then raise exception 'an unpublished page must not count';end if;
 if public.social_dm_request_state(viewer,off_peer)<>'recipient_off' then raise exception 'messages off';end if;
 if public.social_dm_request_state(viewer,off_pal)<>'recipient_off' then raise exception 'messages off applies to friends too';end if;
 if public.social_dm_request_state(viewer,friends_peer)<>'friends_only' then raise exception 'saved friends only';end if;
 foreach u in array array[blocked,sanctioned,gone] loop
  if public.social_dm_request_state(viewer,u)<>'blocked' then raise exception 'blocked, sanctioned and disabled give one answer';end if;
  if public.read_social_fan_profile(viewer,u,null,'ko') is not null then raise exception 'the profile must stay closed';end if;
 end loop;
 if public.social_dm_request_state(blocked,viewer)<>'blocked' then raise exception 'a block works both ways';end if;

 -- The profile capability and the request agree with the state.
 if public.read_social_fan_profile(viewer,peer,null,'ko')#>>'{capabilities,canRequestDm}'<>'true' then raise exception 'capability should open';end if;
 if public.read_social_fan_profile(viewer,stranger,null,'ko')#>>'{capabilities,canRequestDm}'<>'false' then raise exception 'capability should stay closed';end if;
 foreach u in array array[stranger,anon_peer,hidden_peer,off_peer,off_pal,friends_peer] loop
  message:='no error';
  begin perform public.request_social_dm(viewer,u,'hello',extensions.gen_random_uuid());exception when others then message:=sqlerrm;end;
  if message<>'SOCIAL_FORBIDDEN' then raise exception 'request to % should be SOCIAL_FORBIDDEN, got %',u,message;end if;
 end loop;
 message:='no error';
 begin perform public.request_social_dm(viewer,sanctioned,'hello',extensions.gen_random_uuid());exception when others then message:=sqlerrm;end;
 if message<>'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' then raise exception 'sanctioned request got %',message;end if;
 raised:=false;
 begin perform public.request_social_dm(viewer,blocked,'hello',extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_BLOCKED';end;
 if not raised then raise exception 'blocked request';end if;

 -- Same page: the other person accepts first.
 r:=public.request_social_dm(viewer,peer,'hello',extensions.gen_random_uuid());conv:=(r->>'id')::uuid;
 if r->>'status'<>'pending' then raise exception 'same page starts as a request';end if;
 if public.social_dm_request_state(viewer,peer)<>'pending' then raise exception 'waiting for the answer';end if;
 if public.social_dm_request_state(peer,viewer)<>'incoming' then raise exception 'incoming';end if;
 perform public.resolve_social_dm(peer,conv,'reject',extensions.gen_random_uuid());
 if public.social_dm_request_state(viewer,peer)<>'retry_later' then raise exception 'rejected waits 24 hours';end if;
 update public.social_dm_conversations set retry_at=now()-interval'1 minute' where id=conv;
 if public.social_dm_request_state(viewer,peer)<>'available' then raise exception 'the wait ended';end if;
 r:=public.request_social_dm(viewer,peer,'again',extensions.gen_random_uuid());
 perform public.resolve_social_dm(peer,conv,'accept',extensions.gen_random_uuid());
 if public.social_dm_request_state(viewer,peer)<>'open' then raise exception 'accepted';end if;
 if public.read_owned_dm_conversations(viewer)#>>'{conversations,0,canSend}'<>'true' then raise exception 'accepted conversation can send';end if;
 perform public.set_owned_social_settings(peer,true,'{}','none');
 if public.social_dm_request_state(viewer,peer)<>'recipient_off' then raise exception 'turning off closes an accepted conversation';end if;
 if public.read_owned_dm_conversations(viewer)#>>'{conversations,0,canSend}'<>'false' then raise exception 'composer should close with the setting';end if;
 raised:=false;
 begin perform public.send_social_dm_message(viewer,conv,'after off',extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_FORBIDDEN';end;
 if not raised then raise exception 'send after off';end if;
 -- Friends ask too. Nothing goes through until the other person accepts.
 r:=public.request_social_dm(viewer,pal,'hi friend',extensions.gen_random_uuid());conv:=(r->>'id')::uuid;
 if r->>'status'<>'pending' then raise exception 'a friend must accept first, got %',r->>'status';end if;
 if public.social_dm_request_state(viewer,pal)<>'pending' or public.social_dm_request_state(pal,viewer)<>'incoming' then raise exception 'friend request states';end if;
 foreach u in array array[viewer,pal] loop
  message:='no error';
  begin perform public.send_social_dm_message(u,conv,'too early',extensions.gen_random_uuid());exception when others then message:=sqlerrm;end;
  if message<>'SOCIAL_FORBIDDEN' then raise exception 'send before accept got %',message;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(public.read_owned_dm_conversations(viewer)->'conversations') v where (v->>'id')::uuid=conv and (v->>'canSend')::boolean) then raise exception 'composer open before accept';end if;
 if public.read_social_fan_profile(viewer,pal,null,'ko')#>>'{dm,canSend}'<>'false' then raise exception 'profile says it can send before accept';end if;
 perform public.resolve_social_dm(pal,conv,'accept',extensions.gen_random_uuid());
 if public.social_dm_request_state(viewer,pal)<>'open' then raise exception 'friend accepted';end if;
 perform public.send_social_dm_message(viewer,conv,'after accept',extensions.gen_random_uuid());
 perform public.send_social_dm_message(pal,conv,'reply',extensions.gen_random_uuid());
 -- Accepting a friend request is not accepting a message request, in either direction.
 insert into public.group_memberships(page_id,app_user_id)values(pub,late_friend);
 conv:=(public.request_social_dm(viewer,late_friend,'before friendship',extensions.gen_random_uuid())->>'id')::uuid;
 r:=public.request_social_friend(late_friend,viewer,null,extensions.gen_random_uuid());
 perform public.resolve_social_friend(viewer,(r->>'id')::uuid,'accept',extensions.gen_random_uuid());
 if (select status from public.social_dm_conversations where id=conv)<>'pending' then raise exception 'accepting a friend must not start the conversation';end if;
 if public.social_dm_request_state(viewer,late_friend)<>'pending' then raise exception 'still waiting after friendship';end if;

 -- Unfriending still ends the conversation for someone who never saved a setting.
 perform public.resolve_social_friend(viewer,(select id from public.social_friendships where requester_id=viewer and addressee_id=pal and status='accepted'),'unfriend',extensions.gen_random_uuid());
 if (select status from public.social_dm_conversations where user_low_id=least(viewer,pal) and user_high_id=greatest(viewer,pal))<>'cancelled' then raise exception 'unfriend must end the conversation';end if;

 -- The daily limit for non-friends is still the same number and now shows before pressing.
 perform public.set_owned_social_settings(peer,true,'{}','requests');
 for i in 1..public.social_dm_request_daily_limit()-3 loop -- peer, pal and late_friend already count
  insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:dm-fill-'||i,'dm-fill-'||i||'@example.test') returning id into u;
  insert into public.group_memberships(page_id,app_user_id)values(pub,u);
  perform public.request_social_dm(viewer,u,'fill',extensions.gen_random_uuid());
 end loop;
 insert into public.group_memberships(page_id,app_user_id)values(pub,filler);
 if public.social_dm_request_state(viewer,filler)<>'limit' then raise exception 'limit should show first: %',public.social_dm_request_state(viewer,filler);end if;
 if public.social_dm_request_state(viewer,off_pal)<>'recipient_off' then raise exception 'off wins over limit';end if;
 -- The limit is for people who are not friends, and stays that way.
 if public.social_dm_request_state(viewer,pal_two)<>'available' then raise exception 'the limit must not reach friends: %',public.social_dm_request_state(viewer,pal_two);end if;
 if public.request_social_dm(viewer,pal_two,'friend at the limit',extensions.gen_random_uuid())->>'status'<>'pending' then raise exception 'friend request at the limit';end if;
 message:='no error';
 begin perform public.request_social_dm(viewer,filler,'over',extensions.gen_random_uuid());exception when others then message:=sqlerrm;end;
 if message<>'SOCIAL_RATE_LIMITED' then raise exception 'non-friend over the limit got %',message;end if;
 if public.read_social_fan_profile(viewer,filler,null,'ko')#>>'{capabilities,canRequestDm}'<>'false' then raise exception 'limit closes the capability';end if;

 -- Artist mark for the modal. Never from an anonymous page, never through a block.
 r:=public.read_social_profile_reach(viewer,artist);
 if r<>jsonb_build_object('dmState','available','artist',true) and r->>'dmState'<>'limit' then raise exception 'artist reach %',r;end if;
 if r->>'artist'<>'true' then raise exception 'artist mark';end if;
 if public.read_social_profile_reach(viewer,anon_artist)->>'artist'<>'false' then raise exception 'anonymous page must not mark';end if;
 if public.read_social_profile_reach(viewer,peer)->>'artist'<>'false' then raise exception 'plain fan';end if;
 if public.read_social_profile_reach(viewer,blocked)<>jsonb_build_object('dmState','blocked','artist',false) then raise exception 'blocked reach reveals nothing';end if;
 if has_function_privilege('authenticated','public.read_social_profile_reach(uuid,uuid)','EXECUTE') or has_function_privilege('service_role','public.social_dm_request_state(uuid,uuid)','EXECUTE') or not has_function_privilege('service_role','public.read_social_profile_reach(uuid,uuid)','EXECUTE') then raise exception 'function privileges';end if;
 raise notice 'PASS social dm same page condition';
end $$;
rollback;
