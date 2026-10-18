begin;

create function public.read_owned_mobile_passport_presentation(
  p_app_user_id uuid,
  p_passport_id uuid,
  p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  with owned as materialized (
    select passport.id
    from public.fan_passports passport
    join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
    where passport.id=p_passport_id and passport.app_user_id=p_app_user_id and passport.business_status='issued'
  ), live_stamps as materialized (
    select live.id,live.starts_at,live.approved_hero_url,localization.title,localization.hero_alt,
      min(stamp.id::text)::uuid stamp_id,count(distinct stamp.id)::integer stamp_count
    from owned
    join public.stamps stamp on stamp.passport_id=owned.id and stamp.business_status='issued'
    join public.fan_activities activity on activity.id=stamp.activity_id and activity.app_user_id=p_app_user_id
    left join public.live_reservations reservation on activity.source_type='live_reservation' and reservation.id=activity.source_id
    left join public.live_attendances attendance on activity.source_type='live_attendance' and attendance.id=activity.source_id
    left join public.live_survey_responses response on activity.source_type='live_survey_response' and response.id=activity.source_id
    left join public.live_surveys survey on survey.id=response.survey_id
    join public.live_events live on live.id=coalesce(reservation.live_event_id,attendance.live_event_id,survey.live_event_id) and live.publication_status='published'
    join public.live_event_localizations localization on localization.live_event_id=live.id and localization.locale=p_locale
    group by live.id,live.starts_at,live.approved_hero_url,localization.title,localization.hero_alt
    order by live.starts_at desc,live.id
    limit 12
  )
  select case when exists(select 1 from owned) then jsonb_build_object(
    'liveRecords',coalesce((select jsonb_agg(jsonb_build_object(
      'stampId',stamp_id,'title',title,'startsAt',starts_at,'heroImageUrl',approved_hero_url,
      'heroAlt',hero_alt,'stampCount',stamp_count
    ) order by starts_at desc,id) from live_stamps),'[]'::jsonb)
  ) else null end
$$;

create function public.read_owned_mobile_stamp_presentation(
  p_app_user_id uuid,
  p_stamp_id uuid,
  p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'title',localization.title,'startsAt',live.starts_at,'heroImageUrl',live.approved_hero_url,
    'heroAlt',localization.hero_alt,'location',null
  )
  from public.stamps stamp
  join public.fan_passports passport on passport.id=stamp.passport_id and passport.app_user_id=p_app_user_id and passport.business_status='issued'
  join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
  join public.fan_activities activity on activity.id=stamp.activity_id and activity.app_user_id=p_app_user_id
  left join public.live_reservations reservation on activity.source_type='live_reservation' and reservation.id=activity.source_id
  left join public.live_attendances attendance on activity.source_type='live_attendance' and attendance.id=activity.source_id
  left join public.live_survey_responses response on activity.source_type='live_survey_response' and response.id=activity.source_id
  left join public.live_surveys survey on survey.id=response.survey_id
  join public.live_events live on live.id=coalesce(reservation.live_event_id,attendance.live_event_id,survey.live_event_id) and live.publication_status='published'
  join public.live_event_localizations localization on localization.live_event_id=live.id and localization.locale=p_locale
  where stamp.id=p_stamp_id and stamp.business_status='issued'
$$;

create or replace function public.read_owned_mobile_profile_levels(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with passport_users as materialized(
    select passport.app_user_id,passport.celebrity_id,passport.issued_at,coalesce(sum(score.points),0)::integer xp
    from public.fan_passports passport join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
    left join public.fan_score_ledger score on score.app_user_id=passport.app_user_id and score.celebrity_id=passport.celebrity_id
    where passport.business_status='issued' group by passport.app_user_id,passport.celebrity_id,passport.issued_at
  ), ranked as materialized(
    select passport_users.*,row_number()over(partition by celebrity_id order by xp desc,issued_at,app_user_id)::integer rank,
      count(*)over(partition by celebrity_id)::integer participant_count from passport_users
  ), mine as materialized(
    select ranked.*,c.slug,c.image_url,l.name,public.get_fan_effective_tier(p_app_user_id,c.id)tier
    from ranked join public.celebrities c on c.id=ranked.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where ranked.app_user_id=p_app_user_id
  )
  select jsonb_build_object(
    'accountLevel',public.mobile_profile_account_level(p_app_user_id),
    'favorites',coalesce(jsonb_agg(jsonb_build_object(
      'favorite',jsonb_build_object('slug',mine.slug,'name',mine.name,'imageUrl',mine.image_url),
      'xp',mine.xp,'tier',mine.tier,'rank',mine.rank,'participantCount',mine.participant_count,
      'activityDays',(select count(distinct(activity.occurred_at at time zone 'Asia/Seoul')::date)::integer from public.fan_activities activity where activity.app_user_id=p_app_user_id and activity.celebrity_id=mine.celebrity_id),
      'neighbors',coalesce((select jsonb_agg(jsonb_build_object(
        'rank',neighbor.rank,'nickname',coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko'then'팬'else'Fan'end),
        'avatarUrl',public.public_fan_avatar_url(neighbor.app_user_id),'points',neighbor.xp,'isMe',neighbor.app_user_id=p_app_user_id
      ) order by neighbor.rank) from ranked neighbor left join public.user_profiles profile on profile.app_user_id=neighbor.app_user_id
      where neighbor.celebrity_id=mine.celebrity_id and neighbor.rank between greatest(1,mine.rank-1) and mine.rank+1),'[]'::jsonb),
      'progress',public.get_fan_stage_progress(mine.xp,mine.tier)
    ) order by mine.rank,mine.slug),'[]'::jsonb)
  ) into result from mine;
  return result;
end $$;

revoke all on function public.read_owned_mobile_passport_presentation(uuid,uuid,public.content_locale),public.read_owned_mobile_stamp_presentation(uuid,uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_owned_mobile_passport_presentation(uuid,uuid,public.content_locale),public.read_owned_mobile_stamp_presentation(uuid,uuid,public.content_locale) to service_role;

commit;
