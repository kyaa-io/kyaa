\set ON_ERROR_STOP on
-- B6 plan v4 §10.1: message requests after 20261220040000. Synthetic fixtures only; everything rolls back.
-- A sender, B recipient, C not on the shared page, S sanctioned, D deleted, X blocked with B, N empty user (no setting, nothing yet),
-- W/WS/WD/WX kyaa wave friends of A.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.err(p_statement text) returns text language plpgsql as $$
begin execute p_statement; return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.notified(p_owner uuid,p_message uuid,p_kind text) returns boolean language plpgsql as $$
declare n uuid;
begin
 perform public.fan_web_drain_notification_intents(p_owner);
 update public.fan_notifications set scheduled_for=now()-interval '1 second' where app_user_id=p_owner and scheduled_for>now()-interval '1 second';
 select id into n from public.fan_notifications where app_user_id=p_owner and kind::text=p_kind and payload->>'targetId'=p_message::text;
 return n is not null and public.fan_web_notification_path(p_owner,n) is not null;
end $$;
create function pg_temp.has_row(p_owner uuid,p_conversation uuid) returns boolean language sql as $$
 select exists(select 1 from jsonb_array_elements(public.read_owned_dm_conversations(p_owner)->'conversations') v where (v->>'id')::uuid=p_conversation)
$$;
create function pg_temp.sender_view(p_viewer uuid,p_target uuid,p_conversation uuid,p_request uuid) returns jsonb language sql as $$
 select jsonb_build_object(
  'state',public.social_dm_request_state(p_viewer,p_target),
  'row',(select v from jsonb_array_elements(public.read_owned_dm_conversations(p_viewer)->'conversations') v where (v->>'id')::uuid=p_conversation),
  'order',(select jsonb_agg(v->'id') from jsonb_array_elements(public.read_owned_dm_conversations(p_viewer)->'conversations') v),
  'profileDm',public.read_social_fan_profile(p_viewer,p_target,null,'ko',null,null,null,12)->'dm',
  'capabilities',public.read_social_fan_profile(p_viewer,p_target,null,'ko',null,null,null,12)->'capabilities',
  'requestStatus',public.read_owned_social_request_status(p_viewer,p_request),
  'replay',public.request_social_dm(p_viewer,p_target,'hello b',p_request),
  'newRequest',pg_temp.err(format('select public.request_social_dm(%L,%L,%L,%L)',p_viewer,p_target,'another',extensions.gen_random_uuid())))
$$;

