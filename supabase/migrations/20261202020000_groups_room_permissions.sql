begin;
create function public.group_room_can_send(p_actor uuid,p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_rooms r where r.id=p_room
 and (r.closes_at is null or r.closes_at>now()) and public.group_room_allowed(p_actor,r.page_id,r.minimum_tier)
 and (r.status='open' or r.status='readonly' and (
 exists(select 1 from public.group_memberships m where m.page_id=r.page_id and m.app_user_id=p_actor and m.role in('owner','manager'))
 or exists(select 1 from public.group_artist_bindings b where b.page_id=r.page_id and b.app_user_id=p_actor))))
$$;
revoke all on function public.group_room_can_send(uuid,uuid) from public,anon,authenticated,service_role;
do $patch$
declare source text;entry record;
begin
 for entry in select * from (values
 ('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)', $old$if r.status<>'open' then$old$, $new$if not public.group_room_can_send(p_actor,r.id) then$new$),
 ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', $old$(p_operation='messages'or r.status='open')$old$, $new$(p_operation='messages'or public.group_room_can_send(p_actor,r.id))$new$),
 ('public.group_room_context(uuid,uuid,jsonb)', $old$'participants',people$old$, $new$'participants',people,'canSend',public.group_room_can_send(p_actor,p_room)$new$)
 ) as patches(signature,needle,replacement)
 loop
  source:=pg_get_functiondef(entry.signature::regprocedure);
  if (length(source)-length(replace(source,entry.needle,'')))/length(entry.needle)<>1 then raise exception 'Expected one room permission patch in %',entry.signature;end if;
  execute replace(source,entry.needle,entry.replacement);
 end loop;
end $patch$;
commit;
