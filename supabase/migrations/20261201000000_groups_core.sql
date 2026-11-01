begin;

create table public.group_pages (
 id uuid primary key default extensions.gen_random_uuid(), kind text not null check(kind in ('fan','hobby','brand')),
 celebrity_id uuid unique references public.celebrities(id) on delete restrict,
 name text not null check(length(btrim(name)) between 1 and 100), description text not null default '' check(length(description)<=1000),
 image_url text check(image_url is null or image_url ~ '^https://' or image_url ~ '^/[^/]'), question text check(length(question)<=300),
 status text not null default 'published' check(status in ('published','hidden')), anonymous boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(kind<>'fan' or celebrity_id is not null)
);
create table public.group_memberships (
 page_id uuid not null references public.group_pages(id) on delete restrict,
 app_user_id uuid not null references public.app_users(id) on delete restrict,
 role text not null default 'member' check(role in ('owner','manager','member')), answer text check(length(answer)<=1000),
 joined_at timestamptz not null default now(), primary key(page_id,app_user_id)
);
create unique index group_single_owner on public.group_memberships(page_id) where role='owner';
create table public.group_applications (
 id uuid primary key default extensions.gen_random_uuid(), applicant_id uuid not null references public.app_users(id) on delete restrict,
 kind text not null check(kind in ('fan','hobby','brand')), name text not null check(length(btrim(name)) between 1 and 100),
 description text not null check(length(btrim(description)) between 1 and 1000), image_url text check(image_url is null or image_url ~ '^https://' or image_url ~ '^/[^/]'), question text check(length(question)<=300),
 status text not null default 'submitted' check(status in ('submitted','changes_requested','approved','rejected')),
 reason text, page_id uuid references public.group_pages(id), reviewed_by uuid references public.admin_allowlist(id),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.group_bookmarks(page_id uuid not null references public.group_pages(id), app_user_id uuid not null references public.app_users(id), primary key(page_id,app_user_id));
create table public.group_posts (
 id uuid primary key default extensions.gen_random_uuid(), page_id uuid not null references public.group_pages(id),
 author_id uuid not null references public.app_users(id), title text not null check(length(btrim(title)) between 1 and 100),
 body text not null check(length(btrim(body)) between 1 and 20000), visibility text not null check(visibility in ('public','members')),
 anonymous boolean not null, created_at timestamptz not null default clock_timestamp(), removed_at timestamptz
);
create index group_posts_page_cursor on public.group_posts(page_id,created_at desc,id desc) where removed_at is null;
create table public.group_rooms (
 id uuid primary key default extensions.gen_random_uuid(), page_id uuid not null references public.group_pages(id),
 name text not null check(length(btrim(name)) between 1 and 100), minimum_tier text not null default 'Gold' check(minimum_tier in ('Bronze','Silver','Gold','Platinum','Diamond')),
 status text not null default 'open' check(status in ('scheduled','open','readonly','closed')), created_at timestamptz not null default now()
);
create table public.group_messages (
 id uuid primary key default extensions.gen_random_uuid(), room_id uuid not null references public.group_rooms(id),
 author_id uuid not null references public.app_users(id), body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default clock_timestamp()
);
create index group_messages_cursor on public.group_messages(room_id,created_at,id);
create table public.group_action_receipts (
 actor_id uuid not null references public.app_users(id), request_id uuid not null, operation text not null, payload jsonb not null,
 response jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,request_id)
);

-- Additive backfill preserves original creator and member identities; no new verification is issued.
insert into public.group_pages(id,kind,celebrity_id,name,description,image_url)
 select c.id,case when coalesce(to_jsonb(c)->'roles','[]'::jsonb) ? 'brand' then 'brand' else 'fan' end,c.id,
 coalesce((select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),c.slug),
 coalesce((select l.summary from public.celebrity_localizations l where l.celebrity_id=c.id order by (l.locale::text='ko') desc limit 1),''),c.image_url
 from public.celebrities c where c.status='published' and c.archived_at is null on conflict(celebrity_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,joined_at)
 select g.id,p.app_user_id,p.issued_at from public.fan_passports p join public.group_pages g on g.celebrity_id=p.celebrity_id
 join public.app_users u on u.id=p.app_user_id and u.status='active' where p.business_status='issued'
 on conflict(page_id,app_user_id) do nothing;

