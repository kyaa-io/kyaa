begin;
set local lock_timeout = '5s';

-- 대표 11/19 20:35: 팬페이지마다 방 하나 '채팅방(임시운영)'. 그 크리에이터 팬인증(발급 패스포트) 회원과
-- 관리자가 확인한 크리에이터 본인(group_artist_bindings)만 읽고 쓴다. 등급·포인트 조건은 붙이지 않는다.
-- 비밀방(group_rooms 의 artist·certified·free 기본방과 운영자 방)은 그대로 닫혀 있고 이 방은 그 목록에 섞이지 않는다.
-- 메시지는 group_messages 에 두므로 기존 신고(targetType 'message')·운영 숨김 경로가 그대로 쓰인다.
--
-- 크리에이터 접속은 기존 group_presence(90초) + group_artist_presence_settings(공개 동의, 11/13 기본 켜짐)가 이미 맡는다.
-- 앞선 가지가 DEV 에만 적용한 별도 동의·접속 저장소(group_creator_page_presence, touch_creator_page_presence)는
-- 쓰는 곳이 없어 지운다. 그 두 마이그레이션 파일은 main 에 들어가지 않고 이 가지에서 뺐다(DEV 행 없음).
drop function if exists public.touch_creator_page_presence(uuid, uuid);
drop table if exists public.group_creator_page_presence;

alter table public.group_rooms drop constraint group_rooms_default_kind_check;
alter table public.group_rooms add constraint group_rooms_default_kind_check check (coalesce((
 (default_key is null and minimum_tier is not null) or
 (default_key in ('artist','certified') and minimum_tier is not null) or
 (default_key='free' and minimum_tier is null) or
 (default_key='chat' and minimum_tier='Member' and minimum_stage_key is null)
),false));

-- 'chat' 방은 팬페이지가 생길 때 함께 만든다. 이름은 화면이 언어별로 그리므로 저장 값은 운영 화면용이다.
create or replace function public.group_ensure_default_rooms(p_page uuid)
returns void language sql security definer set search_path='' as $$
 insert into public.group_rooms(page_id,default_key,name,minimum_tier)
 select g.id,v.key,v.name,v.tier from public.group_pages g
 cross join (values ('artist','아티스트 소통방','Bronze'),('certified','인증팬 소통방','Bronze'),('free','자유 소통방',null)) v(key,name,tier)
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing;
 insert into public.group_rooms(page_id,default_key,name,minimum_tier,minimum_stage_key)
 select g.id,'chat','채팅방(임시운영)','Member',null from public.group_pages g
 where g.id=p_page and g.kind='fan'
 on conflict(page_id,default_key) where default_key is not null do nothing;
$$;
revoke all on function public.group_ensure_default_rooms(uuid) from public,anon,authenticated,service_role;

insert into public.group_rooms(page_id,default_key,name,minimum_tier,minimum_stage_key)
select g.id,'chat','채팅방(임시운영)','Member',null from public.group_pages g where g.kind='fan'
on conflict(page_id,default_key) where default_key is not null do nothing;

