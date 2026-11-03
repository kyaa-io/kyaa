begin;

-- A null minimum is reserved for the member-only default free room.
alter table public.group_rooms alter column minimum_tier drop not null;
alter table public.group_rooms add column default_key text;
alter table public.group_rooms add constraint group_rooms_default_kind_check check (coalesce((
 (default_key is null and minimum_tier is not null) or
 (default_key in ('artist','certified') and minimum_tier is not null) or
 (default_key='free' and minimum_tier is null)
),false));
create unique index group_rooms_page_default_key on public.group_rooms(page_id,default_key) where default_key is not null;

create or replace function public.group_room_allowed(p_actor uuid,p_page uuid,p_minimum text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id join public.app_users u on u.id=m.app_user_id and u.status='active'
 where m.page_id=p_page and m.app_user_id=p_actor and public.group_scope_visible(p_actor,g.id) and (g.kind<>'fan' or p_minimum is null or exists(select 1 from public.group_artist_bindings b where b.page_id=g.id and b.app_user_id=p_actor) or (
 exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=g.celebrity_id and p.business_status='issued')
 and public.fan_level_rank(public.get_fan_effective_tier(p_actor,g.celebrity_id))>=public.fan_level_rank(p_minimum))))
$$;

alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_default_rooms;
create function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; member_role text;
begin
 if p_operation='rooms' then
  select m.role into member_role from public.group_memberships m
   join public.app_users u on u.id=m.app_user_id and u.status='active'
   join public.group_pages g on g.id=m.page_id and g.status='published'
   where m.page_id=p_page_id and m.app_user_id=p_actor and public.group_scope_visible(p_actor,g.id)
   and (g.celebrity_id is null or exists(select 1 from public.celebrities c where c.id=g.celebrity_id and c.status='published' and c.archived_at is null));
  if member_role is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  insert into public.group_rooms(page_id,default_key,name,minimum_tier)
   select g.id,v.key,v.name,v.tier from public.group_pages g
   cross join (values ('artist','아티스트 소통방','Bronze'),('certified','인증팬 소통방','Bronze'),('free','자유 소통방',null)) v(key,name,tier)
   where g.id=p_page_id and g.kind='fan'
   on conflict(page_id,default_key) where default_key is not null do nothing;
 end if;
 if p_operation='room-state' and exists(select 1 from public.group_rooms where id=p_item_id and page_id=p_page_id and default_key='free') then
  p_input:=jsonb_set(p_input,'{minimumTier}','null'::jsonb,true);
 end if;
 result:=public.groups_content_dispatch_before_default_rooms(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation='rooms' then
  select result||jsonb_build_object('canManage',member_role in ('owner','manager'),'items',coalesce(jsonb_agg(item||jsonb_build_object('defaultKey',r.default_key) order by ord),'[]'::jsonb)) into result
   from jsonb_array_elements(result->'items') with ordinality as entries(item,ord)
   join public.group_rooms r on r.id=(item->>'id')::uuid and r.page_id=p_page_id;
 end if;
 return result;
end $$;
revoke all on function public.groups_content_dispatch_before_default_rooms(text,uuid,uuid,uuid,jsonb,uuid),public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
commit;
