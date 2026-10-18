begin;

create table public.social_profile_settings (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  profile_visible boolean not null default false,
  dm_policy text not null default 'friends' check (dm_policy in ('friends','requests','none')),
  updated_at timestamptz not null default now()
);
create table public.social_favorite_visibility (
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  visible boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(app_user_id,celebrity_id)
);
create table public.social_profile_links (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  token uuid not null unique default extensions.gen_random_uuid(),
  expires_at timestamptz not null default now()+interval '24 hours',
  created_at timestamptz not null default now()
);
create table public.social_friendships (
  id uuid primary key default extensions.gen_random_uuid(),
  requester_id uuid not null references public.app_users(id) on delete cascade,
  addressee_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  user_low_id uuid generated always as (least(requester_id,addressee_id)) stored,
  user_high_id uuid generated always as (greatest(requester_id,addressee_id)) stored,
  status text not null check(status in ('pending','accepted','rejected','cancelled','unfriended')),
  request_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(), accepted_at timestamptz, ended_at timestamptz, retry_at timestamptz,
  check(requester_id<>addressee_id), unique(requester_id,request_id)
);
create unique index social_friendships_active_pair_idx on public.social_friendships(user_low_id,user_high_id,celebrity_id) where status in ('pending','accepted');
create index social_friendships_member_idx on public.social_friendships(requester_id,addressee_id,status);

