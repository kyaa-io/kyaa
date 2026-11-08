-- 261107-2 C4: thumbs up and thumbs down on fan board and group posts.
--
-- One reaction per person per post: a like, a dislike, or none. Liking clears a dislike and disliking clears a like.
-- Dislikes live in their own tables, so nothing that already counts fan_post_likes or group_post_reactions
-- (like counts, popular board scores, period rankings, notifications, points, account deletion) sees them.
-- Only the functions in this file read the dislike tables.
--
-- Who sees the dislike count: the post's author and the page's operators (fan page: active channel operator or the linked
-- group page owner/manager; group page: owner/manager, or an admin call). Everyone else gets dislikeCount null and only their
-- own choice. Counts only include active accounts, the same rule as like counts.
--
-- Rollback: supabase/rollback/20261215030000_post_dislikes.sql (roll the web back first).
begin;
set local lock_timeout = '5s';

create table public.fan_post_dislikes (
  post_id uuid not null references public.fan_posts(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,app_user_id)
);
create table public.group_post_dislikes (
  post_id uuid not null references public.group_posts(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,app_user_id)
);
create index fan_post_dislikes_owner on public.fan_post_dislikes(app_user_id);
create index group_post_dislikes_owner on public.group_post_dislikes(app_user_id);

do $$ declare t text; owner_role record; begin
  select rolname,rolsuper,rolbypassrls into owner_role from pg_roles where rolname=current_user;
  foreach t in array array['fan_post_dislikes','group_post_dislikes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    -- Forced row security binds the owner too. An owner that cannot bypass it gets a policy for itself alone,
    -- or every function in this file would read and write nothing without an error.
    if not owner_role.rolsuper and not owner_role.rolbypassrls then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)',t||'_owner',t,owner_role.rolname);
    end if;
  end loop;
end $$;

-- One reaction per person per post, whichever path writes it (the existing like RPC and group 'reaction' included).
create function public.clear_opposite_post_reaction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='fan_post_likes' then delete from public.fan_post_dislikes where post_id=new.post_id and app_user_id=new.app_user_id;
 elsif tg_table_name='fan_post_dislikes' then delete from public.fan_post_likes where post_id=new.post_id and app_user_id=new.app_user_id;
 elsif tg_table_name='group_post_reactions' then delete from public.group_post_dislikes where post_id=new.post_id and app_user_id=new.app_user_id;
 elsif tg_table_name='group_post_dislikes' then delete from public.group_post_reactions where post_id=new.post_id and app_user_id=new.app_user_id;
 end if;
 return new;
end $$;
create trigger clear_post_dislike after insert on public.fan_post_likes for each row execute function public.clear_opposite_post_reaction();
create trigger clear_post_like after insert on public.fan_post_dislikes for each row execute function public.clear_opposite_post_reaction();
create trigger clear_post_dislike after insert on public.group_post_reactions for each row execute function public.clear_opposite_post_reaction();
create trigger clear_post_like after insert on public.group_post_dislikes for each row execute function public.clear_opposite_post_reaction();

-- Account deletion: same moment as scrub_social_account_on_deletion.
create function public.scrub_post_dislikes_on_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and new.status='disabled' and exists(select 1 from public.account_deletion_requests d where d.app_user_id=new.id and d.status='pending') then
  delete from public.fan_post_dislikes where app_user_id=new.id;
  delete from public.group_post_dislikes where app_user_id=new.id;
 end if;
 return new;
end $$;
create trigger app_users_scrub_post_dislikes after update of status on public.app_users for each row execute function public.scrub_post_dislikes_on_deletion();

