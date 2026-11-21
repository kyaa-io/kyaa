begin;
set local lock_timeout = '5s';

-- 제보방 11/21 17:52: 팬페이지 채팅방에 안 읽은 메시지 경계·개수, 접속 중, 읽음, 사진·영상 보내기. 방 이름에서 '(임시운영)'을 뺀다.
-- 읽은 위치는 기존 group_room_reads(방·사람마다 한 줄), 접속은 기존 group_presence(페이지 90초)를 그대로 쓴다.
-- 사진·영상은 게시판과 같은 비공개 업로드(purpose 'group_post')를 메시지에 붙인다(group_messages.asset_id, 20261221).
create index group_room_reads_room_read on public.group_room_reads(room_id, read_at);

update public.group_rooms set name='채팅방' where default_key='chat' and name='채팅방(임시운영)';

create or replace function public.group_ensure_default_rooms(p_page uuid)
returns void language sql security definer set search_path='' as $$
 insert into public.group_rooms(page_id,default_key,name,minimum_tier)
 select g.id,v.key,v.name,v.tier from public.group_pages g
 cross join (values ('artist','아티스트 소통방','Bronze'),('certified','인증팬 소통방','Bronze'),('free','자유 소통방',null)) v(key,name,tier)
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing;
 insert into public.group_rooms(page_id,default_key,name,minimum_tier,minimum_stage_key)
 select g.id,'chat','채팅방','Member',null from public.group_pages g
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing;
$$;

-- 채팅방의 '접속 중': 90초 안에 그 팬페이지에 있었고 채팅방에 들어올 수 있는 사람.
-- 크리에이터 본인은 접속 공개를 켰을 때만 센다(팬페이지 머리·랭킹의 접속 표시와 같은 동의).
create function public.group_chat_online(p_page uuid, p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.group_presence pr
  join public.app_users u on u.id=pr.app_user_id and u.status='active'
  join public.group_pages g on g.id=pr.page_id
  where pr.page_id=p_page and pr.app_user_id=p_user and pr.seen_at>now()-interval '90 seconds'
   and case when exists(select 1 from public.group_artist_bindings b where b.page_id=g.id and b.app_user_id=p_user)
        then exists(select 1 from public.group_artist_presence_settings s where s.app_user_id=p_user and s.enabled)
        else exists(select 1 from public.fan_passports p where p.app_user_id=p_user and p.celebrity_id=g.celebrity_id and p.business_status='issued') end)
$$;

