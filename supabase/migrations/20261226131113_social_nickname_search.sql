-- Nickname only: no contact data, membership, activity, or relationship disclosure.
create function public.search_social_profiles(p_app_user_id uuid, p_query text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if char_length(btrim(p_query)) < 2 or char_length(btrim(p_query)) > 80 then raise exception 'INVALID_INPUT'; end if;
 return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('profileId', id, 'nickname', nickname) order by nickname,id) from (
 select u.id, p.nickname from public.app_users u
 join public.user_profiles p on p.app_user_id=u.id
 join public.social_profile_settings s on s.app_user_id=u.id and s.profile_visible
 where u.status='active' and u.id<>p_app_user_id
 and not public.fan_web_blocked(p_app_user_id,u.id)
 and strpos(lower(p.nickname),lower(btrim(p_query)))>0
 order by p.nickname,u.id limit 20
 ) matches),'[]'::jsonb));
end $$;
revoke all on function public.search_social_profiles(uuid,text) from public,anon,authenticated;
grant execute on function public.search_social_profiles(uuid,text) to service_role;