-- Fan board ----------------------------------------------------------------------------------------------------------
create function public.fan_post_dislike_count_visible(p_app_user_id uuid,p_post_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_app_user_id is not null and exists(
  select 1 from public.fan_posts p where p.id=p_post_id and (
   p.app_user_id=p_app_user_id
   or exists(select 1 from public.channel_operators o join public.app_users u on u.id=o.app_user_id and u.status='active'
             where o.app_user_id=p_app_user_id and o.celebrity_id=p.celebrity_id and o.status='active')
   or exists(select 1 from public.group_pages g join public.group_memberships m on m.page_id=g.id
             where g.celebrity_id=p.celebrity_id and m.app_user_id=p_app_user_id and m.role in('owner','manager'))))
$$;

-- null when the post is not visible to the reader, the same answer read_fan_post gives.
create function public.read_fan_post_reaction(p_app_user_id uuid,p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fan_web_content_visible(p_app_user_id,'fan_post',p_post_id) then return null; end if;
 return jsonb_build_object(
  'reaction',case when p_app_user_id is null then null
   when exists(select 1 from public.fan_post_likes where post_id=p_post_id and app_user_id=p_app_user_id) then 'like'
   when exists(select 1 from public.fan_post_dislikes where post_id=p_post_id and app_user_id=p_app_user_id) then 'dislike' end,
  'dislikeCount',case when public.fan_post_dislike_count_visible(p_app_user_id,p_post_id) then
   (select count(*) from public.fan_post_dislikes d join public.app_users u on u.id=d.app_user_id and u.status='active' where d.post_id=p_post_id) end);
end $$;

-- set_fan_post_like keeps every check (page membership, active account, visibility, rate limit) for all three choices.
create function public.set_fan_post_reaction(p_app_user_id uuid,p_post_id uuid,p_reaction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare had_dislike boolean;
begin
 if p_reaction is null or p_reaction not in('like','dislike','none') then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
 if p_reaction='like' then
  perform public.set_fan_post_like(p_app_user_id,p_post_id,true);
 else
  perform public.set_fan_post_like(p_app_user_id,p_post_id,false);
  had_dislike:=exists(select 1 from public.fan_post_dislikes where post_id=p_post_id and app_user_id=p_app_user_id);
  if (p_reaction='dislike')<>had_dislike then
   if (select count(*) from public.content_write_events where app_user_id=p_app_user_id and kind='like' and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'FAN_WEB_RATE_LIMITED'; end if;
   if p_reaction='dislike' then insert into public.fan_post_dislikes(post_id,app_user_id) values(p_post_id,p_app_user_id) on conflict do nothing;
   else delete from public.fan_post_dislikes where post_id=p_post_id and app_user_id=p_app_user_id; end if;
   insert into public.content_write_events(app_user_id,kind) values(p_app_user_id,'like');
  end if;
 end if;
 return public.read_fan_post_reaction(p_app_user_id,p_post_id);
end $$;

-- Group posts --------------------------------------------------------------------------------------------------------
create function public.group_post_dislike_count_visible(p_actor uuid,p_post_id uuid,p_admin_id uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select p_admin_id is not null or (p_actor is not null and exists(
  select 1 from public.group_posts p join public.group_pages g on g.id=p.page_id where p.id=p_post_id and (
   p.author_id=p_actor
   or exists(select 1 from public.group_memberships m where m.page_id=g.id and m.app_user_id=p_actor and m.role in('owner','manager'))
   or (g.celebrity_id is not null and exists(select 1 from public.channel_operators o join public.app_users u on u.id=o.app_user_id and u.status='active'
       where o.app_user_id=p_actor and o.celebrity_id=g.celebrity_id and o.status='active')))))
$$;

create function public.group_post_reaction_json(p_actor uuid,p_post_id uuid,p_admin_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'disliked',p_actor is not null and exists(select 1 from public.group_post_dislikes where post_id=p_post_id and app_user_id=p_actor),
  'dislikeCount',case when public.group_post_dislike_count_visible(p_actor,p_post_id,p_admin_id) then
   (select count(*) from public.group_post_dislikes d join public.app_users u on u.id=d.app_user_id and u.status='active' where d.post_id=p_post_id) end)
$$;

alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_post_dislike;
create function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_role text; v_disliked boolean;
begin
 if p_operation='dislike' then
  -- The same gates the 'reaction' operation passes: signed in, active and unrestricted, page readable, a member, the post visible.
  if p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  -- An active, unrestricted account, checked first like every content write (review r4 M3).
  perform public.fan_web_lock_active_user(p_actor);
  if p_page_id is null then raise exception 'GROUPS_NOT_FOUND'; end if;
  v_disliked:=(p_input->>'disliked')::boolean;
  if v_disliked is null then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended('groups-page:'||p_page_id::text,0));
  perform public.groups_dispatch('detail',p_actor,p_page_id);
  select m.role into v_role from public.group_memberships m where m.page_id=p_page_id and m.app_user_id=p_actor;
  if v_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  if not exists(select 1 from public.group_posts p where p.id=p_item_id and p.page_id=p_page_id) or not public.group_post_visible(p_actor,p_item_id) then raise exception 'GROUPS_NOT_FOUND'; end if;
  if v_disliked then insert into public.group_post_dislikes(post_id,app_user_id) values(p_item_id,p_actor) on conflict do nothing;
  else delete from public.group_post_dislikes where post_id=p_item_id and app_user_id=p_actor; end if;
  return jsonb_build_object('liked',exists(select 1 from public.group_post_reactions where post_id=p_item_id and app_user_id=p_actor),
   'count',(select count(*) from public.group_post_reactions where post_id=p_item_id))||public.group_post_reaction_json(p_actor,p_item_id,p_admin_id);
 end if;
 result:=public.groups_content_dispatch_before_post_dislike(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 -- post-detail has already applied group_post_visible for this actor.
 if p_operation='post-detail' and jsonb_typeof(result)='object' and result?'id' then
  result:=result||public.group_post_reaction_json(p_actor,(result->>'id')::uuid,p_admin_id);
 end if;
 return result;
end $$;

revoke all on function public.clear_opposite_post_reaction(),public.scrub_post_dislikes_on_deletion(),
 public.fan_post_dislike_count_visible(uuid,uuid),public.read_fan_post_reaction(uuid,uuid),public.set_fan_post_reaction(uuid,uuid,text),
 public.group_post_dislike_count_visible(uuid,uuid,uuid),public.group_post_reaction_json(uuid,uuid,uuid),
 public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),
 public.groups_content_dispatch_before_post_dislike(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_fan_post_reaction(uuid,uuid),public.set_fan_post_reaction(uuid,uuid,text),
 public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

-- Review r4 M2: the functions above are owned by the applying role. In dev that role is not a superuser and some of the tables
-- they read or write directly are owned by another role or have FORCE row security with no policy for it, which makes reads
-- answer 0 rows (a liked post read as no reaction) and the write to content_write_events fail with 42501. Reproduced locally
-- with a non-superuser owner that is a member of the table owners. Same remedy as 20261210240000 (p3_fn_owner_<role>):
-- the privilege it needs and a policy for that role alone, only where row security would otherwise apply to it.
do $$
declare me record; t record;
begin
 select oid,rolname,rolsuper,rolbypassrls into me from pg_roles where rolname=current_user;
 if me.rolsuper or me.rolbypassrls then return; end if;
 for t in select * from (values
   ('fan_post_likes','select, delete'),('content_write_events','select, insert'),('fan_posts','select'),
   ('group_pages','select'),('group_memberships','select'),('group_posts','select'),('group_post_reactions','select, delete'),
   ('channel_operators','select'),('account_deletion_requests','select'),('app_users','select')) v(tname,privs) loop
  execute format('grant %s on table public.%I to %I',t.privs,t.tname,me.rolname);
  if exists(select 1 from pg_class c where c.oid=('public.'||t.tname)::regclass and c.relrowsecurity
      and (c.relforcerowsecurity or not pg_has_role(me.oid,c.relowner,'USAGE')))
    and not exists(select 1 from pg_policy pol where pol.polrelid=('public.'||t.tname)::regclass and me.oid=any(pol.polroles)) then
   execute format('create policy %I on public.%I for all to %I using (true) with check (true)','p3_fn_owner_'||me.rolname,t.tname,me.rolname);
  end if;
 end loop;
end $$;

-- Same cause as 20261212030000: a renamed or reused function's ACL must name the owners of the security definer functions that call it.
do $$declare target regprocedure;owner_name name;target_owner name;begin
 foreach target in array array[
  'public.groups_content_dispatch_before_post_dislike(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.set_fan_post_like(uuid,uuid,boolean)'::regprocedure,
  'public.fan_web_content_visible(uuid,text,uuid)'::regprocedure,
  'public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.group_post_visible(uuid,uuid)'::regprocedure
 ] loop
  select pg_get_userbyid(proowner) into target_owner from pg_proc where oid=target;
  for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
   where p.pronamespace='public'::regnamespace and p.oid<>target and p.prosrc ~* ('\m'||(select proname from pg_proc where oid=target)||'\s*\(') loop
   if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner % for %',owner_name,target;end if;
   if owner_name<>target_owner then execute format('grant execute on function %s to %I',target,owner_name);end if;
  end loop;
 end loop;
end$$;
commit;

-- PostgREST must see the new RPCs before the web calls them (review r4 M1).
notify pgrst, 'reload schema';