-- 'chat'         읽기: 커서가 없으면 최근 50개, after 가 있으면 그 뒤 50개(오래된 것부터).
--                firstUnreadId(내가 읽은 위치 뒤 첫 남의 메시지), onlineCount, receipts(내 최근 메시지의 읽은 사람 수),
--                removed(최근 10분 안에 지워진 메시지 — 이미 받은 화면에서 빼기 위함).
-- 'chat-read'    읽은 위치를 그 메시지까지로 올린다(뒤로 가지 않는다).
-- 'chat-unread'  읽은 위치 뒤 남의 메시지 수(최대 100). 한 번도 들어온 적 없으면 0.
-- 'chat-message' 글(500자) 또는 사진·영상 1개. 같은 requestId 는 한 번만 저장, 10초에 5개·같은 글 연속 금지.
-- 'chat-remove'  내 메시지 지우기(첨부 파일은 정리 대기열로).
-- 'chat-report'  남의 메시지 신고(group_reports, 같은 메시지는 사유만 갱신).
create or replace function public.group_chat_dispatch(p_operation text, p_actor uuid, p_page_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 gate text; v_room uuid; v_limit integer; v_after uuid; after_at timestamptz; my_read timestamptz;
 v_body text; v_asset uuid; v_target uuid; v_reason text; req uuid; payload jsonb; saved record; result jsonb; new_id uuid; new_at timestamptz; restricted boolean;
begin
 if p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
 gate := public.group_chat_gate(p_actor, p_page_id);
 if gate='not_found' then raise exception 'GROUPS_NOT_FOUND'; end if;
 if gate<>'ok' then raise exception 'GROUPS_FORBIDDEN:%', gate; end if;
 select r.id into v_room from public.group_rooms r where r.page_id=p_page_id and r.default_key='chat';
 if v_room is null then
  perform public.group_ensure_default_rooms(p_page_id);
  select r.id into v_room from public.group_rooms r where r.page_id=p_page_id and r.default_key='chat';
 end if;
 restricted := exists(select 1 from public.app_user_moderation_restrictions x where x.app_user_id=p_actor and x.revoked_at is null);
 select rd.read_at into my_read from public.group_room_reads rd where rd.room_id=v_room and rd.app_user_id=p_actor;

 if p_operation='chat' then
  v_limit := least(greatest(coalesce((p_input->>'limit')::integer,50),1),100);
  v_after := (p_input->>'after')::uuid;
  if v_after is not null then
   select m.created_at into after_at from public.group_messages m where m.id=v_after and m.room_id=v_room;
   if after_at is null then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  end if;
  with picked as (
   select m.* from public.group_messages m
    where m.room_id=v_room and m.removed_at is null and not public.fan_web_blocked(p_actor,m.author_id)
      and (v_after is null or (m.created_at,m.id)>(after_at,v_after))
    order by case when v_after is null then m.created_at end desc, case when v_after is null then m.id end desc,
             m.created_at, m.id
    limit v_limit)
  select jsonb_build_object(
   'canSend', not restricted,
   'artist', exists(select 1 from public.group_artist_bindings b where b.page_id=p_page_id and b.app_user_id=p_actor),
   'firstUnreadId', (select x.id from picked x where my_read is not null and x.created_at>my_read and x.author_id<>p_actor order by x.created_at, x.id limit 1),
   'items', coalesce(jsonb_agg(jsonb_build_object(
     'id',x.id,'body',x.body,'profileId',x.author_id,
     'nickname',coalesce(up.nickname,''),
     'avatarUrl',public.public_fan_avatar_url(x.author_id),
     'artist',exists(select 1 from public.group_artist_bindings b where b.page_id=p_page_id and b.app_user_id=x.author_id),
     'online',public.group_chat_online(p_page_id,x.author_id),
     'asset',(select jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height) from public.mobile_media_assets a
       where a.id=x.asset_id and a.attached_type='group_message' and a.attached_id=x.id and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null),
     'createdAt',x.created_at) order by x.created_at, x.id),'[]'::jsonb))
  into result
  from picked x left join public.user_profiles up on up.app_user_id=x.author_id;
  return result || jsonb_build_object(
   'onlineCount', (select count(*) from public.group_presence pr where pr.page_id=p_page_id and pr.seen_at>now()-interval '90 seconds' and public.group_chat_online(p_page_id,pr.app_user_id)),
   'receipts', coalesce((select jsonb_agg(jsonb_build_object('id',mine.id,'readCount',
       (select count(*) from public.group_room_reads rd where rd.room_id=v_room and rd.app_user_id<>p_actor and rd.read_at>=mine.created_at)))
     from (select m.id,m.created_at from public.group_messages m where m.room_id=v_room and m.author_id=p_actor and m.removed_at is null order by m.created_at desc, m.id desc limit 20) mine),'[]'::jsonb),
   'removed', coalesce((select jsonb_agg(gone.id) from (select m.id from public.group_messages m where m.room_id=v_room and m.removed_at>now()-interval '10 minutes' order by m.removed_at desc limit 50) gone),'[]'::jsonb));
 end if;

 if p_operation='chat-unread' then
  return jsonb_build_object('unreadCount', case when my_read is null then 0 else
   (select count(*) from (select 1 from public.group_messages m
     where m.room_id=v_room and m.removed_at is null and m.author_id<>p_actor and m.created_at>my_read and not public.fan_web_blocked(p_actor,m.author_id)
     limit 100) unread) end);
 end if;

 if p_operation='chat-read' then
  select m.created_at into after_at from public.group_messages m where m.id=(p_input->>'through')::uuid and m.room_id=v_room;
  if after_at is null then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  insert into public.group_room_reads(room_id,app_user_id,read_at) values(v_room,p_actor,after_at)
   on conflict(room_id,app_user_id) do update set read_at=greatest(public.group_room_reads.read_at,excluded.read_at);
  return jsonb_build_object('read',true);
 end if;

 if p_operation='chat-message' then
  if restricted then raise exception 'GROUPS_FORBIDDEN:restricted'; end if;
  v_body := btrim(coalesce(p_input->>'body',''));
  v_asset := (p_input->>'assetId')::uuid;
  req := (p_input->>'requestId')::uuid;
  if req is null or (v_body='' and v_asset is null) or char_length(v_body)>500 then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  perform public.social_request_lock(p_actor, req);
  payload := jsonb_strip_nulls(jsonb_build_object('pageId',p_page_id,'body',v_body,'assetId',v_asset));
  select * into saved from public.group_action_receipts where actor_id=p_actor and request_id=req;
  if found then
   if saved.operation<>'chat-message' or saved.payload<>payload then raise exception 'GROUPS_CONFLICT'; end if;
   return saved.response;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('group-chat:'||p_actor::text,0));
  if (select count(*) from public.group_messages m where m.room_id=v_room and m.author_id=p_actor and m.created_at>clock_timestamp()-interval '10 seconds')>=5
     or (v_body<>'' and (select m.body from public.group_messages m where m.room_id=v_room and m.author_id=p_actor and m.removed_at is null and m.created_at>clock_timestamp()-interval '60 seconds' order by m.created_at desc, m.id desc limit 1)=v_body)
  then raise exception 'GROUPS_RATE_LIMITED'; end if;
  if v_asset is not null then
   perform 1 from public.mobile_media_assets a where a.id=v_asset and a.app_user_id=p_actor and a.purpose='group_post' and a.kind in('image','video')
    and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null and a.attached_id is null and a.width>0 and a.height>0 for update;
   if not found then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  end if;
  insert into public.group_messages(room_id,author_id,body,asset_id) values(v_room,p_actor,v_body,v_asset) returning id, created_at into new_id, new_at;
  if v_asset is not null then
   update public.mobile_media_assets set attached_type='group_message',attached_id=new_id,access_scope='group_post',position=0 where id=v_asset;
  end if;
  insert into public.group_room_reads(room_id,app_user_id,read_at) values(v_room,p_actor,new_at)
   on conflict(room_id,app_user_id) do update set read_at=greatest(public.group_room_reads.read_at,excluded.read_at);
  result := jsonb_build_object('id',new_id);
  insert into public.group_action_receipts(actor_id,request_id,operation,payload,response) values(p_actor,req,'chat-message',payload,result);
  return result;
 end if;

 if p_operation='chat-remove' then
  update public.group_messages m set removed_at=now()
   where m.id=(p_input->>'messageId')::uuid and m.room_id=v_room and m.author_id=p_actor and m.removed_at is null returning m.id into v_target;
  if v_target is null then raise exception 'GROUPS_NOT_FOUND'; end if;
  update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),
   cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes')
   where attached_type='group_message' and attached_id=v_target;
  return jsonb_build_object('removed',true);
 end if;

 if p_operation='chat-report' then
  v_reason := btrim(coalesce(p_input->>'reason',''));
  if v_reason='' or char_length(v_reason)>1000 then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  select m.id into v_target from public.group_messages m
   where m.id=(p_input->>'messageId')::uuid and m.room_id=v_room and m.removed_at is null and m.author_id<>p_actor;
  if v_target is null then raise exception 'GROUPS_NOT_FOUND'; end if;
  insert into public.group_reports(page_id,reporter_id,target_type,target_id,reason) values(p_page_id,p_actor,'message',v_target,v_reason)
   on conflict(reporter_id,target_type,target_id) do update set reason=excluded.reason;
  return jsonb_build_object('reported',true);
 end if;

 raise exception 'GROUPS_INVALID_REQUEST';
