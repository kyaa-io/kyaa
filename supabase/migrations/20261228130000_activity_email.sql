begin;
set local lock_timeout='5s';
alter table public.notification_preferences
 add column activity_email_notifications boolean not null default true,
 add column activity_email_updated_at timestamptz,
 add column activity_email_updated_via text check(activity_email_updated_via in ('settings','mail_page','one_click'));
create function public.activity_email_allowed(p_user uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.external_notification_email_priority(p_kind)<>3 or coalesce((select activity_email_notifications from public.notification_preferences where app_user_id=p_user),true)
$$;
revoke all on function public.activity_email_allowed(uuid,text) from public,anon,authenticated,service_role;
create or replace function public.email_notification_delivery_is_eligible(p_notification_id uuid, p_channel_id uuid, p_at timestamptz default pg_catalog.now())
returns boolean language sql stable security definer set search_path = '' as $$
  select public.email_notification_delivery_is_eligible_before_group_categories(p_notification_id, p_channel_id, p_at)
    and public.group_notification_row_allowed(n)
    and public.activity_email_allowed(n.app_user_id,n.kind::text)
    and not public.email_channel_delivery_blocked(p_channel_id, p_at)
  from public.fan_notifications n where n.id = p_notification_id
$$;
create or replace function public.create_external_notification_plan_before_fan_web(
  p_notification_id uuid,p_now timestamptz default pg_catalog.now()
)
returns uuid language plpgsql security definer set search_path='' as $$
declare n public.fan_notifications%rowtype; locale text; primary_channel public.fan_notification_channels%rowtype;
  fallback_channel uuid; plan_id uuid; notification_payload jsonb;
begin
  select id into plan_id from public.notification_delivery_plans where notification_id=p_notification_id;
  if found then return plan_id; end if;
  select notification.* into n from public.fan_notifications notification
    join public.app_users u on u.id=notification.app_user_id and u.status='active'
    where notification.id=p_notification_id;
  if not found then return null; end if;
  select case when coalesce(preferred_locale,'ko')='ko' then 'ko' else 'en' end
    into strict locale from public.app_users where id=n.app_user_id;
  notification_payload:=public.build_external_notification_payload(n.id,locale);
  select c.* into primary_channel from public.fan_notification_channels c
    where c.app_user_id=n.app_user_id and c.status='eligible' and c.verified_at is not null
      and c.consented_at is not null and c.consent_revoked_at is null
      and ((c.kind='email' and n.kind::text not in('live_24h','live_cancelled') and public.activity_email_allowed(n.app_user_id,n.kind::text) and not public.email_channel_delivery_blocked(c.id,p_now))
        or (c.kind='kakao' and exists(select 1 from public.fan_notification_delivery_control control where control.channel='kakao' and control.mode='enabled') and n.kind::text not in('runmusic_result','benefit_available','recipient_information_required') and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
    order by case c.kind when 'kakao' then 1 else 2 end,c.priority,c.id limit 1;
  if not found then return null; end if;
  if primary_channel.kind='kakao' and n.kind::text not in('live_24h','live_cancelled') then
    select id into fallback_channel from public.fan_notification_channels
      where app_user_id=n.app_user_id and kind='email' and status='eligible' and verified_at is not null
        and consented_at is not null and consent_revoked_at is null
        and public.activity_email_allowed(n.app_user_id,n.kind::text) and not public.email_channel_delivery_blocked(id,p_now) limit 1;
  end if;
  insert into public.notification_delivery_plans(notification_id,primary_channel_id,fallback_channel_id,email_locale,created_at,updated_at)
    values(n.id,primary_channel.id,fallback_channel,locale,p_now,p_now)
    on conflict(notification_id) do nothing returning id into plan_id;
  if not found then
    select id into plan_id from public.notification_delivery_plans where notification_id=n.id;
    return plan_id;
  end if;
  insert into public.external_notification_delivery_outbox(plan_id,notification_id,channel_id,channel,sequence,template_key,locale,available_at)
    values(plan_id,n.id,primary_channel.id,primary_channel.kind,1,n.kind::text,locale,greatest(n.scheduled_for,p_now));
  return plan_id;
end $$;
create or replace function public.fan_web_patch_notification_preferences(p_app_user_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_each(p_patch) x
    where x.key not in ('activity_email_notifications','live_reminders','survey_reminders','benefit_notifications','reply_notifications','official_post_notifications','schedule_notifications','artist_activity_notifications','artist_online_notifications','social_notifications','friend_activity_notifications','participation_notifications')
      or jsonb_typeof(x.value) <> 'boolean') then
    raise exception 'INVALID_NOTIFICATION_PREFERENCES' using errcode = '22023'; end if;
  insert into public.notification_preferences(app_user_id) values (p_app_user_id) on conflict do nothing;
  update public.notification_preferences set
    activity_email_updated_at = case when p_patch ? 'activity_email_notifications' and activity_email_notifications is distinct from (p_patch->>'activity_email_notifications')::boolean then now() else activity_email_updated_at end,
    activity_email_updated_via = case when p_patch ? 'activity_email_notifications' and activity_email_notifications is distinct from (p_patch->>'activity_email_notifications')::boolean then 'settings' else activity_email_updated_via end,
    activity_email_notifications = coalesce((p_patch->>'activity_email_notifications')::boolean,activity_email_notifications),
    live_reminders = coalesce((p_patch ->> 'live_reminders')::boolean, live_reminders),
    survey_reminders = coalesce((p_patch ->> 'survey_reminders')::boolean, survey_reminders),
    benefit_notifications = coalesce((p_patch ->> 'benefit_notifications')::boolean, benefit_notifications),
    reply_notifications = coalesce((p_patch ->> 'reply_notifications')::boolean, reply_notifications),
    official_post_notifications = coalesce((p_patch ->> 'official_post_notifications')::boolean, official_post_notifications),
    schedule_notifications = coalesce((p_patch ->> 'schedule_notifications')::boolean, schedule_notifications),
    artist_activity_notifications = coalesce((p_patch ->> 'artist_activity_notifications')::boolean, artist_activity_notifications),
    artist_online_notifications = coalesce((p_patch ->> 'artist_online_notifications')::boolean, artist_online_notifications),
    social_notifications = coalesce((p_patch ->> 'social_notifications')::boolean, social_notifications),
    friend_activity_notifications = coalesce((p_patch ->> 'friend_activity_notifications')::boolean, friend_activity_notifications),
    participation_notifications = coalesce((p_patch ->> 'participation_notifications')::boolean, participation_notifications)
    where app_user_id = p_app_user_id;
end $$;
drop function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text);
create or replace function public.apply_email_unsubscribe(
  p_notification_id uuid,
  p_template_key text,
  p_scope text,
  p_preference text,
  p_enabled boolean,
  p_now timestamptz default pg_catalog.now(),
  p_destination_binding text default null,
  p_via text default 'mail_page'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid;
  v_channel public.fan_notification_channels%rowtype;
  v_has_channel boolean;
begin
  if p_scope is null or p_via is null or p_scope not in ('activity','email') or p_via not in ('mail_page','one_click') or p_enabled is null
 then
    raise exception 'EMAIL_UNSUBSCRIBE_INVALID' using errcode='22023';
  end if;
  select n.app_user_id into v_user from public.fan_notifications n
   where n.id=p_notification_id and n.kind::text=p_template_key;
  if not found then raise exception 'EMAIL_UNSUBSCRIBE_NOT_FOUND' using errcode='P0002'; end if;

  -- Lock the mail channel first so an address change cannot slip in between the check and the change.
  select * into v_channel from public.fan_notification_channels
   where app_user_id=v_user and kind='email' for update;
  v_has_channel := found;

  if p_destination_binding is not null then
    if not v_has_channel
       or public.email_unsubscribe_destination_binding(p_notification_id, v_channel.destination_fingerprint) <> p_destination_binding then
      raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
    end if;
  elsif exists (
      select 1 from public.email_notification_send_attempts a
      join public.external_notification_delivery_outbox o on o.id=a.delivery_id
      where o.notification_id=p_notification_id and o.channel='email')
    and not (v_has_channel and exists (
      select 1 from public.email_notification_send_attempts a
      join public.external_notification_delivery_outbox o on o.id=a.delivery_id
      where o.notification_id=p_notification_id and o.channel='email'
        and a.destination_fingerprint=v_channel.destination_fingerprint)) then
    raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
  end if;

  if p_scope='activity' then
    insert into public.notification_preferences(app_user_id) values(v_user) on conflict do nothing;
    update public.notification_preferences set activity_email_notifications=p_enabled, activity_email_updated_at=p_now, activity_email_updated_via=p_via where app_user_id=v_user;
  else
    if not v_has_channel then raise exception 'EMAIL_UNSUBSCRIBE_NO_CHANNEL' using errcode='P0002'; end if;
    -- Only undo a switch the member turned off. A channel closed for another reason stays closed.
    if p_enabled=false and v_channel.consent_revoked_at is null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, false, 'email-unsubscribe-v1', p_now);
    elsif p_enabled and v_channel.consent_revoked_at is not null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, true, 'email-unsubscribe-v1', p_now);
    end if;
  end if;
  return jsonb_build_object('scope', p_scope, 'enabled', p_enabled);
end $$;
create or replace function public.claim_email_notification_deliveries(p_worker_id text,p_batch_size integer,p_lease_seconds integer,p_now timestamptz default pg_catalog.now())
returns table(id uuid,notification_id uuid,plan_id uuid,channel text,sequence integer,template_key text,locale text,destination text,payload jsonb,attempt_count integer,lease_owner text,lease_expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_fan_notification_delivery_control('email');
  if p_worker_id is null or length(trim(p_worker_id)) not between 3 and 120
    or p_batch_size is null or p_batch_size not between 1 and 100
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise exception 'PHASE5_EXTERNAL_CLAIM_INVALID'; end if;
  -- Only unstarted or expired leases may be closed; uncertain sends stay untouched.
  update public.external_notification_delivery_outbox expired
    set status='failed',available_at='infinity',lease_owner=null,lease_expires_at=null,updated_at=p_now,
      last_error_code=case when control.mode='disabled' or (control.mode='test' and not (n.app_user_id=any(control.test_user_ids))) then 'EMAIL_CHANNEL_NOT_RELEASED'
        when control.activated_at is null or n.created_at<=control.activated_at then 'EMAIL_ACTIVATION_NOT_RELEASED'
        else 'EMAIL_KIND_NOT_RELEASED' end
    from public.fan_notifications n, public.fan_notification_delivery_control control
    where n.id=expired.notification_id and control.channel='email' and expired.channel=control.channel
      and expired.created_at<=p_now-interval '24 hours' and expired.available_at<=p_now
      and (expired.status in ('pending','failed') or (expired.status='processing' and expired.lease_expires_at<=p_now))
      and not exists(select 1 from public.email_notification_send_attempts send_attempt where send_attempt.delivery_id=expired.id)
      and not public.fan_notification_is_released(n.id,control.channel);

  update public.external_notification_delivery_outbox d set status='failed',available_at='infinity',
    last_error_code=case when n.kind::text in('live_24h','live_cancelled') then 'EMAIL_KIND_SUPPRESSED' else 'EMAIL_NOT_ELIGIBLE' end,
    lease_owner=null,lease_expires_at=null,updated_at=p_now
    from public.fan_notifications n where n.id=d.notification_id and d.channel='email'
      and public.fan_notification_is_released(d.notification_id,'email')
      and d.attempt_count<8 and d.available_at<=p_now and n.scheduled_for<=p_now
      and (d.status in('pending','failed') or (d.status='processing' and d.lease_expires_at<=p_now))
      and not exists(select 1 from public.email_notification_send_attempts a where a.delivery_id=d.id)
      and not public.email_notification_delivery_is_eligible(d.notification_id,d.channel_id,p_now);
  return query with due as(
    select d.id from public.external_notification_delivery_outbox d
      -- The top-level status list lets the planner walk external_notification_email_due_priority_idx in order.
      where d.channel='email' and d.status in('pending','failed','processing') and public.fan_notification_is_released(d.notification_id,'email')
      and d.attempt_count<8 and d.available_at<=p_now
        and (d.status in('pending','failed') or (d.status='processing' and d.lease_expires_at<=p_now))
        and not exists(select 1 from public.email_notification_send_attempts a where a.delivery_id=d.id)
        and public.email_notification_delivery_is_eligible(d.notification_id,d.channel_id,p_now)
      order by d.priority,d.available_at,d.id for update skip locked limit p_batch_size
  ), claimed as(
    update public.external_notification_delivery_outbox d set status='processing',attempt_count=d.attempt_count+1,
      lease_owner=p_worker_id,lease_expires_at=p_now+pg_catalog.make_interval(secs=>p_lease_seconds),last_error_code=null,updated_at=p_now
      from due where d.id=due.id returning d.*
  ) select c.id,c.notification_id,c.plan_id,c.channel,c.sequence,c.template_key,c.locale,p.destination,
      public.build_external_notification_payload(c.notification_id,c.locale) || jsonb_build_object('priority',c.priority),c.attempt_count,c.lease_owner,c.lease_expires_at
    from claimed c join public.fan_notification_channel_private p on p.channel_id=c.channel_id
    order by c.priority,c.available_at,c.id;
end $$;
revoke all on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
commit;