create function public.group_page_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',g.name,'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id))
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;
create function public.group_room_allowed(p_actor uuid,p_page uuid,p_minimum text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id
 where m.page_id=p_page and m.app_user_id=p_actor and (g.kind<>'fan' or (
 exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=g.celebrity_id and p.business_status='issued')
 and public.fan_level_rank(public.get_fan_effective_tier(p_actor,g.celebrity_id))>=public.fan_level_rank(p_minimum))))
$$;
create function public.group_post_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'pageId',p.page_id,'title',p.title,'body',p.body,'visibility',p.visibility,'anonymous',p.anonymous,
 'profileId',case when p.anonymous then null else p.author_id end,'nickname',case when p.anonymous then '익명' else coalesce(u.nickname,'팬') end,
 'avatarUrl',case when p.anonymous then null else '/images/avatars/'||coalesce(a.selected_character_id,'star-pink')||'.webp' end,'createdAt',p.created_at)
 from public.group_posts p left join public.user_profiles u on u.app_user_id=p.author_id left join public.app_user_avatars a on a.app_user_id=p.author_id where p.id=p_id
$$;

create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.group_pages; a public.group_applications; r public.group_rooms; existing public.group_action_receipts;
 member_role text; is_admin boolean := false; result jsonb; new_id uuid; req uuid; payload jsonb; target uuid; v_limit integer; v_cursor uuid;