-- 비밀방 공개 목록(지금은 닫힘)에 채팅방이 섞이지 않게 한다. 나머지는 그대로.
create or replace function public.read_group_public_rooms(p_actor uuid, p_page_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare g public.group_pages;result jsonb;
begin
 g:=public.group_public_visible_page(p_actor,p_page_id);
 with defaults(key,name,tier,ord)as(values('artist','아티스트 소통방','Bronze',1),('certified','인증팬 소통방','Bronze',2),('free','자유 소통방',null,3)),
 rooms as materialized(
  select r.name,r.minimum_tier,r.created_at,coalesce((select d.ord from defaults d where d.key=r.default_key),0)ord
  from public.group_rooms r
  where r.page_id=g.id and r.default_key is distinct from 'chat' and r.status<>'closed'and(r.closes_at is null or r.closes_at>now())
  union all
  select d.name,d.tier,null,d.ord from defaults d
  where g.kind='fan'and not exists(select 1 from public.group_rooms r where r.page_id=g.id and r.default_key=d.key)
 ),ranked as(select *from rooms order by ord,created_at desc nulls last,name limit 50)
 select jsonb_build_object('roomCount',(select count(*)from rooms),'items',coalesce((select jsonb_agg(jsonb_build_object('name',name,'minimumTier',minimum_tier))from ranked),'[]'::jsonb))into result;
 return result;
end $function$;

-- 입장 자격: 'ok' | 'not_verified' | 'not_found'. 로그인 확인은 API 가 먼저 한다.
create function public.group_chat_gate(p_actor uuid, p_page uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
  when g.id is null or g.kind<>'fan' or g.status<>'published' or not public.group_scope_visible(p_actor,g.id) then 'not_found'
  when not exists(select 1 from public.app_users u where u.id=p_actor and u.status='active') then 'not_verified'
  when exists(select 1 from public.group_artist_bindings b where b.page_id=g.id and b.app_user_id=p_actor) then 'ok'
  when exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=g.celebrity_id and p.business_status='issued') then 'ok'
  else 'not_verified' end
 from (select 1) one left join public.group_pages g on g.id=p_page
$$;

-- 'chat'        읽기: 커서가 없으면 최근 50개, after 가 있으면 그 뒤 50개(오래된 것부터).
-- 'chat-message' 쓰기: 글만, 500자, 같은 requestId 는 한 번만 저장, 10초에 5개·같은 글 연속 금지.
create function public.group_chat_dispatch(p_operation text, p_actor uuid, p_page_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 gate text; v_room uuid; v_celebrity uuid; v_limit integer; v_after uuid; after_at timestamptz;
 v_body text; req uuid; payload jsonb; saved record; result jsonb; new_id uuid; restricted boolean;
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
 select g.celebrity_id into v_celebrity from public.group_pages g where g.id=p_page_id;
 restricted := exists(select 1 from public.app_user_moderation_restrictions x where x.app_user_id=p_actor and x.revoked_at is null);

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
   'items', coalesce(jsonb_agg(jsonb_build_object(
     'id',x.id,'body',x.body,'profileId',x.author_id,
     'nickname',coalesce(up.nickname,''),
     'avatarUrl',public.public_fan_avatar_url(x.author_id),
     'artist',exists(select 1 from public.group_artist_bindings b where b.page_id=p_page_id and b.app_user_id=x.author_id),
     'createdAt',x.created_at) order by x.created_at, x.id),'[]'::jsonb))
  into result
  from picked x left join public.user_profiles up on up.app_user_id=x.author_id;
  return result;
 end if;

 if p_operation='chat-message' then
  if restricted then raise exception 'GROUPS_FORBIDDEN:restricted'; end if;
  v_body := btrim(coalesce(p_input->>'body',''));
  req := (p_input->>'requestId')::uuid;
  if req is null or v_body='' or char_length(v_body)>500 then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  perform public.social_request_lock(p_actor, req);
  payload := jsonb_build_object('pageId',p_page_id,'body',v_body);
  select * into saved from public.group_action_receipts where actor_id=p_actor and request_id=req;
  if found then
   if saved.operation<>'chat-message' or saved.payload<>payload then raise exception 'GROUPS_CONFLICT'; end if;
   return saved.response;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('group-chat:'||p_actor::text,0));
  if (select count(*) from public.group_messages m where m.room_id=v_room and m.author_id=p_actor and m.created_at>clock_timestamp()-interval '10 seconds')>=5
     or (select m.body from public.group_messages m where m.room_id=v_room and m.author_id=p_actor and m.removed_at is null and m.created_at>clock_timestamp()-interval '60 seconds' order by m.created_at desc, m.id desc limit 1)=v_body
  then raise exception 'GROUPS_RATE_LIMITED'; end if;
  insert into public.group_messages(room_id,author_id,body) values(v_room,p_actor,v_body) returning id into new_id;
  result := jsonb_build_object('id',new_id);
  insert into public.group_action_receipts(actor_id,request_id,operation,payload,response) values(p_actor,req,'chat-message',payload,result);
  return result;
 end if;

 raise exception 'GROUPS_INVALID_REQUEST';
end $$;

-- 랭킹 행의 '접속 중': 공개 동의한 확인된 크리에이터 본인이 90초 안에 자기 팬페이지에 있었던 크리에이터 slug.
-- 팬페이지 머리의 공개 접속 표시(presence)와 같은 조건이라 새로 드러나는 정보는 없다.
create function public.group_online_creator_slugs(p_slugs text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(distinct c.slug),'[]'::jsonb)
 from public.celebrities c
 join public.group_pages g on g.celebrity_id=c.id and g.kind='fan' and g.status='published'
 join public.group_artist_bindings b on b.page_id=g.id
 join public.group_artist_presence_settings s on s.app_user_id=b.app_user_id and s.enabled
 join public.app_users u on u.id=b.app_user_id and u.status='active'
 join public.group_presence pr on pr.page_id=g.id and pr.app_user_id=b.app_user_id and pr.seen_at>now()-interval '90 seconds'
 where c.slug=any(p_slugs[1:50])
$$;

revoke all on function public.group_chat_gate(uuid,uuid), public.group_chat_dispatch(text,uuid,uuid,jsonb), public.group_online_creator_slugs(text[]) from public,anon,authenticated;
-- 서버 역할(service_role)만 부른다. 자격 함수는 자격 단어 하나만 돌려주며, 플랫폼 기본 권한과 같게 명시한다.
grant execute on function public.group_chat_dispatch(text,uuid,uuid,jsonb), public.group_online_creator_slugs(text[]), public.group_chat_gate(uuid,uuid) to service_role;

commit;