create table public.social_dm_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_low_id uuid not null references public.app_users(id) on delete cascade,
  user_high_id uuid not null references public.app_users(id) on delete cascade,
  requester_id uuid not null references public.app_users(id) on delete cascade,
  status text not null check(status in ('pending','accepted','rejected','cancelled')),
  request_id uuid not null, payload_hash text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), retry_at timestamptz,
  check(user_low_id<user_high_id and requester_id in(user_low_id,user_high_id)),
  unique(user_low_id,user_high_id), unique(requester_id,request_id)
);
create table public.social_dm_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.social_dm_conversations(id) on delete cascade,
  sender_id uuid not null references public.app_users(id) on delete cascade,
  body text not null check(length(btrim(body)) between 1 and 2000),
  request_id uuid not null, payload_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(sender_id,request_id)
);
create index social_dm_messages_cursor_idx on public.social_dm_messages(conversation_id,created_at,id);
create table public.social_dm_message_deletions (
  message_id uuid not null references public.social_dm_messages(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  deleted_at timestamptz not null default now(), primary key(message_id,app_user_id)
);
create table public.social_dm_message_reactions (
  message_id uuid not null references public.social_dm_messages(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  reaction text not null check(reaction in ('heart','like','laugh','surprise','sad')),
  updated_at timestamptz not null default now(), primary key(message_id,app_user_id)
);
create table public.social_dm_message_reports (
  id uuid primary key default extensions.gen_random_uuid(), message_id uuid not null references public.social_dm_messages(id) on delete cascade,
  reporter_id uuid not null references public.app_users(id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','sexual','hate','other')),
  details text check(details is null or length(details)<=500), request_id uuid not null,
  created_at timestamptz not null default now(), unique(reporter_id,request_id), unique(message_id,reporter_id)
);
create table public.social_action_requests (
  actor_id uuid not null references public.app_users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);

alter table public.social_profile_settings enable row level security; alter table public.social_profile_settings force row level security;
alter table public.social_favorite_visibility enable row level security; alter table public.social_favorite_visibility force row level security;
alter table public.social_profile_links enable row level security; alter table public.social_profile_links force row level security;
alter table public.social_friendships enable row level security; alter table public.social_friendships force row level security;
alter table public.social_dm_conversations enable row level security; alter table public.social_dm_conversations force row level security;
alter table public.social_dm_messages enable row level security; alter table public.social_dm_messages force row level security;
alter table public.social_dm_message_deletions enable row level security; alter table public.social_dm_message_deletions force row level security;
alter table public.social_dm_message_reactions enable row level security; alter table public.social_dm_message_reactions force row level security;
alter table public.social_dm_message_reports enable row level security; alter table public.social_dm_message_reports force row level security;
alter table public.social_action_requests enable row level security; alter table public.social_action_requests force row level security;
revoke all on public.social_profile_settings,public.social_favorite_visibility,public.social_profile_links,public.social_friendships,public.social_dm_conversations,public.social_dm_messages,public.social_dm_message_deletions,public.social_dm_message_reactions,public.social_dm_message_reports,public.social_action_requests from public,anon,authenticated,service_role;

create function public.social_lock_pair(p_left uuid,p_right uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(least(p_left,p_right));
  perform public.fan_web_lock_active_user(greatest(p_left,p_right));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-pair:'||least(p_left,p_right)::text||':'||greatest(p_left,p_right)::text,0));
end $$;

create function public.social_request_lock(p_actor uuid,p_request_id uuid) returns void language sql security definer set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-request:'||p_actor::text||':'||p_request_id::text,0));
$$;
create function public.social_action_claim(p_actor uuid,p_request_id uuid,p_operation text,p_payload_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.social_action_requests%rowtype;
begin
  perform public.social_request_lock(p_actor,p_request_id);
  select * into saved from public.social_action_requests where actor_id=p_actor and request_id=p_request_id;
  if found then
    if saved.operation<>p_operation or saved.payload_hash<>p_payload_hash then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if;
    return saved.response;
  end if;
  return null;
end $$;
create function public.social_action_store(p_actor uuid,p_request_id uuid,p_operation text,p_payload_hash text,p_response jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin insert into public.social_action_requests(actor_id,request_id,operation,payload_hash,response) values(p_actor,p_request_id,p_operation,p_payload_hash,p_response); return p_response; end $$;

create function public.read_owned_social_request_status(p_app_user_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.social_action_requests%rowtype; f public.social_friendships%rowtype; d public.social_dm_conversations%rowtype; m public.social_dm_messages%rowtype;
begin
  if not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('social-request:'||p_app_user_id::text||':'||p_request_id::text,0)) then return jsonb_build_object('found',false,'state','pending','operation',null,'response',null); end if;
  select * into a from public.social_action_requests where actor_id=p_app_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('found',true,'state','completed','operation',a.operation,'response',a.response); end if;
  select * into f from public.social_friendships where requester_id=p_app_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('found',true,'state','completed','operation','request_friend','response',jsonb_build_object('id',f.id,'status',f.status,'replayed',true)); end if;
  select * into d from public.social_dm_conversations where requester_id=p_app_user_id and request_id=p_request_id;
  if found then select * into m from public.social_dm_messages where sender_id=p_app_user_id and request_id=p_request_id; return jsonb_build_object('found',true,'state','completed','operation','request_dm','response',jsonb_build_object('id',d.id,'status',d.status,'firstMessageId',m.id,'retryAt',d.retry_at,'replayed',true)); end if;
  select * into m from public.social_dm_messages where sender_id=p_app_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('found',true,'state','completed','operation','send_message','response',jsonb_build_object('id',m.id,'createdAt',m.created_at,'replayed',true)); end if;
  return jsonb_build_object('found',false,'state','not_found','operation',null,'response',null);
end $$;

create function public.read_owned_social_settings(p_app_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object('profileVisible',coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_app_user_id),false),'favoriteSlugs',coalesce((select jsonb_agg(c.slug order by c.slug) from public.social_favorite_visibility v join public.celebrities c on c.id=v.celebrity_id where v.app_user_id=p_app_user_id and v.visible),'[]'::jsonb),'dmPolicy',coalesce((select dm_policy from public.social_profile_settings where app_user_id=p_app_user_id),'friends'));
end $$;

create function public.set_owned_social_settings(p_app_user_id uuid,p_profile_visible boolean,p_favorite_slugs text[],p_dm_policy text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_dm_policy not in ('friends','requests','none') or exists(select 1 from unnest(p_favorite_slugs)s left join public.celebrities c on c.slug=s and c.status='published' and c.archived_at is null left join public.fan_passports fp on fp.app_user_id=p_app_user_id and fp.celebrity_id=c.id and fp.business_status='issued' where c.id is null or fp.id is null) then raise exception 'SOCIAL_CONFLICT'; end if;
  insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy) values(p_app_user_id,p_profile_visible,p_dm_policy) on conflict(app_user_id) do update set profile_visible=excluded.profile_visible,dm_policy=excluded.dm_policy,updated_at=now();
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)
    select p_app_user_id,c.id,c.slug=any(p_favorite_slugs) from public.celebrities c
    where exists(select 1 from public.fan_passports p where p.app_user_id=p_app_user_id and p.celebrity_id=c.id and p.business_status='issued')
    on conflict(app_user_id,celebrity_id) do update set visible=excluded.visible,updated_at=now();
  return public.read_owned_social_settings(p_app_user_id);
end $$;

create function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_app_user_id<>p_profile_id and (public.fan_web_blocked(p_app_user_id,p_profile_id) or not coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_profile_id),false)) then return null; end if;
  with target as (select u.id,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) nickname from public.app_users u left join public.user_profiles p on p.app_user_id=u.id where u.id=p_profile_id and u.status='active'), creator as (select c.id,c.slug,c.image_url,l.name from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale where c.slug=p_celebrity_slug and c.status='published' and c.archived_at is null), fav as (select c.*,coalesce(sum(s.points),0)::integer xp,public.get_fan_effective_tier(p_profile_id,c.id) tier from creator c join public.fan_passports fp on fp.app_user_id=p_profile_id and fp.celebrity_id=c.id and fp.business_status='issued' left join public.fan_score_ledger s on s.app_user_id=p_profile_id and s.celebrity_id=c.id where p_app_user_id=p_profile_id or exists(select 1 from public.social_favorite_visibility v where v.app_user_id=p_profile_id and v.celebrity_id=c.id and v.visible) group by c.id,c.slug,c.image_url,c.name), rel as (select f.* from public.social_friendships f join creator c on c.id=f.celebrity_id where f.status in('pending','accepted') and p_app_user_id in(f.requester_id,f.addressee_id) and p_profile_id in(f.requester_id,f.addressee_id) order by f.created_at desc limit 1), conv as (select d.* from public.social_dm_conversations d where d.user_low_id=least(p_app_user_id,p_profile_id) and d.user_high_id=greatest(p_app_user_id,p_profile_id)), common as (select c.slug,l.name,c.image_url,public.get_fan_effective_tier(p_app_user_id,c.id) my_tier,public.get_fan_effective_tier(p_profile_id,c.id) their_tier from public.social_favorite_visibility mine join public.social_favorite_visibility theirs on theirs.celebrity_id=mine.celebrity_id and theirs.app_user_id=p_profile_id and theirs.visible join public.celebrities c on c.id=mine.celebrity_id join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale join public.fan_passports mp on mp.app_user_id=p_app_user_id and mp.celebrity_id=c.id and mp.business_status='issued' join public.fan_passports tp on tp.app_user_id=p_profile_id and tp.celebrity_id=c.id and tp.business_status='issued' where mine.app_user_id=p_app_user_id and mine.visible)
  select jsonb_build_object('profile',jsonb_build_object('id',t.id,'nickname',t.nickname,'avatarUrl',public.public_fan_avatar_url(t.id),'accountLevel',null),'favorite',jsonb_build_object('slug',f.slug,'name',f.name,'imageUrl',f.image_url,'fanXp',f.xp,'fanTier',f.tier,'verified',true),'publicActivityCount',(select count(*)::integer from public.fan_activities a join creator c on c.id=a.celebrity_id where a.app_user_id=p_profile_id),'commonFavorites',coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url,'myFanTier',my_tier,'theirFanTier',their_tier) order by name) from common),'[]'::jsonb),'relationship',jsonb_build_object('friendshipId',r.id,'status',case when r.status='accepted' then 'friends' when r.requester_id=p_app_user_id then 'outgoing' when r.id is not null then 'incoming' else 'none' end,'celebritySlug',case when r.id is null then null else p_celebrity_slug end),'dm',jsonb_build_object('conversationId',d.id,'status',case when d.status='accepted' then 'accepted' when d.status='pending' and d.requester_id=p_app_user_id then 'outgoing_request' when d.status='pending' then 'incoming_request' when d.status='rejected' then 'rejected' else 'none' end,'canSend',coalesce(d.status='accepted',false) or coalesce(r.status='accepted',false)),'capabilities',jsonb_build_object('canRequestFriend',p_app_user_id<>p_profile_id and r.id is null,'canRequestDm',p_app_user_id<>p_profile_id and (d.id is null or d.status in('rejected','cancelled') and coalesce(d.retry_at,'-infinity'::timestamptz)<=now()),'canBlock',p_app_user_id<>p_profile_id),'isSelf',p_app_user_id=p_profile_id) into v_result from target t cross join fav f left join rel r on true left join conv d on true;
  return v_result;