do $test$
declare creator uuid:=extensions.gen_random_uuid();pub uuid:=extensions.gen_random_uuid();wave uuid:=extensions.gen_random_uuid();
 a uuid:=extensions.gen_random_uuid();b uuid:=extensions.gen_random_uuid();c uuid:=extensions.gen_random_uuid();s uuid:=extensions.gen_random_uuid();
 d uuid:=extensions.gen_random_uuid();x uuid:=extensions.gen_random_uuid();n uuid:=extensions.gen_random_uuid();
 b2 uuid:=extensions.gen_random_uuid();b3 uuid:=extensions.gen_random_uuid();b4 uuid:=extensions.gen_random_uuid();x2 uuid:=extensions.gen_random_uuid();
 w uuid:=extensions.gen_random_uuid();w2 uuid:=extensions.gen_random_uuid();ws uuid:=extensions.gen_random_uuid();wd uuid:=extensions.gen_random_uuid();wx uuid:=extensions.gen_random_uuid();a3 uuid:=extensions.gen_random_uuid();w3 uuid:=extensions.gen_random_uuid();
 u uuid;r jsonb;conv uuid;conv2 uuid;msg uuid;req uuid;before_view jsonb;after_view jsonb;i integer;e text;cnt bigint;
 conv_s uuid;conv_d uuid;conv_x uuid;conv_ws uuid;conv_wd uuid;conv_wx uuid;msg_s uuid;msg_d uuid;msg_x uuid;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'b6-dm-fixture','published','/fixture.webp',now(),'{creator}','creator');
 select id into wave from public.celebrities where slug='kyaa-wave-fanpage';
 if wave is null then
  wave:=extensions.gen_random_uuid();
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(wave,'kyaa-wave-fanpage','published','/fixture-wave.webp',now(),'{brand}','brand');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(wave,'ko','WAVE','소개','사진'),(wave,'en','WAVE','Summary','Photo');
 end if;
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','B6','소개','사진'),(creator,'en','B6','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(pub,'fan',creator,'B6 page');
 foreach u in array array[a,b,c,s,d,x,n,b2,b3,b4,x2,w,w2,ws,wd,wx] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6-'||u,u||'@example.test');
  if u<>n then insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'b6'||left(u::text,8),'b6'||left(u::text,8)); end if;
 end loop;
 foreach u in array array[a,b,s,d,x,n,b2,b3,b4,x2] loop insert into public.group_memberships(page_id,app_user_id)values(pub,u); end loop;
 foreach u in array array[a,w,w2,ws,wd,wx] loop
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)values(u,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('b6:'||u)||md5('b6:'||u));
 end loop;
 foreach u in array array[w,w2,ws,wd,wx] loop
  insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)values(a,u,wave,'accepted',extensions.gen_random_uuid(),'b6',now()-interval '1 hour');
 end loop;

 -- S1: the empty user N on the same page.
 if public.social_dm_request_state(a,n)<>'available' then raise exception 'S1 state %',public.social_dm_request_state(a,n); end if;
 r:=public.request_social_dm(a,n,'hello n',extensions.gen_random_uuid());
 if r->>'status'<>'pending' or public.social_dm_request_state(a,n)<>'pending' or public.social_dm_request_state(n,a)<>'incoming' then raise exception 'S1 states %',r; end if;
 if (select count(*) from public.social_dm_conversations where requester_id=a and a in(user_low_id,user_high_id) and n in(user_low_id,user_high_id))<>1 then raise exception 'S1 one row'; end if;
 if not pg_temp.notified(n,(r->>'firstMessageId')::uuid,'fan_dm_request') then raise exception 'S1 N notified'; end if;

 -- S2, S3: nothing goes in before accept.
 req:=extensions.gen_random_uuid();
 r:=public.request_social_dm(a,b,'hello b',req);conv:=(r->>'id')::uuid;msg:=(r->>'firstMessageId')::uuid;
 select count(*) into cnt from public.social_dm_messages where conversation_id=conv;
 foreach u in array array[a,b] loop
  e:=pg_temp.err(format('select public.send_social_dm_message(%L,%L,%L,%L)',u,conv,'early',extensions.gen_random_uuid()));
  if e<>'SOCIAL_FORBIDDEN' then raise exception 'S2 send % got %',u,e; end if;
  e:=pg_temp.err(format('select public.send_social_dm_message(%L,%L,%L,null::uuid,%L)',u,conv,'early',extensions.gen_random_uuid()));
  if e<>'SOCIAL_FORBIDDEN' then raise exception 'S2 media send % got %',u,e; end if;
 end loop;
 if (select count(*) from public.social_dm_messages where conversation_id=conv)<>cnt then raise exception 'S2 message count changed'; end if;
 e:=pg_temp.err(format('select public.react_social_dm_message(%L,%L,%L,%L)',b,msg,'heart',extensions.gen_random_uuid()));
 if e<>'SOCIAL_FORBIDDEN' then raise exception 'S3 react got %',e; end if;
 if exists(select 1 from public.social_dm_message_reactions where message_id=msg) then raise exception 'S3 reaction stored'; end if;
 if not pg_temp.notified(b,msg,'fan_dm_request') then raise exception 'S14 B gets the request'; end if;

 -- S4: everything the sender can see is the same before and after the decline.
 before_view:=pg_temp.sender_view(a,b,conv,req);
 perform public.resolve_social_dm(b,conv,'reject',extensions.gen_random_uuid());
 after_view:=pg_temp.sender_view(a,b,conv,req);
 if before_view<>after_view then raise exception 'S4 sender view changed: % -> %',before_view,after_view; end if;
 if before_view->>'state'<>'pending' or before_view->>'newRequest'<>'SOCIAL_CONFLICT' or before_view#>>'{row,status}'<>'outgoing_request' then raise exception 'S4 shape %',before_view; end if;
 if (select status from public.social_dm_conversations where id=conv)<>'pending' or (select declined_at from public.social_dm_conversations where id=conv) is null then raise exception 'S4 row'; end if;

 -- S5: the person who declined has no conversation.
 if pg_temp.has_row(b,conv) then raise exception 'S5 list'; end if;
 r:=public.read_social_fan_profile(b,a,null,'ko',null,null,null,12);
 if r#>>'{dm,conversationId}' is not null or r#>>'{dm,status}'<>'none' then raise exception 'S5 profile dm %',r->'dm'; end if;
 if public.social_dm_request_state(b,a)<>'available' then raise exception 'S5 state %',public.social_dm_request_state(b,a); end if;
 e:=pg_temp.err(format('select public.read_social_dm_messages(%L,%L,null,null,50)',b,conv));
 if e<>'SOCIAL_NOT_FOUND' then raise exception 'S5 read got %',e; end if;
 e:=pg_temp.err(format('select public.resolve_social_dm(%L,%L,''accept'',%L)',b,conv,extensions.gen_random_uuid()));
 if e<>'SOCIAL_NOT_FOUND' then raise exception 'S5 accept got %',e; end if;
 if pg_temp.notified(b,msg,'fan_dm_request') then raise exception 'S14b request notification survived the decline'; end if;
 if exists(select 1 from jsonb_array_elements(public.get_owned_web_notifications(b,'ko')->'items') v where v->>'kind'='fan_dm_request') then raise exception 'S14b list'; end if;
 r:=public.request_social_dm(b,a,'b asks now',extensions.gen_random_uuid());
 if (r->>'id')::uuid<>conv or (select declined_at from public.social_dm_conversations where id=conv) is not null or (select requester_id from public.social_dm_conversations where id=conv)<>b then raise exception 'S5 takeover %',r; end if;
 if public.social_dm_request_state(a,b)<>'incoming' then raise exception 'S5 A incoming'; end if;

 -- S6: cancel and ask again after a decline: normal answers, nothing reaches the person who declined.
 r:=public.request_social_dm(a,b2,'hello b2',extensions.gen_random_uuid());conv2:=(r->>'id')::uuid;
 perform public.resolve_social_dm(b2,conv2,'reject',extensions.gen_random_uuid());
 r:=public.resolve_social_dm(a,conv2,'cancel',extensions.gen_random_uuid());
 if r->>'status'<>'cancelled' then raise exception 'S6 cancel %',r; end if;
 if public.social_dm_request_state(a,b2)<>'retry_later' then raise exception 'S6 sender waits after cancel'; end if;
 if public.social_dm_request_state(b2,a)='retry_later' then raise exception 'S6 the decliner must not see retry_later'; end if;
 update public.social_dm_conversations set retry_at=now()-interval '1 minute' where id=conv2;
 r:=public.request_social_dm(a,b2,'again b2',extensions.gen_random_uuid());
 if r->>'status'<>'pending' or (r->>'replayed')::boolean then raise exception 'S6 ask again %',r; end if;
 if pg_temp.has_row(b2,conv2) or pg_temp.notified(b2,(r->>'firstMessageId')::uuid,'fan_dm_request') then raise exception 'S6/S14 the second ask reached B2'; end if;
 if public.social_dm_request_state(a,b2)<>'pending' then raise exception 'S6 sender pending'; end if;

 -- S6b: a block that is lifted keeps the old behaviour (rejected, 24 hours), not a permanent "request sent".
 r:=public.request_social_dm(a,b3,'hello b3',extensions.gen_random_uuid());conv2:=(r->>'id')::uuid;
 perform public.resolve_social_dm(b3,conv2,'accept',extensions.gen_random_uuid());
 perform public.block_social_profile(b3,a,extensions.gen_random_uuid());
 perform public.unblock_social_profile(b3,a);
 if (select status from public.social_dm_conversations where id=conv2)<>'rejected' or (select declined_at from public.social_dm_conversations where id=conv2) is not null then raise exception 'S6b row'; end if;
 if public.social_dm_request_state(a,b3)<>'retry_later' then raise exception 'S6b sender %',public.social_dm_request_state(a,b3); end if;
 update public.social_dm_conversations set retry_at=now()-interval '1 minute' where id=conv2;
 r:=public.request_social_dm(a,b3,'after unblock',extensions.gen_random_uuid());
 if public.social_dm_request_state(b3,a)<>'incoming' then raise exception 'S6b the recipient sees the new request'; end if;

 -- S7: not on a shared page.
 if public.social_dm_request_state(c,b)<>'not_eligible' then raise exception 'S7 state'; end if;
 if pg_temp.err(format('select public.request_social_dm(%L,%L,''hi'',%L)',c,b,extensions.gen_random_uuid()))<>'SOCIAL_FORBIDDEN' then raise exception 'S7 request'; end if;

 -- Conversations with S, D and X before their state changes (S8, S9b, S14b).
 r:=public.request_social_dm(s,b4,'from s',extensions.gen_random_uuid());conv_s:=(r->>'id')::uuid;msg_s:=(r->>'firstMessageId')::uuid;
 r:=public.request_social_dm(d,b4,'from d',extensions.gen_random_uuid());conv_d:=(r->>'id')::uuid;msg_d:=(r->>'firstMessageId')::uuid;
 r:=public.request_social_dm(x,b4,'from x',extensions.gen_random_uuid());conv_x:=(r->>'id')::uuid;msg_x:=(r->>'firstMessageId')::uuid;
 foreach u in array array[msg_s,msg_d,msg_x] loop if not pg_temp.notified(b4,u,'fan_dm_request') then raise exception 'S14b fixture notification'; end if; end loop;
 r:=public.send_kyaa_wave_friend_message(a,ws,'wave ws',extensions.gen_random_uuid());conv_ws:=(r->>'id')::uuid;
 r:=public.send_kyaa_wave_friend_message(a,wd,'wave wd',extensions.gen_random_uuid());conv_wd:=(r->>'id')::uuid;
 r:=public.send_kyaa_wave_friend_message(a,wx,'wave wx',extensions.gen_random_uuid());conv_wx:=(r->>'id')::uuid;
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(s,extensions.gen_random_uuid(),'B6 시험용 제재 사유입니다',extensions.gen_random_uuid()),
  (ws,extensions.gen_random_uuid(),'B6 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(d,'did:privy:b6-d'),(wd,'did:privy:b6-wd');
 update public.app_users set status='disabled' where id in(d,wd);
 perform public.block_social_profile(b4,x,extensions.gen_random_uuid());
 perform public.block_social_profile(wx,a,extensions.gen_random_uuid());
 if exists(select 1 from public.social_friendships where a in(user_low_id,user_high_id) and wx in(user_low_id,user_high_id) and status='accepted') then raise exception 'fixture: the block ends the wave friendship'; end if;

 -- S8: a sanctioned sender drops out of the recipient's list, messages and notifications; block and unblock still work.
 if pg_temp.has_row(b4,conv_s) or pg_temp.has_row(b4,conv_d) or pg_temp.has_row(b4,conv_x) then raise exception 'S8 list'; end if;
 if pg_temp.err(format('select public.read_social_dm_messages(%L,%L,null,null,50)',b4,conv_s))<>'SOCIAL_BLOCKED' then raise exception 'S8 read'; end if;
 foreach u in array array[msg_s,msg_d,msg_x] loop if pg_temp.notified(b4,u,'fan_dm_request') then raise exception 'S14b notification % survived',u; end if; end loop;
 if pg_temp.err(format('select public.block_social_profile(%L,%L,%L)',b4,s,extensions.gen_random_uuid()))<>'ok' then raise exception 'S8 block sanctioned'; end if;
 if pg_temp.err(format('select public.unblock_social_profile(%L,%L)',b4,s))<>'ok' then raise exception 'S8 unblock sanctioned'; end if;

 -- S9b: blocked, sanctioned and deleted counterparts answer one code everywhere, both directions of a block included.
 foreach u in array array[s,d,x] loop
  conv2:=case u when s then conv_s when d then conv_d else conv_x end;
  msg:=case u when s then msg_s when d then msg_d else msg_x end;
  foreach e in array array[
   format('select public.request_social_dm(%L,%L,''again'',%L)',b4,u,extensions.gen_random_uuid()),
   format('select public.send_social_dm_message(%L,%L,''x'',%L)',b4,conv2,extensions.gen_random_uuid()),
   format('select public.send_social_dm_message(%L,%L,''x'',null::uuid,%L)',b4,conv2,extensions.gen_random_uuid()),
   format('select public.react_social_dm_message(%L,%L,''heart'',%L)',b4,msg,extensions.gen_random_uuid()),
   format('select public.resolve_social_dm(%L,%L,''accept'',%L)',b4,conv2,extensions.gen_random_uuid()),
   format('select public.resolve_social_dm(%L,%L,''reject'',%L)',b4,conv2,extensions.gen_random_uuid())] loop
   if pg_temp.err(e)<>'SOCIAL_BLOCKED' then raise exception 'S9b % gave %',e,pg_temp.err(e); end if;
  end loop;
 end loop;
 if pg_temp.err(format('select public.request_social_dm(%L,%L,''again'',%L)',x,b4,extensions.gen_random_uuid()))<>'SOCIAL_BLOCKED' then raise exception 'S9b blocked side asks'; end if;
 foreach u in array array[ws,wd,wx] loop
  e:=pg_temp.err(format('select public.send_kyaa_wave_friend_message(%L,%L,''wave'',%L)',a,u,extensions.gen_random_uuid()));
  if e<>'SOCIAL_BLOCKED' then raise exception 'S9b wave send to % gave %',u,e; end if;
  e:=pg_temp.err(format('select public.read_kyaa_wave_friend_messages(%L,%L)',a,u));
  if e<>'SOCIAL_BLOCKED' then raise exception 'S9b wave read of % gave %',u,e; end if;
 end loop;
 if pg_temp.err(format('select public.send_kyaa_wave_friend_message(%L,%L,''wave'',%L)',wx,a,extensions.gen_random_uuid()))<>'SOCIAL_BLOCKED'
  or pg_temp.err(format('select public.read_kyaa_wave_friend_messages(%L,%L)',wx,a))<>'SOCIAL_BLOCKED' then raise exception 'S9b wave, the blocking side'; end if;

 -- S9: X and B4 cannot see each other.
 if public.read_social_fan_profile(b4,x,null,'ko',null,null,null,12) is not null or public.read_social_fan_profile(x,b4,null,'ko',null,null,null,12) is not null then raise exception 'S9 profiles'; end if;

 -- S8b: a block on an account that is gone can still be lifted.
 perform public.block_social_profile(b,x2,extensions.gen_random_uuid());
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(x2,'did:privy:b6-x2');
 update public.app_users set status='disabled' where id=x2;
 if jsonb_array_length(public.read_owned_social_blocks(b)->'profiles')<>0 then raise exception 'S8b old reader keeps hiding closed accounts'; end if;
 r:=public.read_owned_social_blocks_closed(b)->'profiles';
 if jsonb_array_length(r)<>1 or r->0->>'profileId'<>x2::text or r->0->>'closed'<>'true' or jsonb_typeof(r->0->'nickname')<>'null' or jsonb_typeof(r->0->'avatarUrl')<>'null' then raise exception 'S8b closed row %',r; end if;
 perform public.unblock_social_profile(b,x2);
 if jsonb_array_length(public.read_owned_social_blocks_closed(b)->'profiles')<>0 or exists(select 1 from public.user_blocks where app_user_id=b) then raise exception 'S8b after unblock'; end if;

 -- S6c: W declines A; A writes from the wave chat. Nothing opens and W reads nothing.
 r:=public.request_social_dm(a,w,'normal request',extensions.gen_random_uuid());conv2:=(r->>'id')::uuid;
 perform public.resolve_social_dm(w,conv2,'reject',extensions.gen_random_uuid());
 r:=public.send_kyaa_wave_friend_message(a,w,'wave after decline',extensions.gen_random_uuid());
 if r->>'status'<>'pending' or (r->>'id')::uuid<>conv2 or (select status from public.social_dm_conversations where id=conv2)<>'pending' then raise exception 'S6c %',r; end if;
 if jsonb_array_length(public.read_kyaa_wave_friend_messages(w,a)->'messages')<>0 then raise exception 'S6c W reads A'; end if;
 if pg_temp.notified(w,(r->>'firstMessageId')::uuid,'fan_dm_request') then raise exception 'S6c W notified'; end if;
 if jsonb_array_length(public.read_kyaa_wave_friend_messages(a,w)->'messages')<>2 then raise exception 'S6c A keeps own messages'; end if;
 -- S6f: a declined pair counts for the sender's greeting mission, as a rejected one did (and as the old auto-open did).
 insert into public.app_users(id,privy_user_id,verified_email)values(a3,'did:privy:b6-a3','b6-a3@example.test'),(w3,'did:privy:b6-w3','b6-w3@example.test');
 insert into public.group_memberships(page_id,app_user_id)values(pub,a3),(pub,w3);
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)values(a3,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('b6:'||a3)||md5('b6:'||a3)),
  (w3,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('b6:'||w3)||md5('b6:'||w3));
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)values(a3,w3,wave,'accepted',extensions.gen_random_uuid(),'b6',now()-interval '1 hour');
 r:=public.request_social_dm(a3,w3,'normal a3',extensions.gen_random_uuid());
 if exists(select 1 from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(a3)->'progress') m where m->>'key'='dm-greeting' and m->>'status'='completed') then raise exception 'S6f fixture: a pending request does not count'; end if;
 perform public.resolve_social_dm(w3,(r->>'id')::uuid,'reject',extensions.gen_random_uuid());
 perform public.send_kyaa_wave_friend_message(a3,w3,'wave a3',extensions.gen_random_uuid());
 if not exists(select 1 from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(a3)->'progress') m where m->>'key'='dm-greeting' and m->>'status'='completed') then raise exception 'S6f mission'; end if;
 -- S6e: W writes from the wave chat: the decline is cleared and the chat opens. A pair never declined opens as before.
 r:=public.send_kyaa_wave_friend_message(w,a,'w writes',extensions.gen_random_uuid());
 if (select status from public.social_dm_conversations where id=conv2)<>'accepted' or (select declined_at from public.social_dm_conversations where id=conv2) is not null then raise exception 'S6e decliner opens'; end if;
 if jsonb_array_length(public.read_kyaa_wave_friend_messages(w,a)->'messages')<>3 then raise exception 'S6e W reads all'; end if;
 r:=public.request_social_dm(a,w2,'normal w2',extensions.gen_random_uuid());conv2:=(r->>'id')::uuid;
 r:=public.send_kyaa_wave_friend_message(a,w2,'wave w2',extensions.gen_random_uuid());
 if (select status from public.social_dm_conversations where id=conv2)<>'accepted' then raise exception 'S6e never declined pair opens'; end if;

 -- S14: the conversation A–N: N gets the request, A the message after accept. Nobody else gets either.
 conv2:=(select id from public.social_dm_conversations where user_low_id=least(a,n) and user_high_id=greatest(a,n));
 perform public.resolve_social_dm(n,conv2,'accept',extensions.gen_random_uuid());
 r:=public.send_social_dm_message(n,conv2,'n replies',extensions.gen_random_uuid());
 if not pg_temp.notified(a,(r->>'id')::uuid,'fan_dm_message') then raise exception 'S14 A gets the message'; end if;
 foreach u in array array[c,s,d,x,b2,b3] loop
  if exists(select 1 from public.fan_notifications f where f.app_user_id=u and f.kind::text in('fan_dm_request','fan_dm_message') and f.payload->>'targetId' in(r->>'id',(select m.id::text from public.social_dm_messages m where m.conversation_id=conv2 order by m.created_at limit 1))) then raise exception 'S14 % got a notification',u; end if;
 end loop;
 -- S14c: an accepted conversation's message notification goes once the sender is sanctioned or blocked.
 r:=public.send_social_dm_message(a,conv2,'a writes',extensions.gen_random_uuid());msg:=(r->>'id')::uuid;
 if not pg_temp.notified(n,msg,'fan_dm_message') then raise exception 'S14c before'; end if;
 perform public.block_social_profile(n,a,extensions.gen_random_uuid());
 if pg_temp.notified(n,msg,'fan_dm_message') or exists(select 1 from jsonb_array_elements(public.get_owned_web_notifications(n,'ko')->'items') v where v->>'kind'='fan_dm_message') then raise exception 'S14c after block'; end if;
 perform public.unblock_social_profile(n,a);
