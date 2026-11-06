begin;
create or replace function pg_temp.expect_group_social_error(p_sql text,p_message text) returns void language plpgsql as $$ begin execute p_sql; raise exception 'expected error %',p_message; exception when others then if sqlerrm='expected error '||p_message or position(p_message in sqlerrm)=0 then raise; end if; end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();f uuid;d uuid;r jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values(a,'did:privy:groups-social-'||a,a||'@example.test'),(b,'did:privy:groups-social-'||b,b||'@example.test'),(c,'did:privy:groups-social-'||c,c||'@example.test');
 perform public.set_owned_social_settings(a,true,'{}','requests');
 perform public.set_owned_social_settings(b,true,'{}','requests');
 r:=public.request_social_friend(a,b,null,gen_random_uuid());f:=(r->>'id')::uuid;
 if r->>'status'<>'pending' then raise exception 'global request failed';end if;
 if public.mobile_social_notification_path(b,'fan_friend_request','social_friendship',f)<>'/my/friends?profileId='||a::text then raise exception 'global notification missing';end if;
 perform public.resolve_social_friend(b,f,'accept',gen_random_uuid());
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(creator,'groups-social-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash) values(a,b,creator,'accepted',gen_random_uuid(),'legacy');
 if jsonb_array_length(public.read_owned_social_friends(a,'ko')->'friendships')<>1 then raise exception 'global relationship duplicated';end if;
 insert into public.social_dm_conversations(user_low_id,user_high_id,requester_id,status,request_id,payload_hash) values(least(a,b),greatest(a,b),a,'accepted',gen_random_uuid(),'legacy') returning id into d;
 perform public.resolve_social_friend(a,f,'unfriend',gen_random_uuid());
 if exists(select 1 from public.social_friendships where user_low_id=least(a,b) and user_high_id=greatest(a,b) and status='accepted') then raise exception 'creator relationship survived global unfriend';end if;
 perform public.send_social_dm_message(a,d,'Existing consent remains',gen_random_uuid());
 perform public.set_owned_social_settings(b,true,'{}','friends');
 perform pg_temp.expect_group_social_error(format('select public.send_social_dm_message(%L,%L,%L,%L)',a,d,'Denied',gen_random_uuid()),'SOCIAL_FORBIDDEN');
 r:=public.read_social_fan_profile(a,b,null,'ko');
 if r->'favorite'<>'null'::jsonb or r#>>'{capabilities,canRequestDm}'<>'false' then raise exception 'generic profile incorrect';end if;
 r:=public.request_social_friend(a,c,null,gen_random_uuid());
 if r->>'status'<>'pending' then raise exception 'friend request must not depend on a profile setting';end if;
 if has_function_privilege('service_role','public.send_social_dm_message_before_groups_text(uuid,uuid,text,uuid)','EXECUTE') then raise exception 'legacy sender bypass exposed';end if;
end $$;
rollback;