end $$;

create function public.read_owned_social_profile_link(p_app_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.social_profile_links%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into link from public.social_profile_links where app_user_id=p_app_user_id for update;
  if not found or link.expires_at<=now() then
    insert into public.social_profile_links(app_user_id,token,expires_at,created_at) values(p_app_user_id,extensions.gen_random_uuid(),now()+interval '24 hours',now()) on conflict(app_user_id) do update set token=extensions.gen_random_uuid(),expires_at=now()+interval '24 hours',created_at=now() returning * into link;
  end if;
  return jsonb_build_object('token',link.token,'path','/fans/profile-links/'||link.token::text,'expiresAt',link.expires_at);
end $$;
create function public.resolve_social_profile_link(p_app_user_id uuid,p_token uuid,p_celebrity_slug text,p_locale public.content_locale) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile_id uuid;
begin
  select l.app_user_id into profile_id from public.social_profile_links l join public.app_users u on u.id=l.app_user_id and u.status='active' where l.token=p_token and l.expires_at>now();
  if profile_id is null then return null; end if;
  return public.read_social_fan_profile(p_app_user_id,profile_id,p_celebrity_slug,p_locale);
end $$;

create function public.request_social_friend(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c_id uuid; f public.social_friendships%rowtype; h text:=md5(p_profile_id::text||':'||p_celebrity_slug); begin
  perform public.social_request_lock(p_app_user_id,p_request_id);
  perform public.social_lock_pair(p_app_user_id,p_profile_id);
  select * into f from public.social_friendships where requester_id=p_app_user_id and request_id=p_request_id;
  if found then if f.payload_hash<>h then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('id',f.id,'status',f.status,'replayed',true); end if;
  if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
  select id into c_id from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  if c_id is null or not public.fan_web_is_member(p_app_user_id,c_id) or not public.fan_web_is_member(p_profile_id,c_id) or not coalesce((select visible from public.social_favorite_visibility where app_user_id=p_profile_id and celebrity_id=c_id),false) then raise exception 'SOCIAL_NOT_FOUND'; end if;
  if exists(select 1 from public.social_friendships x where x.user_low_id=least(p_app_user_id,p_profile_id) and x.user_high_id=greatest(p_app_user_id,p_profile_id) and x.celebrity_id=c_id and x.status in('rejected','cancelled') and x.retry_at>now()) then raise exception 'SOCIAL_RATE_LIMITED'; end if;
  if exists(select 1 from public.social_friendships x where x.user_low_id=least(p_app_user_id,p_profile_id) and x.user_high_id=greatest(p_app_user_id,p_profile_id) and x.celebrity_id=c_id and x.status in('pending','accepted')) then raise exception 'SOCIAL_CONFLICT'; end if;
  insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash) values(p_app_user_id,p_profile_id,c_id,'pending',p_request_id,h) returning * into f;
  return jsonb_build_object('id',f.id,'status',f.status,'replayed',false);
end $$;

create function public.resolve_social_friend(p_app_user_id uuid,p_friendship_id uuid,p_action text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.social_friendships%rowtype; other_id uuid; replay jsonb; result jsonb; operation text:='resolve-friend:'||p_friendship_id::text; payload text:=md5(p_action); begin
  perform public.social_request_lock(p_app_user_id,p_request_id);
  select * into f from public.social_friendships where id=p_friendship_id; if not found then raise exception 'SOCIAL_NOT_FOUND'; end if;
  other_id:=case when f.requester_id=p_app_user_id then f.addressee_id when f.addressee_id=p_app_user_id then f.requester_id else null end; if other_id is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
  perform public.social_lock_pair(p_app_user_id,other_id); select * into f from public.social_friendships where id=p_friendship_id for update;
  replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload); if replay is not null then return replay; end if;
  if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if;
  if p_action='accept' and f.status='pending' and f.addressee_id=p_app_user_id then update public.social_friendships set status='accepted',accepted_at=now() where id=f.id; update public.social_dm_conversations set status='accepted',retry_at=null,updated_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status='pending';
  elsif p_action='reject' and f.status='pending' and f.addressee_id=p_app_user_id then update public.social_friendships set status='rejected',ended_at=now(),retry_at=now()+interval '24 hours' where id=f.id;
  elsif p_action='cancel' and f.status='pending' and f.requester_id=p_app_user_id then update public.social_friendships set status='cancelled',ended_at=now(),retry_at=now()+interval '24 hours' where id=f.id;
  elsif p_action='unfriend' and f.status='accepted' then update public.social_friendships set status='unfriended',ended_at=now() where id=f.id;
    if not exists(select 1 from public.social_friendships x where x.id<>f.id and x.user_low_id=f.user_low_id and x.user_high_id=f.user_high_id and x.status='accepted') then update public.social_dm_conversations set status='cancelled',updated_at=now() where user_low_id=f.user_low_id and user_high_id=f.user_high_id and status='accepted'; end if;
  else raise exception 'SOCIAL_CONFLICT'; end if;
  result:=jsonb_build_object('id',f.id,'status',case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'cancel' then 'cancelled' else 'unfriended' end,'requestId',p_request_id);
  return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result);
