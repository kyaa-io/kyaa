-- Store every app locale while preserving the existing KO/EN delivery contract.

alter table public.app_users
  drop constraint app_users_preferred_locale_supported;
alter table public.app_users
  add constraint app_users_preferred_locale_supported check (
    preferred_locale is null or preferred_locale in (
      'ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr'
    )
  );

create or replace function public.initialize_owned_preferred_locale(
  p_app_user_id uuid,
  p_locale text
) returns text
language plpgsql security definer set search_path='' as $$
declare v_locale text;
begin
  if p_locale is null or p_locale not in (
    'ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr'
  ) then
    raise exception 'PREFERRED_LOCALE_INVALID' using errcode='22023';
  end if;

  update public.app_users
  set preferred_locale=p_locale
  where id=p_app_user_id and status='active' and preferred_locale is null
  returning preferred_locale into v_locale;

  if not found then
    select preferred_locale into v_locale
    from public.app_users
    where id=p_app_user_id and status='active';
    if not found then
      raise exception 'ACTIVE_APP_USER_REQUIRED' using errcode='42501';
    end if;
  end if;
  return coalesce(v_locale,'ko');
end $$;

create or replace function public.set_owned_preferred_locale(
  p_app_user_id uuid,
  p_locale text
) returns text
language plpgsql security definer set search_path='' as $$
declare v_locale text;
begin
  if p_locale is null or p_locale not in (
    'ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr'
  ) then
    raise exception 'PREFERRED_LOCALE_INVALID' using errcode='22023';
  end if;
  update public.app_users
  set preferred_locale=p_locale
  where id=p_app_user_id and status='active'
  returning preferred_locale into v_locale;
  if not found then
    raise exception 'ACTIVE_APP_USER_REQUIRED' using errcode='42501';
  end if;
  return v_locale;
end $$;

create or replace function public.claim_localized_notification_deliveries(
  p_worker_id text,p_batch_size integer,p_lease_seconds integer
)
returns table(id uuid,notification_id uuid,kind public.notification_kind,locale text,endpoint text,p256dh text,auth_secret text,attempt_count integer,lease_owner text,lease_expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if length(trim(p_worker_id)) not between 3 and 120 or p_batch_size not between 1 and 100 or p_lease_seconds not between 30 and 900 then raise exception 'invalid notification worker claim'; end if;
  update public.notification_delivery_outbox delivery set status='failed',available_at='infinity'::timestamptz,last_error_code='CURRENT_STATE_INELIGIBLE',lease_owner=null,lease_expires_at=null
  where(delivery.status in('pending','failed')or(delivery.status='processing'and delivery.lease_expires_at<=now()))and delivery.available_at<=now()and not public.notification_delivery_is_eligible(delivery.notification_id,now());
  return query with due as(
    select delivery.id from public.notification_delivery_outbox delivery where delivery.attempt_count<8 and delivery.available_at<=now()
      and(delivery.status in('pending','failed')or(delivery.status='processing'and delivery.lease_expires_at<=now()))
      and exists(select 1 from public.push_subscriptions subscription where subscription.id=delivery.subscription_id and subscription.disabled_at is null)
      and public.notification_delivery_is_eligible(delivery.notification_id,now()) order by delivery.available_at,delivery.id for update skip locked limit p_batch_size
  ),claimed as(
    update public.notification_delivery_outbox delivery set status='processing',attempt_count=delivery.attempt_count+1,lease_owner=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),last_error_code=null from due where delivery.id=due.id returning delivery.*
  )
  select claimed.id,claimed.notification_id,notification.kind,
    case when coalesce(app_user.preferred_locale,'ko')='ko' then 'ko' else 'en' end,
    subscription.endpoint,subscription.p256dh,subscription.auth_secret,claimed.attempt_count,claimed.lease_owner,claimed.lease_expires_at
  from claimed join public.fan_notifications notification on notification.id=claimed.notification_id join public.app_users app_user on app_user.id=notification.app_user_id
  join public.push_subscriptions subscription on subscription.id=claimed.subscription_id where subscription.disabled_at is null;
end $$;

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
      and ((c.kind='email' and n.kind::text not in('live_24h','live_cancelled'))
        or (c.kind='kakao' and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
    order by case c.kind when 'kakao' then 1 else 2 end,c.priority,c.id limit 1;
  if not found then return null; end if;
  if primary_channel.kind='kakao' and n.kind::text not in('live_24h','live_cancelled') then
    select id into fallback_channel from public.fan_notification_channels
      where app_user_id=n.app_user_id and kind='email' and status='eligible' and verified_at is not null
        and consented_at is not null and consent_revoked_at is null limit 1;
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
