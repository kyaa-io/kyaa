begin;

create function public.read_owned_mobile_stamp_opportunities(
  p_app_user_id uuid,p_locale public.content_locale
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with favorite_target as materialized (
    select min(c.slug) slug,count(*) total
    from public.fan_passports passport
    join public.celebrities c on c.id=passport.celebrity_id
      and c.status='published' and c.archived_at is null
    where passport.app_user_id=p_app_user_id
      and passport.business_status='issued' and c.primary_role<>'brand'
  ), opportunities(kind,earned,target_type,target_id) as (
    values
      ('first_friend'::text,exists(
        select 1
        from jsonb_array_elements(
          public.mobile_default_passport_stamps(p_app_user_id,p_locale)
        ) stamp
        where stamp->>'kind'='friend'
      ),'friends'::text,null::text),
      ('invite',exists(
        select 1 from public.community_stamps stamp
        where stamp.app_user_id=p_app_user_id and stamp.kind='invite'
      ),'invitations',null),
      ('first_clip',exists(
        select 1 from public.community_stamps stamp
        where stamp.app_user_id=p_app_user_id and stamp.kind='first_clip'
      ),case when (select total from favorite_target)=1 then 'fan_clips' else 'passports' end,
        case when (select total from favorite_target)=1 then (select slug from favorite_target) else null end)
  )
  select jsonb_build_object('items',jsonb_agg(jsonb_build_object(
    'kind',kind,'earned',earned,'target',jsonb_build_object('type',target_type,'id',target_id)
  ) order by case kind when 'first_friend' then 1 when 'invite' then 2 else 3 end))
  into result from opportunities;
  return result;
end $$;

create or replace function public.read_owned_mobile_stamp_presentation(
  p_app_user_id uuid,p_stamp_id uuid,p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'title',localization.title,'startsAt',live.starts_at,'heroImageUrl',live.approved_hero_url,
    'heroAlt',localization.hero_alt,'location',null,'sourceState','available',
    'liveSlug',live.slug,'eventId',live.id,'favoriteSlug',celebrity.slug
  )
  from public.stamps stamp
  join public.fan_passports passport on passport.id=stamp.passport_id
    and passport.app_user_id=p_app_user_id and passport.business_status='issued'
  join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
  join public.fan_activities activity on activity.id=stamp.activity_id
    and activity.app_user_id=p_app_user_id and activity.celebrity_id=passport.celebrity_id
  left join public.live_reservations reservation on activity.source_type='live_reservation' and reservation.id=activity.source_id
  left join public.live_attendances attendance on activity.source_type='live_attendance' and attendance.id=activity.source_id
  left join public.live_survey_responses response on activity.source_type='live_survey_response' and response.id=activity.source_id
  left join public.live_surveys survey on survey.id=response.survey_id
  join public.live_events live on live.id=coalesce(reservation.live_event_id,attendance.live_event_id,survey.live_event_id)
    and live.publication_status='published' and live.archived_at is null
  join public.celebrities celebrity on celebrity.id=live.celebrity_id
    and celebrity.id=passport.celebrity_id and celebrity.status='published' and celebrity.archived_at is null
  join public.live_event_localizations localization on localization.live_event_id=live.id and localization.locale=p_locale
  where stamp.id=p_stamp_id and stamp.business_status='issued'
$$;

revoke all on function public.read_owned_mobile_stamp_opportunities(uuid,public.content_locale),
  public.read_owned_mobile_stamp_presentation(uuid,uuid,public.content_locale)
  from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_stamp_opportunities(uuid,public.content_locale),
  public.read_owned_mobile_stamp_presentation(uuid,uuid,public.content_locale)
  to service_role;

commit;