end $$;

create function public.read_owned_social_friends(p_app_user_id uuid,p_locale public.content_locale) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object(
    'friends',coalesce((select jsonb_agg(x.item order by x.nickname,x.profile_id) from (
      select o.id profile_id,coalesce(p.nickname,case when p_locale='ko' then '팬' else 'Fan' end) nickname,jsonb_build_object('profileId',o.id,'nickname',coalesce(p.nickname,case when p_locale='ko' then '팬' else 'Fan' end),'avatarUrl',public.public_fan_avatar_url(o.id),'friendshipIds',jsonb_agg(f.id order by c.slug),'favoriteSlugs',coalesce(jsonb_agg(c.slug order by c.slug) filter(where coalesce(v.visible,false)),'[]'::jsonb),'updatedAt',max(coalesce(f.accepted_at,f.created_at))) item
      from public.social_friendships f join public.app_users o on o.id=case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end and o.status='active' left join public.user_profiles p on p.app_user_id=o.id join public.celebrities c on c.id=f.celebrity_id left join public.social_favorite_visibility v on v.app_user_id=o.id and v.celebrity_id=c.id
      where p_app_user_id in(f.requester_id,f.addressee_id) and f.status='accepted' and not public.fan_web_blocked(p_app_user_id,o.id) group by o.id,p.nickname)x),'[]'::jsonb),
    'incomingRequests',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'profileId',o.id,'nickname',coalesce(p.nickname,case when p_locale='ko' then '팬' else 'Fan' end),'avatarUrl',public.public_fan_avatar_url(o.id),'celebritySlug',c.slug,'createdAt',f.created_at) order by f.created_at desc,f.id desc) from public.social_friendships f join public.app_users o on o.id=f.requester_id and o.status='active' left join public.user_profiles p on p.app_user_id=o.id join public.celebrities c on c.id=f.celebrity_id where f.addressee_id=p_app_user_id and f.status='pending' and not public.fan_web_blocked(p_app_user_id,o.id)),'[]'::jsonb),
    'outgoingRequests',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'profileId',o.id,'nickname',coalesce(p.nickname,case when p_locale='ko' then '팬' else 'Fan' end),'avatarUrl',public.public_fan_avatar_url(o.id),'celebritySlug',c.slug,'createdAt',f.created_at) order by f.created_at desc,f.id desc) from public.social_friendships f join public.app_users o on o.id=f.addressee_id and o.status='active' left join public.user_profiles p on p.app_user_id=o.id join public.celebrities c on c.id=f.celebrity_id where f.requester_id=p_app_user_id and f.status='pending' and not public.fan_web_blocked(p_app_user_id,o.id)),'[]'::jsonb)
  );
end $$;

