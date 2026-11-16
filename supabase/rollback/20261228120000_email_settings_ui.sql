-- Rollback for 20261228120000_email_settings_ui.sql: restores both functions of 20261227190101 / 20261216031000.
-- Roll the web back first: the new web sends the three added switches, which the restored patch function rejects.
begin;
set local lock_timeout = '5s';

create or replace function public.get_owned_notification_connections(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'kakaoEnabled',exists(select 1 from public.fan_notification_delivery_control where channel='kakao' and mode='enabled'),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',a.provider,'status',a.status,'connectedAt',a.connected_at,'disconnectedAt',a.disconnected_at
    ) order by a.provider) from public.fan_connected_accounts a where a.app_user_id=p_app_user_id),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'kind',c.kind,'status',c.status,
      'consented',c.consented_at is not null and c.consent_revoked_at is null,
      'destinationLabel',c.destination_label,'verifiedAt',c.verified_at
    ) order by c.priority,c.kind,c.id) from public.fan_notification_channels c where c.app_user_id=p_app_user_id),'[]'::jsonb)
  )
$$;

create or replace function public.fan_web_patch_notification_preferences(p_app_user_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_each(p_patch) x
    where x.key not in ('live_reminders','survey_reminders','benefit_notifications','reply_notifications','official_post_notifications','schedule_notifications','artist_activity_notifications','artist_online_notifications')
      or jsonb_typeof(x.value) <> 'boolean') then
    raise exception 'INVALID_NOTIFICATION_PREFERENCES' using errcode = '22023'; end if;
  insert into public.notification_preferences(app_user_id) values (p_app_user_id) on conflict do nothing;
  update public.notification_preferences set
    live_reminders = coalesce((p_patch ->> 'live_reminders')::boolean, live_reminders),
    survey_reminders = coalesce((p_patch ->> 'survey_reminders')::boolean, survey_reminders),
    benefit_notifications = coalesce((p_patch ->> 'benefit_notifications')::boolean, benefit_notifications),
    reply_notifications = coalesce((p_patch ->> 'reply_notifications')::boolean, reply_notifications),
    official_post_notifications = coalesce((p_patch ->> 'official_post_notifications')::boolean, official_post_notifications),
    schedule_notifications = coalesce((p_patch ->> 'schedule_notifications')::boolean, schedule_notifications),
    artist_activity_notifications = coalesce((p_patch ->> 'artist_activity_notifications')::boolean, artist_activity_notifications),
    artist_online_notifications = coalesce((p_patch ->> 'artist_online_notifications')::boolean, artist_online_notifications)
    where app_user_id = p_app_user_id;
end $$;

commit;
