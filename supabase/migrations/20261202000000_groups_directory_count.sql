-- Apply visibility before pagination so a hidden page cannot consume a visible slot.
create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare page uuid:=p_page_id; result jsonb; v_limit integer; v_cursor uuid;
begin
 if p_operation='resolve' then select g.id into page from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where c.slug=p_input->>'slug';end if;
 if page is not null and not public.group_scope_visible(p_actor,page) then raise exception 'GROUPS_NOT_FOUND';end if;
 if p_operation='directory' then
  if p_actor is not null and not exists(select 1 from public.app_users where id=p_actor and status='active') then raise exception 'GROUPS_FORBIDDEN';end if;
  if (p_input->>'mine' is not null or coalesce((p_input->>'owned')::boolean,false)) and p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,8),1),50);v_cursor:=(p_input->>'cursor')::uuid;
  with filtered as (
   select gp.id,gp.created_at,(select count(*) from public.group_memberships m where m.page_id=gp.id) n
   from public.group_pages gp where public.group_scope_visible(p_actor,gp.id)
   and (coalesce(p_input->>'type','all')='all' or gp.kind=p_input->>'type')
   and (coalesce(p_input->>'search','')='' or gp.name ilike '%'||(p_input->>'search')||'%')
   and (not coalesce((p_input->>'owned')::boolean,false) or exists(select 1 from public.fan_passports fp where fp.app_user_id=p_actor and fp.celebrity_id=gp.celebrity_id and fp.business_status='issued'))
   and (p_input->>'mine' is null or p_input->>'mine'='joined' and exists(select 1 from public.group_memberships m where m.page_id=gp.id and m.app_user_id=p_actor)
    or p_input->>'mine'='bookmarked' and exists(select 1 from public.group_bookmarks b where b.page_id=gp.id and b.app_user_id=p_actor))
  ), ranked as (select *,row_number() over(order by case when p_input->>'sort'='popular' then n end desc nulls last,created_at desc,id) rn from filtered),
  limited as (select * from ranked where rn>coalesce((select rn from ranked where id=v_cursor),0) order by rn limit v_limit+1),
  shown as (select * from limited order by rn limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(public.group_page_json(id) order by rn) from shown),'[]'::jsonb),
   'totalCount',(select count(*) from filtered),
   'nextCursor',case when (select count(*) from limited)>v_limit then (select id from shown order by rn desc limit 1) end) into result;
  return result;
 end if;
 return public.groups_dispatch_before_content(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
end $$;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