end $test$;

-- S17: the daily limit counts the request log.
do $limit$
declare pub uuid:=extensions.gen_random_uuid();a uuid:=extensions.gen_random_uuid();b uuid:=extensions.gen_random_uuid();pal uuid:=extensions.gen_random_uuid();
 u uuid;other uuid;r jsonb;conv uuid;i integer;e text;
begin
 insert into public.group_pages(id,kind,name)values(pub,'hobby','B6 limit page');
 foreach u in array array[a,b,pal] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6l-'||u,u||'@example.test');
  insert into public.group_memberships(page_id,app_user_id)values(pub,u);
 end loop;
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash)values(a,pal,'accepted',extensions.gen_random_uuid(),'b6');
 r:=public.request_social_dm(a,b,'one',extensions.gen_random_uuid());conv:=(r->>'id')::uuid;
 perform public.resolve_social_dm(b,conv,'reject',extensions.gen_random_uuid());
 perform public.request_social_dm(b,a,'takes over',extensions.gen_random_uuid());
 if public.social_dm_request_count(a)<>1 then raise exception 'S17 A keeps the request after a takeover: %',public.social_dm_request_count(a); end if;
 perform public.resolve_social_dm(b,conv,'cancel',extensions.gen_random_uuid());
 update public.social_dm_conversations set retry_at=null where id=conv;
 perform public.request_social_dm(a,b,'two',extensions.gen_random_uuid());
 if public.social_dm_request_count(a)<>2 then raise exception 'S17 the same row asked twice counts twice'; end if;
 perform public.request_social_dm(a,pal,'friend',extensions.gen_random_uuid());
 if public.social_dm_request_count(a)<>2 or not exists(select 1 from public.social_dm_request_log where sender_id=a and not counted) then raise exception 'S17 a request to a friend is not counted'; end if;
 for i in 3..public.social_dm_request_daily_limit() loop
  insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:b6l-fill-'||i,'b6l-fill-'||i||'@example.test') returning id into u;
  insert into public.group_memberships(page_id,app_user_id)values(pub,u);
  perform public.request_social_dm(a,u,'fill',extensions.gen_random_uuid());
 end loop;
 insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:b6l-over','b6l-over@example.test') returning id into u;
 insert into public.group_memberships(page_id,app_user_id)values(pub,u);
 -- A takeover of one of A's requests does not give A room.
 select cv.id,case when cv.user_low_id=a then cv.user_high_id else cv.user_low_id end into conv,other from public.social_dm_conversations cv where cv.requester_id=a order by cv.created_at desc,cv.id limit 1;
 perform public.resolve_social_dm(other,conv,'reject',extensions.gen_random_uuid());
 perform public.request_social_dm(other,a,'takes over',extensions.gen_random_uuid());
 if public.social_dm_request_state(a,u)<>'limit' then raise exception 'S17 state %',public.social_dm_request_state(a,u); end if;
 e:=pg_temp.err(format('select public.request_social_dm(%L,%L,''over'',%L)',a,u,extensions.gen_random_uuid()));
 if e<>'SOCIAL_RATE_LIMITED' then raise exception 'S17 31st got %',e; end if;