create function public.request_social_dm(p_app_user_id uuid,p_profile_id uuid,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations%rowtype; m public.social_dm_messages%rowtype; policy text; friends boolean; h text:=md5(p_profile_id::text||':'||btrim(p_body)); begin
  perform public.social_request_lock(p_app_user_id,p_request_id);
  perform public.social_lock_pair(p_app_user_id,p_profile_id);
  select * into d from public.social_dm_conversations where requester_id=p_app_user_id and request_id=p_request_id;
  if found then if d.payload_hash<>h then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if; select * into m from public.social_dm_messages where sender_id=p_app_user_id and request_id=p_request_id; return jsonb_build_object('id',d.id,'status',d.status,'firstMessageId',m.id,'retryAt',d.retry_at,'replayed',true); end if;
  if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
  if length(btrim(p_body)) not between 1 and 1000 then raise exception 'SOCIAL_CONFLICT'; end if;
  friends:=exists(select 1 from public.social_friendships f where f.user_low_id=least(p_app_user_id,p_profile_id) and f.user_high_id=greatest(p_app_user_id,p_profile_id) and f.status='accepted');
  policy:=coalesce((select dm_policy from public.social_profile_settings where app_user_id=p_profile_id),'friends');
  if not friends and (policy<>'requests' or not coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_profile_id),false) or not exists(select 1 from public.social_favorite_visibility mine join public.social_favorite_visibility theirs on theirs.celebrity_id=mine.celebrity_id and theirs.app_user_id=p_profile_id and theirs.visible join public.fan_passports mp on mp.app_user_id=p_app_user_id and mp.celebrity_id=mine.celebrity_id and mp.business_status='issued' join public.fan_passports tp on tp.app_user_id=p_profile_id and tp.celebrity_id=mine.celebrity_id and tp.business_status='issued' where mine.app_user_id=p_app_user_id and mine.visible)) then raise exception 'SOCIAL_FORBIDDEN'; end if;
  select * into d from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) for update;
  if found and d.status in('pending','accepted') then raise exception 'SOCIAL_CONFLICT'; end if;
  if found and d.retry_at>now() then raise exception 'SOCIAL_RATE_LIMITED'; end if;
  if found then update public.social_dm_conversations set requester_id=p_app_user_id,status=case when friends then 'accepted' else 'pending' end,request_id=p_request_id,payload_hash=h,updated_at=now(),retry_at=null where id=d.id returning * into d;
  else insert into public.social_dm_conversations(user_low_id,user_high_id,requester_id,status,request_id,payload_hash) values(least(p_app_user_id,p_profile_id),greatest(p_app_user_id,p_profile_id),p_app_user_id,case when friends then 'accepted' else 'pending' end,p_request_id,h) returning * into d; end if;
  insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash) values(d.id,p_app_user_id,btrim(p_body),p_request_id,md5(btrim(p_body))) returning * into m;
  return jsonb_build_object('id',d.id,'status',d.status,'firstMessageId',m.id,'retryAt',d.retry_at,'replayed',false);
end $$;

