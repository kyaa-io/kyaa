-- Recorded heartbeat order for this actor's joined pages; this is not comprehensive activity.
create index group_presence_owner_seen_page_idx on public.group_presence(app_user_id,seen_at desc,page_id);
alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_joined_visited;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_limit integer; v_cursor jsonb:=p_input->'cursor'; v_id uuid; v_seen timestamptz; v_result jsonb;
begin
 if p_operation<>'directory' or coalesce(p_input->>'sort','')<>'visited' then
  return public.groups_dispatch_before_joined_visited(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 if p_actor is null or not exists(select 1 from public.app_users where id=p_actor and status='active') then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_input->>'mine' is distinct from 'joined' or coalesce(p_input->>'type','all')<>'all' or coalesce(p_input->>'search','')<>'' or coalesce((p_input->>'owned')::boolean,false) or p_input->>'artistRole' is not null then raise exception 'GROUPS_INVALID_REQUEST';end if;
 v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,8),1),50);
 if v_cursor is not null and v_cursor<>'null'::jsonb then
  if jsonb_typeof(v_cursor)<>'object' or v_cursor->>'v' is distinct from '1' or v_cursor->>'sort' is distinct from 'visited' or v_cursor->>'owner' is distinct from p_actor::text or not (v_cursor ? 'lastSeenAt') or v_cursor->>'id' is null then raise exception 'GROUPS_INVALID_REQUEST';end if;
  v_id:=(v_cursor->>'id')::uuid;v_seen:=(v_cursor->>'lastSeenAt')::timestamptz;
 end if;
 with filtered as materialized (
  select g.id,p.seen_at from public.group_pages g
  join public.group_memberships m on m.page_id=g.id and m.app_user_id=p_actor
  left join public.group_presence p on p.page_id=g.id and p.app_user_id=p_actor
  where public.group_scope_visible(p_actor,g.id)
 ), limited as (
  select * from filtered where v_id is null or (v_seen is null and seen_at is null and id>v_id) or (v_seen is not null and (seen_at is null or seen_at<v_seen or (seen_at=v_seen and id>v_id)))
  order by seen_at desc nulls last,id asc limit v_limit+1
 ), shown as (select * from limited order by seen_at desc nulls last,id asc limit v_limit)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(public.group_page_json(id)||jsonb_build_object('lastSeenAt',seen_at) order by seen_at desc nulls last,id asc) from shown),'[]'::jsonb),
  'totalCount',(select count(*) from filtered),
  'nextCursor',case when (select count(*) from limited)>v_limit then (select jsonb_build_object('v',1,'sort','visited','owner',p_actor,'id',id,'lastSeenAt',seen_at) from shown order by seen_at asc nulls first,id desc limit 1) end
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.groups_dispatch_before_joined_visited(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
