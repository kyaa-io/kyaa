alter function public.mobile_content_clip_json(uuid,uuid,public.content_locale)
  rename to mobile_content_clip_json_before_author_profile;

create function public.mobile_content_clip_json(p_app_user_id uuid,p_clip_id uuid,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; profile_id uuid; tier text;
begin
  result:=public.mobile_content_clip_json_before_author_profile(p_app_user_id,p_clip_id,p_locale);
  if result is null then return null; end if;
  select c.app_user_id,public.get_fan_effective_tier(c.app_user_id,c.celebrity_id)
    into profile_id,tier
    from public.fan_clips c join public.app_users u on u.id=c.app_user_id and u.status='active'
    join public.fan_passports p on p.app_user_id=c.app_user_id and p.celebrity_id=c.celebrity_id and p.business_status='issued'
    where c.id=p_clip_id and not public.fan_web_blocked(p_app_user_id,c.app_user_id)
      and (c.app_user_id=p_app_user_id or (
        exists(select 1 from public.social_profile_settings s where s.app_user_id=c.app_user_id and s.profile_visible)
        and exists(select 1 from public.social_favorite_visibility v where v.app_user_id=c.app_user_id and v.celebrity_id=c.celebrity_id and v.visible)));
  return jsonb_set(result,'{author}',result->'author'||jsonb_build_object('profileId',profile_id,'fanTier',tier));
end $$;

revoke all on function public.mobile_content_clip_json_before_author_profile(uuid,uuid,public.content_locale),public.mobile_content_clip_json(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.mobile_content_clip_json(uuid,uuid,public.content_locale) to service_role;