create function public.resolve_social_dm(p_app_user_id uuid,p_conversation_id uuid,p_action text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations%rowtype; other_id uuid; replay jsonb; result jsonb; operation text:='resolve-dm:'||p_conversation_id::text; payload text:=md5(p_action); begin perform public.social_request_lock(p_app_user_id,p_request_id); select * into d from public.social_dm_conversations where id=p_conversation_id; if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; other_id:=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end; perform public.social_lock_pair(p_app_user_id,other_id); select * into d from public.social_dm_conversations where id=p_conversation_id for update; replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload); if replay is not null then return replay; end if; if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if;
  if p_action='accept' and d.status='pending' and d.requester_id<>p_app_user_id then update public.social_dm_conversations set status='accepted',updated_at=now(),retry_at=null where id=d.id;
  elsif p_action='reject' and d.status='pending' and d.requester_id<>p_app_user_id then update public.social_dm_conversations set status='rejected',updated_at=now(),retry_at=now()+interval '24 hours' where id=d.id;
  elsif p_action='cancel' and d.status='pending' and d.requester_id=p_app_user_id then update public.social_dm_conversations set status='cancelled',updated_at=now(),retry_at=now()+interval '24 hours' where id=d.id;
  else raise exception 'SOCIAL_CONFLICT'; end if; result:=jsonb_build_object('id',d.id,'status',case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' else 'cancelled' end,'requestId',p_request_id); return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result); end $$;

create function public.send_social_dm_message(p_app_user_id uuid,p_conversation_id uuid,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations%rowtype; m public.social_dm_messages%rowtype; other_id uuid; h text:=md5(btrim(p_body)); allowed boolean; begin perform public.social_request_lock(p_app_user_id,p_request_id); select * into d from public.social_dm_conversations where id=p_conversation_id; if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; other_id:=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end; perform public.social_lock_pair(p_app_user_id,other_id); select * into d from public.social_dm_conversations where id=p_conversation_id for update; if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if; allowed:=d.status='accepted' or exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted'); if not allowed then raise exception 'SOCIAL_FORBIDDEN'; end if;
  select * into m from public.social_dm_messages where sender_id=p_app_user_id and request_id=p_request_id; if found then if m.payload_hash<>h or m.conversation_id<>p_conversation_id then raise exception 'SOCIAL_IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('id',m.id,'createdAt',m.created_at,'replayed',true); end if;
  insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash) values(p_conversation_id,p_app_user_id,btrim(p_body),p_request_id,h) returning * into m; return jsonb_build_object('id',m.id,'createdAt',m.created_at,'replayed',false); end $$;

create function public.read_owned_dm_conversations(p_app_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform public.fan_web_lock_active_user(p_app_user_id); return jsonb_build_object('conversations',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'profileId',o.id,'nickname',coalesce(p.nickname,'Fan'),'avatarUrl',public.public_fan_avatar_url(o.id),'status',case when d.status='pending' and d.requester_id=p_app_user_id then 'outgoing_request' when d.status='pending' then 'incoming_request' else d.status end,'canSend',d.status='accepted' or exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted'),'retryAt',d.retry_at,'latestMessage',(select m.body from public.social_dm_messages m where m.conversation_id=d.id order by m.created_at desc,m.id desc limit 1),'updatedAt',d.updated_at) order by d.updated_at desc,d.id desc) from public.social_dm_conversations d join public.app_users o on o.id=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end and o.status='active' left join public.user_profiles p on p.app_user_id=o.id where p_app_user_id in(d.user_low_id,d.user_high_id) and not public.fan_web_blocked(p_app_user_id,o.id)),'[]'::jsonb)); end $$;

create function public.read_social_dm_messages(p_app_user_id uuid,p_conversation_id uuid,p_after timestamptz,p_after_id uuid,p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.social_dm_conversations%rowtype; other_id uuid; begin perform public.fan_web_lock_active_user(p_app_user_id); select * into d from public.social_dm_conversations where id=p_conversation_id; if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; other_id:=case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end; if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if; if p_limit not between 1 and 100 or (p_after is null)<>(p_after_id is null) then raise exception 'SOCIAL_CONFLICT'; end if;
 return jsonb_build_object('messages',coalesce((select jsonb_agg(x.item order by x.created_at,x.id) from (select m.created_at,m.id,jsonb_build_object('id',m.id,'senderProfileId',m.sender_id,'text',m.body,'createdAt',m.created_at,'reaction',(select r.reaction from public.social_dm_message_reactions r where r.message_id=m.id and r.app_user_id=p_app_user_id),'isMine',m.sender_id=p_app_user_id) item from public.social_dm_messages m where m.conversation_id=p_conversation_id and not exists(select 1 from public.social_dm_message_deletions z where z.message_id=m.id and z.app_user_id=p_app_user_id) and (p_after is null or (m.created_at,m.id)>(p_after,p_after_id)) order by m.created_at,m.id limit p_limit)x),'[]'::jsonb)); end $$;

create function public.react_social_dm_message(p_app_user_id uuid,p_message_id uuid,p_reaction text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.social_dm_conversations%rowtype; replay jsonb; result jsonb; operation text:='react-message:'||p_message_id::text; payload text:=md5(coalesce(p_reaction,'null')); begin perform public.social_request_lock(p_app_user_id,p_request_id); select c.* into d from public.social_dm_messages m join public.social_dm_conversations c on c.id=m.conversation_id where m.id=p_message_id; if not found or p_app_user_id not in(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; perform public.social_lock_pair(d.user_low_id,d.user_high_id); replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload); if replay is not null then return replay; end if; if public.fan_web_blocked(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_BLOCKED'; end if; if p_reaction is null then delete from public.social_dm_message_reactions where message_id=p_message_id and app_user_id=p_app_user_id; elsif p_reaction in('heart','like','laugh','surprise','sad') then insert into public.social_dm_message_reactions(message_id,app_user_id,reaction) values(p_message_id,p_app_user_id,p_reaction) on conflict(message_id,app_user_id) do update set reaction=excluded.reaction,updated_at=now(); else raise exception 'SOCIAL_CONFLICT'; end if; result:=jsonb_build_object('messageId',p_message_id,'reaction',p_reaction,'requestId',p_request_id); return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result); end $$;

create function public.delete_owned_social_dm_message(p_app_user_id uuid,p_message_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.fan_web_lock_active_user(p_app_user_id); if not exists(select 1 from public.social_dm_messages where id=p_message_id and sender_id=p_app_user_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; insert into public.social_dm_message_deletions(message_id,app_user_id) values(p_message_id,p_app_user_id) on conflict do nothing; return jsonb_build_object('deleted',true); end $$;

create function public.report_social_dm_message(p_app_user_id uuid,p_message_id uuid,p_reason text,p_details text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare report_id uuid; replay jsonb; result jsonb; operation text:='report-message:'||p_message_id::text; payload text:=md5(p_reason||':'||coalesce(p_details,'')); begin perform public.social_request_lock(p_app_user_id,p_request_id); perform public.fan_web_lock_active_user(p_app_user_id); replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload); if replay is not null then return replay; end if; if p_reason not in('spam','harassment','sexual','hate','other') or not exists(select 1 from public.social_dm_messages m join public.social_dm_conversations c on c.id=m.conversation_id where m.id=p_message_id and p_app_user_id in(c.user_low_id,c.user_high_id) and m.sender_id<>p_app_user_id) then raise exception 'SOCIAL_NOT_FOUND'; end if; insert into public.social_dm_message_reports(message_id,reporter_id,reason,details,request_id) values(p_message_id,p_app_user_id,p_reason,p_details,p_request_id) returning id into report_id; result:=jsonb_build_object('id',report_id,'reported',true); return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result); end $$;

create function public.block_social_profile(p_app_user_id uuid,p_profile_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb; result jsonb; operation text:='block:'||p_profile_id::text; payload text:=md5(p_profile_id::text); begin perform public.social_request_lock(p_app_user_id,p_request_id); perform public.social_lock_pair(p_app_user_id,p_profile_id); replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload); if replay is not null then return replay; end if; insert into public.user_blocks(app_user_id,blocked_app_user_id) values(p_app_user_id,p_profile_id) on conflict do nothing; update public.social_friendships set status=case when status='pending' then 'cancelled' else 'unfriended' end,ended_at=now() where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) and status in('pending','accepted'); update public.social_dm_conversations set status='rejected',updated_at=now(),retry_at=now()+interval '24 hours' where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id) and status in('pending','accepted'); result:=jsonb_build_object('blocked',true,'requestId',p_request_id); return public.social_action_store(p_app_user_id,p_request_id,operation,payload,result); end $$;
create function public.unblock_social_profile(p_app_user_id uuid,p_profile_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.social_lock_pair(p_app_user_id,p_profile_id); delete from public.user_blocks where app_user_id=p_app_user_id and blocked_app_user_id=p_profile_id; return jsonb_build_object('blocked',false); end $$;

create function public.read_owned_social_blocks(p_app_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object('profileId',u.id,'nickname',coalesce(p.nickname,'Fan'),'avatarUrl',public.public_fan_avatar_url(u.id),'blockedAt',b.created_at) order by b.created_at desc,u.id) from public.user_blocks b join public.app_users u on u.id=b.blocked_app_user_id and u.status='active' left join public.user_profiles p on p.app_user_id=u.id where b.app_user_id=p_app_user_id),'[]'::jsonb));
end $$;

create function public.scrub_social_account_on_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and new.status='disabled' and exists(select 1 from public.account_deletion_requests d where d.app_user_id=new.id and d.status='pending') then
    delete from public.social_profile_settings where app_user_id=new.id;
    delete from public.social_favorite_visibility where app_user_id=new.id;
    delete from public.social_profile_links where app_user_id=new.id;
    update public.social_friendships set status=case when status='pending' then 'cancelled' else 'unfriended' end,ended_at=now() where new.id in(requester_id,addressee_id) and status in('pending','accepted');
    update public.social_dm_conversations set status='cancelled',updated_at=now() where new.id in(user_low_id,user_high_id) and status in('pending','accepted');
    update public.social_dm_messages set body='[deleted]' where sender_id=new.id;
    delete from public.social_dm_message_reactions where app_user_id=new.id;
    delete from public.social_dm_message_deletions where app_user_id=new.id;
    update public.social_dm_message_reports set details=null where reporter_id=new.id;
    delete from public.social_action_requests where actor_id=new.id;
  end if;
  return new;
end $$;
create trigger app_users_scrub_social_on_deletion after update of status on public.app_users for each row execute function public.scrub_social_account_on_deletion();

-- Viewer-aware public fan list. The legacy signature remains available for old callers.
create or replace function public.read_celebrity_fan_community(p_slug text,p_app_user_id uuid,p_locale public.content_locale) returns jsonb language sql stable security definer set search_path='' as $$
 with creator as(select c.id from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale where c.slug=p_slug and c.status='published' and c.archived_at is null),completed as materialized(select r.app_user_id,r.completed_at from public.fan_reactions r join creator c on c.id=r.celebrity_id join public.app_users u on u.id=r.app_user_id and u.status='active' where r.business_status='completed'),eligible_events as materialized(select app_user_id,completed_at occurred_at from completed union all select p.app_user_id,p.issued_at from public.fan_passports p join creator c on c.id=p.celebrity_id join public.app_users u on u.id=p.app_user_id and u.status='active' where p.business_status='issued'),eligible as materialized(select app_user_id,max(occurred_at)occurred_at from eligible_events group by app_user_id),selected as(select e.app_user_id,e.occurred_at,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end)nickname,public.public_fan_avatar_url(e.app_user_id)avatar_url from eligible e left join public.user_profiles p on p.app_user_id=e.app_user_id where p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,e.app_user_id) order by e.occurred_at desc,e.app_user_id limit 24)
 select jsonb_build_object('likeCount',(select count(distinct app_user_id)from completed),'fanCount',(select count(*)from eligible),'publicFanCount',(select count(*)from eligible where p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,app_user_id)),'fans',coalesce((select jsonb_agg(jsonb_build_object('profileId',app_user_id,'nickname',nickname,'avatarUrl',avatar_url)order by occurred_at desc,app_user_id)from selected),'[]'::jsonb))from creator $$;