end $$;

-- 채팅방 메시지에 붙은 사진·영상은 채팅방에 들어올 수 있는 사람만 읽는다(메시지를 읽는 화면과 같은 판정).
-- 그 밖의 모임 파일은 앞선 판정 그대로다.
alter function public.authorize_group_media_read(uuid,uuid,text) rename to authorize_group_media_read_before_chat;
create function public.authorize_group_media_read(p_app_user_id uuid, p_asset_id uuid, p_variant text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.mobile_media_assets; v_page uuid; v_author uuid;
begin
 select r.page_id, m.author_id into v_page, v_author
  from public.mobile_media_assets media
  join public.group_messages m on m.asset_id=media.id and m.id=media.attached_id
  join public.group_rooms r on r.id=m.room_id and r.default_key='chat'
  where media.id=p_asset_id and media.attached_type='group_message';
 if not found then return public.authorize_group_media_read_before_chat(p_app_user_id,p_asset_id,p_variant); end if;
 if p_variant not in ('original','thumbnail') then raise exception 'MEDIA_INVALID_INPUT'; end if;
 if p_app_user_id is null then return null; end if;
 perform public.fan_web_lock_active_user(p_app_user_id);
 select media.* into a from public.mobile_media_assets media
  join public.group_messages m on m.asset_id=media.id and m.id=media.attached_id
  where media.id=p_asset_id and media.purpose='group_post' and media.kind in('image','video') and media.access_scope='group_post'
   and media.state='ready' and media.storage_deleted_at is null and media.cleanup_requested_at is null and m.removed_at is null;
 if not found or public.group_chat_gate(p_app_user_id,v_page)<>'ok' or public.fan_web_blocked(p_app_user_id,v_author) then return null; end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail' then a.thumbnail_path else a.storage_path end,
  'contentType',case when p_variant='thumbnail' then 'image/webp' else a.content_type end);
end $$;

revoke all on function public.group_chat_online(uuid,uuid), public.authorize_group_media_read(uuid,uuid,text), public.authorize_group_media_read_before_chat(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_group_media_read(uuid,uuid,text), public.group_chat_online(uuid,uuid) to service_role;

commit;
