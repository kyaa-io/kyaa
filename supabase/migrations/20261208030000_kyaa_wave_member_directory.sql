-- Wave participants can find one another without exchanging a QR link.
create function public.read_owned_kyaa_wave_members(
 p_app_user_id uuid,p_locale public.content_locale,p_after_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_kyaa_wave_friend_pair(p_app_user_id,p_app_user_id);
 if p_locale is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 if not exists(select 1 from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null) then
  raise exception 'FAN_WEB_FORBIDDEN';
 end if;
 if p_after_profile_id is not null then
  perform 1 from public.kyaa_wave_participants receipt
  join public.app_users u on u.id=receipt.app_user_id and u.status='active'
  where receipt.event_key='kyaa-wave-2026' and u.id=p_after_profile_id and u.id<>p_app_user_id
   and not public.fan_web_blocked(p_app_user_id,u.id)
   and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=u.id and r.revoked_at is null);
  if not found then raise exception 'SOCIAL_NOT_FOUND'; end if;
 end if;
 return (
  with candidates as materialized (
   select u.id,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) as nickname
   from public.kyaa_wave_participants receipt
   join public.app_users u on u.id=receipt.app_user_id and u.status='active'
   left join public.user_profiles p on p.app_user_id=u.id
   where receipt.event_key='kyaa-wave-2026' and u.id<>p_app_user_id
    and (p_after_profile_id is null or u.id>p_after_profile_id)
    and not public.fan_web_blocked(p_app_user_id,u.id)
    and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=u.id and r.revoked_at is null)
   order by u.id limit 51
  ), page as (select * from candidates order by id limit 50)
  select jsonb_build_object(
   'members',coalesce((select jsonb_agg(jsonb_build_object('profileId',id,'nickname',nickname,'avatarUrl',public.public_fan_avatar_url(id)) order by id) from page),'[]'::jsonb),
   'nextCursor',case when (select count(*) from candidates)>50 then (select id from page order by id desc limit 1) else null end
  )
 );
end $$;
revoke all on function public.read_owned_kyaa_wave_members(uuid,public.content_locale,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_kyaa_wave_members(uuid,public.content_locale,uuid) to service_role;
