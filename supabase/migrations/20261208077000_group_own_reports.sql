begin;
create index group_reports_reporter_cursor on public.group_reports(reporter_id,created_at desc,id desc);
-- Preserve the dispatch OID for existing SQL callers.
do $$declare source text;begin
 source:=pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 execute overlay(source placing 'CREATE OR REPLACE FUNCTION public.groups_content_dispatch_before_own_reports(' from 1 for length('CREATE OR REPLACE FUNCTION public.groups_content_dispatch('));
end $$;
revoke all on function public.groups_content_dispatch_before_own_reports(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
create or replace function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare cursor_id uuid;lim integer;result jsonb;begin
 if p_operation<>'own-reports'then return public.groups_content_dispatch_before_own_reports(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);end if;
 if p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
 perform public.fan_web_lock_active_user(p_actor);
 if p_page_id is not null or p_item_id is not null or jsonb_typeof(p_input) is distinct from 'object' or p_input-array['cursor','limit']<>'{}'::jsonb then raise exception 'GROUPS_INVALID_REQUEST';end if;
 begin cursor_id:=(p_input->>'cursor')::uuid;lim:=coalesce((p_input->>'limit')::integer,30);exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'GROUPS_INVALID_REQUEST';end;
 if lim<1 or lim>30 then raise exception 'GROUPS_INVALID_REQUEST';end if;
 if cursor_id is not null and not exists(select 1 from public.group_reports where id=cursor_id and reporter_id=p_actor)then raise exception 'GROUPS_NOT_FOUND';end if;
 with selected as(select *from public.group_reports where reporter_id=p_actor and(cursor_id is null or(created_at,id)<(select created_at,id from public.group_reports where id=cursor_id and reporter_id=p_actor))order by created_at desc,id desc limit lim+1),shown as(select *from selected order by created_at desc,id desc limit lim)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'status',r.status,'resolution',r.resolution,'createdAt',r.created_at,'targetPath',case when public.group_scope_visible(p_actor,r.page_id)then case
 when r.target_type='post'and exists(select 1 from public.group_posts p where p.id=r.target_id and p.page_id=r.page_id and public.group_post_visible(p_actor,p.id))then '/pages/groups/'||r.page_id||'?tab=board&post='||r.target_id
 when r.target_type='comment'then(select '/pages/groups/'||r.page_id||'?tab=board&post='||p.id from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=r.target_id and p.page_id=r.page_id and c.removed_at is null and not public.fan_web_blocked(p_actor,c.author_id)and public.group_post_visible(p_actor,p.id))
 when r.target_type='message'then(select '/pages/groups/'||r.page_id||'?tab=rooms&room='||room.id from public.group_messages m join public.group_rooms room on room.id=m.room_id where m.id=r.target_id and room.page_id=r.page_id and m.removed_at is null and room.status in('open','readonly')and(room.closes_at is null or room.closes_at>now())and public.group_room_allowed(p_actor,r.page_id,room.minimum_tier)and not public.fan_web_blocked(p_actor,m.author_id))
 end end)order by r.created_at desc,r.id desc)from shown r),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>lim then(select id from shown order by created_at,id limit 1)end)into result;
 return result;
end $$;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;