begin
 if p_actor is not null and not exists(select 1 from public.app_users where id=p_actor and status='active') then raise exception 'GROUPS_FORBIDDEN'; end if;
 if p_operation in ('admin-applications','review') then
  if p_actor is null or not exists(select 1 from public.admin_allowlist where id=p_admin_id and active and (p_operation='admin-applications' or role::text<>'viewer')) then raise exception 'GROUPS_FORBIDDEN'; end if;
  is_admin:=true;
 end if;
 if p_operation not in ('directory','resolve','detail','posts','post-detail') and p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
 if p_page_id is not null and p_operation not in ('directory','detail','posts','post-detail','members','rooms','messages') then perform pg_advisory_xact_lock(hashtextextended('groups-page:'||p_page_id::text,0)); end if;
 if p_page_id is not null then
  select * into g from public.group_pages where id=p_page_id and status='published' and (celebrity_id is null or exists(select 1 from public.celebrities c where c.id=celebrity_id and c.status='published' and c.archived_at is null));
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  select role into member_role from public.group_memberships where page_id=p_page_id and app_user_id=p_actor;
 end if;
 if p_operation in ('role','transfer','room','settings') and coalesce(member_role,'') not in ('owner','manager') then raise exception 'GROUPS_FORBIDDEN'; end if;
 if p_operation in ('join','leave','bookmark','unbookmark','role','transfer','post','post-remove','room','message','settings') and p_page_id is null then raise exception 'GROUPS_INVALID_REQUEST'; end if;
 if p_operation in ('post','post-edit','message') and member_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
 if p_operation in ('apply','revise','post-edit','join','role','transfer','post','room','message','settings','review') then
  req:=(p_input->>'requestId')::uuid;
  if req is null then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('groups-request:'||p_actor::text||':'||req::text,0));
  payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'input',p_input);
  select * into existing from public.group_action_receipts where actor_id=p_actor and request_id=req;
  if found then
   if existing.operation<>p_operation or existing.payload<>payload then raise exception 'GROUPS_CONFLICT'; end if;
   return existing.response;
  end if;
 end if;
 case p_operation
 when 'directory' then
  if p_input->>'mine' is not null and p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,8),1),50); v_cursor:=(p_input->>'cursor')::uuid;
  with filtered as (
   select gp.id,gp.created_at,(select count(*) from public.group_memberships m where m.page_id=gp.id) n
   from public.group_pages gp where gp.status='published' and (gp.celebrity_id is null or exists(select 1 from public.celebrities c where c.id=gp.celebrity_id and c.status='published' and c.archived_at is null)) and (coalesce(p_input->>'type','all')='all' or gp.kind=p_input->>'type')
   and (coalesce(p_input->>'search','')='' or gp.name ilike '%'||(p_input->>'search')||'%')
   and (p_input->>'mine' is null or p_input->>'mine'='joined' and exists(select 1 from public.group_memberships m where m.page_id=gp.id and m.app_user_id=p_actor)
    or p_input->>'mine'='bookmarked' and exists(select 1 from public.group_bookmarks b where b.page_id=gp.id and b.app_user_id=p_actor))
  ), ranked as (select *,row_number() over(order by case when p_input->>'sort'='popular' then n end desc nulls last,created_at desc,id) rn from filtered),
  limited as (select * from ranked where rn>coalesce((select rn from ranked where id=v_cursor),0) order by rn limit v_limit+1),
  shown as(select * from limited order by rn limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(public.group_page_json(id) order by rn) from shown),'[]'::jsonb),
   'nextCursor',case when (select count(*) from limited)>v_limit then (select id from shown order by rn desc limit 1) end) into result;
 when 'resolve','detail' then
  if p_operation='resolve' then
   select gp.* into g from public.group_pages gp join public.celebrities c on c.id=gp.celebrity_id where c.slug=p_input->>'slug' and gp.status='published' and c.status='published' and c.archived_at is null;
  end if;
  if g.id is null then raise exception 'GROUPS_NOT_FOUND'; end if;
  result:=jsonb_build_object('page',public.group_page_json(g.id),'membership',(select jsonb_build_object('role',role,'joinedAt',joined_at) from public.group_memberships where page_id=g.id and app_user_id=p_actor),
   'bookmarked',exists(select 1 from public.group_bookmarks where page_id=g.id and app_user_id=p_actor));
 when 'applications' then
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'description',description,'imageUrl',image_url,'question',question,'status',status,'reason',reason,'pageId',page_id,'createdAt',created_at) order by created_at desc),'[]'::jsonb)) into result from public.group_applications where applicant_id=p_actor;
 when 'admin-applications' then
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into result from (select * from public.group_applications order by created_at desc limit 100) x;
 when 'apply' then
  insert into public.group_applications(applicant_id,kind,name,description,image_url,question)
   values(p_actor,p_input->>'kind',p_input->>'name',p_input->>'description',p_input->>'imageUrl',nullif(p_input->>'question','')) returning id into new_id;
  result:=jsonb_build_object('id',new_id,'status','submitted','pageId',null);
 when 'revise' then
  select * into a from public.group_applications where id=p_item_id and applicant_id=p_actor for update;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  if a.status<>'changes_requested' then raise exception 'GROUPS_CONFLICT'; end if;
  update public.group_applications set kind=p_input->>'kind',name=p_input->>'name',description=p_input->>'description',image_url=p_input->>'imageUrl',question=p_input->>'question',status='submitted' where id=a.id;
  result:=jsonb_build_object('id',a.id,'status','submitted','pageId',null);
 when 'review' then
  select * into a from public.group_applications where id=p_item_id for update;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  if not exists(select 1 from public.app_users where id=a.applicant_id and status='active') then raise exception 'GROUPS_FORBIDDEN'; end if;
  if a.status in ('approved','rejected') then raise exception 'GROUPS_CONFLICT'; end if;
  if p_input->>'action'='approve' then
   if a.kind='fan' and not exists(select 1 from public.celebrities where id=(p_input->>'celebrityId')::uuid and status='published' and archived_at is null) then raise exception 'GROUPS_INVALID_REQUEST'; end if;
   if a.kind='fan' then
    select id into new_id from public.group_pages where celebrity_id=(p_input->>'celebrityId')::uuid;
    if new_id is not null and exists(select 1 from public.group_memberships where page_id=new_id and role='owner') then raise exception 'GROUPS_CONFLICT'; end if;
   end if;
   if new_id is null then insert into public.group_pages(kind,celebrity_id,name,description,image_url,question) values(a.kind,case when a.kind='fan' then (p_input->>'celebrityId')::uuid end,a.name,a.description,a.image_url,a.question) returning id into new_id; end if;
   insert into public.group_memberships(page_id,app_user_id,role) values(new_id,a.applicant_id,'owner') on conflict(page_id,app_user_id) do update set role='owner';
   update public.group_applications set status='approved',page_id=new_id,reviewed_by=p_admin_id,reviewed_at=now(),reason=p_input->>'reason' where id=a.id;
  else
   if p_input->>'action' not in ('reject','request_changes') then raise exception 'GROUPS_INVALID_REQUEST'; end if;
   update public.group_applications set status=case when p_input->>'action'='reject' then 'rejected' else 'changes_requested' end,reason=p_input->>'reason',reviewed_by=p_admin_id,reviewed_at=now() where id=a.id;
  end if;
  select jsonb_build_object('id',id,'status',status,'pageId',page_id) into result from public.group_applications where id=a.id;
 when 'join' then
  if nullif(g.question,'') is not null and length(btrim(coalesce(p_input->>'answer','')))=0 then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  insert into public.group_memberships(page_id,app_user_id,answer) values(g.id,p_actor,p_input->>'answer') on conflict(page_id,app_user_id) do nothing;
  select jsonb_build_object('role',role,'joinedAt',joined_at) into result from public.group_memberships where page_id=g.id and app_user_id=p_actor;
 when 'leave' then
  perform pg_advisory_xact_lock(hashtextextended('group-members:'||g.id::text,0));
  if member_role='owner' then raise exception 'GROUPS_CONFLICT'; end if;
  delete from public.group_memberships where page_id=g.id and app_user_id=p_actor; result:=jsonb_build_object('joined',false);
 when 'bookmark' then insert into public.group_bookmarks values(g.id,p_actor) on conflict do nothing; result:=jsonb_build_object('bookmarked',true);
 when 'unbookmark' then delete from public.group_bookmarks where page_id=g.id and app_user_id=p_actor; result:=jsonb_build_object('bookmarked',false);
 when 'members' then
  if member_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100); v_cursor:=(p_input->>'cursor')::uuid;
  with selected as (
   select m.* from public.group_memberships m join public.app_users au on au.id=m.app_user_id and au.status='active'
   where m.page_id=g.id and (v_cursor is null or (m.joined_at,m.app_user_id)>(select joined_at,app_user_id from public.group_memberships where page_id=g.id and app_user_id=v_cursor))
   order by m.joined_at,m.app_user_id limit v_limit+1
  ), shown as (select * from selected order by joined_at,app_user_id limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('profileId',m.app_user_id,'nickname',coalesce(u.nickname,'팬'),'avatarUrl','/images/avatars/'||coalesce(av.selected_character_id,'star-pink')||'.webp','role',m.role,'answer',case when member_role in ('owner','manager') then m.answer end) order by m.joined_at,m.app_user_id) from shown m left join public.user_profiles u on u.app_user_id=m.app_user_id left join public.app_user_avatars av on av.app_user_id=m.app_user_id),'[]'::jsonb),
   'nextCursor',case when (select count(*) from selected)>v_limit then (select app_user_id from shown order by joined_at desc,app_user_id desc limit 1) end) into result;
 when 'role','transfer' then
  perform pg_advisory_xact_lock(hashtextextended('group-members:'||g.id::text,0));
  select role into member_role from public.group_memberships where page_id=g.id and app_user_id=p_actor for update;
  if member_role<>'owner' then raise exception 'GROUPS_FORBIDDEN'; end if;
  if p_operation='role' and coalesce(p_input->>'role','') not in ('manager','member') then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  target:=(p_input->>'appUserId')::uuid;
  if target=p_actor or not exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=target) then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  if p_operation='transfer' then
   update public.group_memberships set role='member' where page_id=g.id and app_user_id=p_actor;
   update public.group_memberships set role='owner' where page_id=g.id and app_user_id=target;
  else update public.group_memberships set role=p_input->>'role' where page_id=g.id and app_user_id=target; end if;
  result:=jsonb_build_object('updated',true);
 when 'settings' then
  update public.group_pages set name=p_input->>'name',description=p_input->>'description',question=nullif(p_input->>'question',''),anonymous=(p_input->>'anonymous')::boolean,updated_at=now() where id=g.id;
  result:=public.group_page_json(g.id);
 when 'posts' then
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100); v_cursor:=(p_input->>'cursor')::uuid;
  select jsonb_build_object('items',coalesce(jsonb_agg(public.group_post_json(id) order by created_at desc,id desc),'[]'::jsonb),'nextCursor',case when count(*)=v_limit then (array_agg(id order by created_at,id))[1] end) into result
  from (select p.id,p.created_at from public.group_posts p where p.page_id=g.id and p.removed_at is null and (p.visibility='public' or member_role is not null)
    and (v_cursor is null or (p.created_at,p.id)<(select created_at,id from public.group_posts where id=v_cursor and page_id=g.id)) order by p.created_at desc,p.id desc limit v_limit) x;
 when 'post-detail' then
  if not exists(select 1 from public.group_posts where id=p_item_id and page_id=g.id and removed_at is null and (visibility='public' or member_role is not null)) then raise exception 'GROUPS_NOT_FOUND'; end if;
  result:=public.group_post_json(p_item_id);
 when 'post' then
  if member_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  insert into public.group_posts(page_id,author_id,title,body,visibility,anonymous) values(g.id,p_actor,p_input->>'title',p_input->>'body',p_input->>'visibility',g.anonymous) returning id into new_id;
  result:=public.group_post_json(new_id);
 when 'post-edit' then
  update public.group_posts set title=p_input->>'title',body=p_input->>'body',visibility=p_input->>'visibility' where id=p_item_id and page_id=g.id and author_id=p_actor and removed_at is null;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  result:=public.group_post_json(p_item_id);
 when 'post-remove' then
  update public.group_posts set removed_at=now() where id=p_item_id and page_id=g.id and (author_id=p_actor or member_role in ('owner','manager'));
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if; result:=jsonb_build_object('removed',true);
 when 'rooms' then
  if member_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'minimumTier',minimum_tier,'status',status,'canEnter',public.group_room_allowed(p_actor,g.id,minimum_tier)) order by created_at desc),'[]'::jsonb)) into result from public.group_rooms where page_id=g.id;
 when 'room' then
  insert into public.group_rooms(page_id,name,minimum_tier) values(g.id,p_input->>'name',coalesce(p_input->>'minimumTier','Gold')) returning id into new_id;
  result:=jsonb_build_object('id',new_id,'name',p_input->>'name','status','open');
 when 'messages','message' then
  select * into r from public.group_rooms where id=p_item_id and page_id=g.id;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  if not public.group_room_allowed(p_actor,g.id,r.minimum_tier) or r.status in ('scheduled','closed') then raise exception 'GROUPS_FORBIDDEN'; end if;
  if p_operation='message' then
   if r.status<>'open' then raise exception 'GROUPS_FORBIDDEN'; end if;
   insert into public.group_messages(room_id,author_id,body) values(r.id,p_actor,p_input->>'body') returning id into new_id;
   result:=jsonb_build_object('id',new_id,'body',p_input->>'body','createdAt',(select created_at from public.group_messages where id=new_id));
  else
   v_cursor:=(p_input->>'cursor')::uuid; v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,50),1),100);
   select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'profileId',m.author_id,'nickname',coalesce(u.nickname,'팬'),'createdAt',m.created_at) order by m.created_at,m.id),'[]'::jsonb)) into result
   from (select * from public.group_messages where room_id=r.id and (v_cursor is null or (created_at,id)>(select created_at,id from public.group_messages where id=v_cursor and room_id=r.id)) order by created_at,id limit v_limit) m left join public.user_profiles u on u.app_user_id=m.author_id;
  end if;
 else raise exception 'GROUPS_INVALID_REQUEST';
 end case;
 if req is not null then insert into public.group_action_receipts(actor_id,request_id,operation,payload,response) values(p_actor,req,p_operation,payload,result); end if;
 return result;
end $$;

do $$ declare t text; begin
 foreach t in array array['group_pages','group_memberships','group_applications','group_bookmarks','group_posts','group_rooms','group_messages','group_action_receipts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function public.group_page_json(uuid),public.group_room_allowed(uuid,uuid,text),public.group_post_json(uuid),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
commit;