end $limit$;

-- Grants: nothing new is reachable from a client role.
do $grants$
declare f text;
begin
 foreach f in array array['public.read_owned_social_blocks_closed(uuid)'] loop
  if has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute') or not has_function_privilege('service_role',f,'execute') then raise exception 'grant %',f; end if;
 end loop;
 foreach f in array array['public.social_lock_pair_for(uuid,uuid)','public.social_lock_pair_actor(uuid,uuid)','public.social_lock_user_quiet(uuid)','public.social_dm_counterpart_open(uuid)',
  'public.social_dm_hidden_for(uuid,public.social_dm_conversations)','public.social_dm_request_count(uuid)','public.b6_owner_access()','public.b6_owner_check()','public.request_social_dm_before_b6(uuid,uuid,text,uuid)'] loop
  if has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute') or has_function_privilege('service_role',f,'execute') then raise exception 'helper reachable %',f; end if;
 end loop;
 if has_table_privilege('service_role','public.social_dm_request_log','select') or has_table_privilege('anon','public.social_dm_request_log','select') then raise exception 'log readable'; end if;
 if not (select relforcerowsecurity from pg_class where oid='public.social_dm_request_log'::regclass) then raise exception 'log force rls'; end if;
end $grants$;
rollback;
\echo PASS b6_dm_request_privacy
