begin;
-- Project only identities that have actually read or written in this room.
create function public.group_room_context(p_actor uuid,p_room uuid,p_result jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.group_rooms;g public.group_pages;messages jsonb;people jsonb;
begin
 select * into r from public.group_rooms where id=p_room;
 if not found or p_actor is null or r.status not in('open','readonly') or r.closes_at<=now() or not public.group_room_allowed(p_actor,r.page_id,r.minimum_tier) then raise exception 'GROUPS_NOT_FOUND';end if;
 select * into strict g from public.group_pages where id=r.page_id;
 select coalesce(jsonb_agg(item||jsonb_build_object('avatarUrl',public.public_fan_avatar_url((item->>'profileId')::uuid),'artist',exists(select 1 from public.group_artist_bindings b where b.page_id=r.page_id and b.app_user_id=(item->>'profileId')::uuid)) order by ordinal),'[]'::jsonb) into messages from jsonb_array_elements(p_result->'items') with ordinality source(item,ordinal);
 with participants as (
  select app_user_id from public.group_room_reads where room_id=r.id
  union select author_id from public.group_messages where room_id=r.id and removed_at is null
  union select p_actor
 ), visible as (
  select p.app_user_id,coalesce(u.nickname,'팬') nickname from participants p left join public.user_profiles u on u.app_user_id=p.app_user_id
  where public.group_room_allowed(p.app_user_id,r.page_id,r.minimum_tier) and not public.fan_web_blocked(p_actor,p.app_user_id)
   and not exists(select 1 from public.group_artist_bindings b where b.page_id=r.page_id and b.app_user_id=p.app_user_id)
  order by p.app_user_id limit 20
 ) select coalesce(jsonb_agg(jsonb_build_object('profileId',app_user_id,'nickname',nickname,'avatarUrl',public.public_fan_avatar_url(app_user_id),'tier',case when g.kind='fan' then public.get_fan_effective_tier(app_user_id,g.celebrity_id) end) order by app_user_id),'[]'::jsonb) into people from visible;
 return p_result||jsonb_build_object('items',messages,'participants',people);
end $$;
revoke all on function public.group_room_context(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
do $patch$
declare source text;needle text:=$old$elsif p_operation='messages' then$old$;
begin
 source:=pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'Expected one room message projection';end if;
 execute replace(source,needle,needle||E'\n   result:=public.group_room_context(p_actor,p_item_id,result);');
end $patch$;
commit;