create or replace function public.read_celebrity_fan_community(p_slug text,p_locale public.content_locale default 'ko') returns jsonb language sql stable security definer set search_path='' as $$ select public.read_celebrity_fan_community(p_slug,null,p_locale) $$;

-- Patch the latest category leaderboard with stable profile IDs and bilateral block filtering.
create or replace function public.read_celebrity_fan_leaderboard(p_slug text,p_app_user_id uuid,p_locale public.content_locale,p_category text) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin if p_category is null or p_category not in('all','knowledge','live','mission','certification')then raise exception 'invalid leaderboard category'using errcode='22023';end if; with creator as(select id from public.celebrities where slug=p_slug and status='published' and archived_at is null),passports as materialized(select p.app_user_id,p.issued_at from public.fan_passports p join creator c on c.id=p.celebrity_id join public.app_users u on u.id=p.app_user_id and u.status='active' where p.business_status='issued'),eligible_events as materialized(select p.app_user_id,p.issued_at occurred_at,p.issued_at passport_issued_at from passports p union all select r.app_user_id,r.completed_at,null::timestamptz from public.fan_reactions r join creator c on c.id=r.celebrity_id join public.app_users u on u.id=r.app_user_id and u.status='active' where r.business_status='completed'),fan_identities as materialized(select e.app_user_id,max(e.passport_issued_at)passport_issued_at,min(e.occurred_at)joined_at from eligible_events e group by e.app_user_id),fans as materialized(select e.*,coalesce(sum(s.points)filter(where p_category='all'or p_category='knowledge'and a.activity_type='knowledge'or p_category='live'and a.activity_type in('reservation','attendance')or p_category='mission'and a.activity_type='survey'or p_category='certification'and s.manual_submission_id is not null),0)::integer points from fan_identities e left join creator c on true left join public.fan_score_ledger s on s.app_user_id=e.app_user_id and s.celebrity_id=c.id left join public.fan_activities a on a.id=s.activity_id and a.app_user_id=s.app_user_id and a.celebrity_id=s.celebrity_id group by e.app_user_id,e.passport_issued_at,e.joined_at),counts as(select(select count(*)from passports)membership_count,count(*)fan_count from fans),category_fans as(select*from fans where(p_category='all'or points>0)and(p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,app_user_id))),ranked as(select f.*,row_number()over(order by points desc,coalesce(passport_issued_at,joined_at),app_user_id)rank from category_fans f where(select fan_count>=100 from counts)),display as(select r.*,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko'then'팬'else'Fan'end)nickname,public.public_fan_avatar_url(r.app_user_id)avatar_url from ranked r left join public.user_profiles p on p.app_user_id=r.app_user_id)select jsonb_build_object('membershipCount',(select membership_count from counts),'fanCount',(select fan_count from counts),'available',(select fan_count>=100 from counts),'asOf',statement_timestamp(),'rows',coalesce((select jsonb_agg(jsonb_build_object('profileId',app_user_id,'rank',rank,'nickname',nickname,'avatarUrl',avatar_url,'points',points)order by rank)from display where rank<=100),'[]'::jsonb),'me',(select jsonb_build_object('profileId',app_user_id,'rank',rank,'nickname',nickname,'avatarUrl',avatar_url,'points',points)from display where app_user_id=p_app_user_id))into result from creator;return result;end $$;
create or replace function public.read_celebrity_fan_leaderboard(p_slug text,p_app_user_id uuid,p_locale public.content_locale)returns jsonb language sql stable security definer set search_path=''as $$select public.read_celebrity_fan_leaderboard(p_slug,p_app_user_id,p_locale,'all')$$;

revoke all on function public.social_lock_pair(uuid,uuid),public.social_request_lock(uuid,uuid),public.social_action_claim(uuid,uuid,text,text),public.social_action_store(uuid,uuid,text,text,jsonb),public.scrub_social_account_on_deletion(),public.read_owned_social_settings(uuid),public.read_owned_social_profile_link(uuid),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale),public.read_owned_social_request_status(uuid,uuid),public.set_owned_social_settings(uuid,boolean,text[],text),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.request_social_friend(uuid,uuid,text,uuid),public.resolve_social_friend(uuid,uuid,text,uuid),public.read_owned_social_friends(uuid,public.content_locale),public.request_social_dm(uuid,uuid,text,uuid),public.resolve_social_dm(uuid,uuid,text,uuid),public.send_social_dm_message(uuid,uuid,text,uuid),public.read_owned_dm_conversations(uuid),public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer),public.react_social_dm_message(uuid,uuid,text,uuid),public.delete_owned_social_dm_message(uuid,uuid),public.report_social_dm_message(uuid,uuid,text,text,uuid),public.block_social_profile(uuid,uuid,uuid),public.unblock_social_profile(uuid,uuid),public.read_owned_social_blocks(uuid),public.read_celebrity_fan_community(text,uuid,public.content_locale),public.read_celebrity_fan_community(text,public.content_locale),public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale,text),public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_social_settings(uuid),public.read_owned_social_profile_link(uuid),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale),public.read_owned_social_request_status(uuid,uuid),public.set_owned_social_settings(uuid,boolean,text[],text),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.request_social_friend(uuid,uuid,text,uuid),public.resolve_social_friend(uuid,uuid,text,uuid),public.read_owned_social_friends(uuid,public.content_locale),public.request_social_dm(uuid,uuid,text,uuid),public.resolve_social_dm(uuid,uuid,text,uuid),public.send_social_dm_message(uuid,uuid,text,uuid),public.read_owned_dm_conversations(uuid),public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer),public.react_social_dm_message(uuid,uuid,text,uuid),public.delete_owned_social_dm_message(uuid,uuid),public.report_social_dm_message(uuid,uuid,text,text,uuid),public.block_social_profile(uuid,uuid,uuid),public.unblock_social_profile(uuid,uuid),public.read_owned_social_blocks(uuid),public.read_celebrity_fan_community(text,uuid,public.content_locale),public.read_celebrity_fan_community(text,public.content_locale),public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale,text),public.read_celebrity_fan_leaderboard(text,uuid,public.content_locale) to service_role;

commit;
