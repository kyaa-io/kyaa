begin;
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
      where d.channel='email' and public.fan_notification_is_released(d.notification_id,'email')
      and d.attempt_count<8 and d.available_at<=p_now
        and (d.status in('pending','failed') or (d.status='processing' and d.lease_expires_at<=p_now))
        and not exists(select 1 from public.email_notification_send_attempts a where a.delivery_id=d.id)
        and public.email_notification_delivery_is_eligible(d.notification_id,d.channel_id,p_now)
      order by d.available_at,d.id for update skip locked limit p_batch_size
  ), claimed as(
    update public.external_notification_delivery_outbox d set status='processing',attempt_count=d.attempt_count+1,
      lease_owner=p_worker_id,lease_expires_at=p_now+pg_catalog.make_interval(secs=>p_lease_seconds),last_error_code=null,updated_at=p_now
      from due where d.id=due.id returning d.*
  ) select c.id,c.notification_id,c.plan_id,c.channel,c.sequence,c.template_key,c.locale,p.destination,
      public.build_external_notification_payload(c.notification_id,c.locale),c.attempt_count,c.lease_owner,c.lease_expires_at
    from claimed c join public.fan_notification_channel_private p on p.channel_id=c.channel_id;
end $$;

create or replace function public.claim_kakao_notification_deliveries(p_worker_id text,p_batch_size integer,p_lease_seconds integer)
returns table(id uuid,attempt_token uuid,notification_id uuid,template_key text,locale text,destination text,
  payload jsonb,template_id text,lease_expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare d public.external_notification_delivery_outbox%rowtype; c public.fan_notification_channels%rowtype;
  a public.kakao_notification_attempts%rowtype; v_payload jsonb; v_template text; v_owner uuid; v_eligible boolean;
begin
  perform public.lock_fan_notification_delivery_control('kakao');
  if p_worker_id is null or length(trim(p_worker_id)) not between 3 and 120
    or p_batch_size is null or p_batch_size not between 1 and 2
    or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then raise exception 'KAKAO_CLAIM_INVALID'; end if;
  -- Only unstarted or expired leases may be closed; uncertain sends stay untouched.
  update public.external_notification_delivery_outbox expired
    set status='failed',available_at='infinity',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now(),
      last_error_code=case when control.mode='disabled' or (control.mode='test' and not (n.app_user_id=any(control.test_user_ids))) then 'KAKAO_CHANNEL_NOT_RELEASED'
        when control.activated_at is null or n.created_at<=control.activated_at then 'KAKAO_ACTIVATION_NOT_RELEASED'
        else 'KAKAO_KIND_NOT_RELEASED' end
    from public.fan_notifications n, public.fan_notification_delivery_control control
    where n.id=expired.notification_id and control.channel='kakao' and expired.channel=control.channel
      and expired.created_at<=pg_catalog.now()-interval '24 hours' and expired.available_at<=pg_catalog.now()
      and (expired.status in ('pending','failed') or (expired.status='processing' and expired.lease_expires_at<=pg_catalog.now()))
      and not exists(select 1 from public.kakao_notification_attempts send_attempt where send_attempt.delivery_id=expired.id and (send_attempt.status<>'prepared' or send_attempt.sending_at is not null or send_attempt.lease_expires_at>pg_catalog.now()))
      and not public.fan_notification_is_released(n.id,control.channel);

  for d in select delivery.* from public.external_notification_delivery_outbox delivery
    left join public.kakao_notification_attempts attempt on attempt.delivery_id=delivery.id
    where public.fan_notification_is_released(delivery.notification_id,'kakao') and delivery.channel='kakao'
      and delivery.available_at<=pg_catalog.now()
      and (delivery.status in('pending','failed') or (delivery.status='processing' and delivery.lease_expires_at<=pg_catalog.now()))
      and (attempt.delivery_id is null or (attempt.status='prepared' and attempt.lease_expires_at<=pg_catalog.now()))
    order by delivery.available_at,delivery.id for update of delivery skip locked limit p_batch_size
  loop
    select * into strict c from public.fan_notification_channels where public.fan_notification_channels.id=d.channel_id;
    select app_user_id into strict v_owner from public.fan_notifications where public.fan_notifications.id=d.notification_id;
    v_payload:=public.kakao_notification_payload(d.notification_id,d.locale);
    v_template:=public.kakao_alimtalk_template_id(d.template_key,v_payload,d.locale);
    v_eligible:=public.kakao_notification_delivery_is_eligible(d.id);
    insert into public.kakao_notification_attempts(delivery_id,app_user_id,channel_id,attempt_token,status,template_id,
      destination_fingerprint,verification_method,subject_hash,enrollment_generation,consented_at,payload,payload_fingerprint,
      lease_expires_at,error_code)
    values(d.id,v_owner,d.channel_id,extensions.gen_random_uuid(),case when v_eligible then 'prepared' else 'suppressed' end,
      v_template,c.destination_fingerprint,c.verification_method,c.kakao_subject_hash,c.enrollment_generation,c.consented_at,
      v_payload,encode(extensions.digest(v_payload::text,'sha256'),'hex'),pg_catalog.now()+make_interval(secs=>p_lease_seconds),
      case when not v_eligible then 'KAKAO_NOT_ELIGIBLE' end)
    on conflict(delivery_id) do update set attempt_token=excluded.attempt_token,lease_expires_at=excluded.lease_expires_at,
      updated_at=pg_catalog.now(),status=case when v_eligible then 'prepared' else 'suppressed' end,
      error_code=case when not v_eligible then 'KAKAO_NOT_ELIGIBLE' end
      where public.kakao_notification_attempts.status='prepared' and public.kakao_notification_attempts.sending_at is null
    returning * into a;
    if not found then continue; end if;
    if not v_eligible then
      update public.external_notification_delivery_outbox set status='failed',available_at='infinity',last_error_code='KAKAO_NOT_ELIGIBLE',
        lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now() where public.external_notification_delivery_outbox.id=d.id;
      update public.notification_delivery_plans set status='failed',updated_at=pg_catalog.now() where public.notification_delivery_plans.id=d.plan_id;
      continue;
    end if;
    update public.external_notification_delivery_outbox set status='processing',lease_owner=p_worker_id,
      lease_expires_at=a.lease_expires_at,last_error_code=null,updated_at=pg_catalog.now()
      where public.external_notification_delivery_outbox.id=d.id;
    id:=d.id; attempt_token:=a.attempt_token; notification_id:=d.notification_id; template_key:=d.template_key;
    locale:=d.locale; payload:=a.payload; template_id:=a.template_id; lease_expires_at:=a.lease_expires_at;
    select private.destination into destination from public.fan_notification_channel_private private where private.channel_id=d.channel_id;
    return next;
  end loop;
end $$;

create or replace function public.telegram_delivery_needs_attention(p_status text,p_available_at timestamptz,p_error text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_status='failed' and p_available_at='infinity'::timestamptz
    and coalesce(p_error,'') not in ('SCHEDULE_SUPERSEDED','LIVE_CANCELLED','EMAIL_KIND_SUPPRESSED',
      'EMAIL_CHANNEL_NOT_RELEASED','EMAIL_ACTIVATION_NOT_RELEASED','EMAIL_KIND_NOT_RELEASED','KAKAO_CHANNEL_NOT_RELEASED','KAKAO_ACTIVATION_NOT_RELEASED','KAKAO_KIND_NOT_RELEASED','EMAIL_NOT_ELIGIBLE','CURRENT_STATE_INELIGIBLE','SUBSCRIPTION_OWNER_CHANGED',
      'KAKAO_NOT_ELIGIBLE','KAKAO_STATE_CHANGED','PUSH_SUBSCRIPTION_GONE'),false);
$$;
-- Kakao can be resumed through the existing operations release control.
select public.configure_fan_notification_delivery('kakao','disabled');
update public.external_notification_delivery_outbox d set status='failed',available_at='infinity',
 last_error_code='KAKAO_CHANNEL_NOT_RELEASED',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now()
 where d.channel='kakao' and (d.status in('pending','failed') or (d.status='processing' and d.lease_expires_at<=pg_catalog.now()))
 and d.available_at<>'infinity'::timestamptz
 and not exists(select 1 from public.kakao_notification_attempts a where a.delivery_id=d.id
   and (a.status<>'prepared' or a.sending_at is not null or a.lease_expires_at>pg_catalog.now()));

-- Deployment is transactional: serialize against claims and close held historical work first.
lock table public.fan_notification_delivery_control in exclusive mode;
  -- Only unstarted or expired leases may be closed; uncertain sends stay untouched.
  update public.external_notification_delivery_outbox expired
    set status='failed',available_at='infinity',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now(),
      last_error_code=case when control.mode='disabled' or (control.mode='test' and not (n.app_user_id=any(control.test_user_ids))) then 'EMAIL_CHANNEL_NOT_RELEASED'
        when control.activated_at is null or n.created_at<=control.activated_at then 'EMAIL_ACTIVATION_NOT_RELEASED'
        else 'EMAIL_KIND_NOT_RELEASED' end
    from public.fan_notifications n, public.fan_notification_delivery_control control
    where n.id=expired.notification_id and control.channel='email' and expired.channel=control.channel
      and expired.created_at<=pg_catalog.now()-interval '24 hours' and expired.available_at<=pg_catalog.now()
      and (expired.status in ('pending','failed') or (expired.status='processing' and expired.lease_expires_at<=pg_catalog.now()))
      and not exists(select 1 from public.email_notification_send_attempts send_attempt where send_attempt.delivery_id=expired.id)
      and not public.fan_notification_is_released(n.id,control.channel);
  -- Only unstarted or expired leases may be closed; uncertain sends stay untouched.
  update public.external_notification_delivery_outbox expired
    set status='failed',available_at='infinity',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now(),
      last_error_code=case when control.mode='disabled' or (control.mode='test' and not (n.app_user_id=any(control.test_user_ids))) then 'KAKAO_CHANNEL_NOT_RELEASED'
        when control.activated_at is null or n.created_at<=control.activated_at then 'KAKAO_ACTIVATION_NOT_RELEASED'
        else 'KAKAO_KIND_NOT_RELEASED' end
    from public.fan_notifications n, public.fan_notification_delivery_control control
    where n.id=expired.notification_id and control.channel='kakao' and expired.channel=control.channel
      and expired.created_at<=pg_catalog.now()-interval '24 hours' and expired.available_at<=pg_catalog.now()
      and (expired.status in ('pending','failed') or (expired.status='processing' and expired.lease_expires_at<=pg_catalog.now()))
      and not exists(select 1 from public.kakao_notification_attempts send_attempt where send_attempt.delivery_id=expired.id and (send_attempt.status<>'prepared' or send_attempt.sending_at is not null or send_attempt.lease_expires_at>pg_catalog.now()))
      and not public.fan_notification_is_released(n.id,control.channel);
alter table public.fan_notification_delivery_control add column benefit_email_activated_at timestamptz;
alter table public.fan_notification_delivery_control drop constraint fan_delivery_allowed_kinds_valid;
alter table public.fan_notification_delivery_control add constraint fan_delivery_allowed_kinds_valid
  check(allowed_kinds is null or (
    array_ndims(allowed_kinds)=1 and cardinality(allowed_kinds) between 1 and 8
    and array_position(allowed_kinds,null) is null
    and allowed_kinds <@ array['live_reserved','live_24h','live_10m','live_changed','live_cancelled','runmusic_result','recipient_information_required','benefit_available']::text[]
  ));
update public.fan_notification_delivery_control
 set benefit_email_activated_at=pg_catalog.clock_timestamp(),
 allowed_kinds=case when allowed_kinds is null then null else
   array(select distinct kind from unnest(allowed_kinds||array['recipient_information_required','benefit_available']) kind) end
 where channel='email';
create or replace function public.fan_notification_is_released(p_notification_id uuid,p_channel text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.fan_notification_delivery_control c
    join public.fan_notifications n on n.id=p_notification_id
    where c.channel=p_channel and n.created_at>c.activated_at
      and (p_channel<>'email' or n.kind::text not in ('recipient_information_required','benefit_available')
        or n.created_at>c.benefit_email_activated_at)
      and (c.mode='enabled' or (c.mode='test' and n.app_user_id=any(c.test_user_ids)))
      and (c.allowed_kinds is null or n.kind::text=any(c.allowed_kinds)
        or (p_channel='email' and n.kind='benefit_won' and exists(
          select 1 from public.benefit_draw_email_releases release
          join public.benefit_draw_winners winner on winner.draw_id=release.draw_id
          where winner.app_user_id=n.app_user_id and winner.benefit_id=n.benefit_id
            and n.source_key='benefit_won:'||winner.id::text||':1'))))
$$;
-- One operations-only switch for app relaunch; device preferences are preserved.
create table public.mobile_push_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
alter table public.mobile_push_control enable row level security;
alter table public.mobile_push_control force row level security;
revoke all on public.mobile_push_control from public,anon,authenticated,service_role;
insert into public.mobile_push_control(singleton,enabled) values(true,false);
create or replace function public.mobile_enqueue_notification() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if (select enabled from public.mobile_push_control where singleton) is not true then return new; end if;

 insert into public.mobile_push_delivery_outbox(notification_id,installation_row_id,installation_version,link_version,account_version,available_at)
 select new.id,i.id,i.installation_version,i.link_version,u.mobile_account_version,greatest(new.scheduled_for,pg_catalog.clock_timestamp()) from public.mobile_installations i join public.app_users u on u.id=i.app_user_id and u.status='active' join public.mobile_app_settings s on s.app_user_id=i.app_user_id and s.push_enabled
 where i.app_user_id=new.app_user_id and i.disabled_at is null and i.permission in('authorized','provisional') and public.mobile_notification_topic_enabled(new.app_user_id,new.kind::text)
 on conflict do nothing; return new; end $$;
create or replace function public.mobile_claim_push_deliveries(p_worker_id text,p_batch_size integer,p_lease_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if (select enabled from public.mobile_push_control where singleton) is not true then raise exception 'MOBILE_PUSH_DISABLED'; end if;

 if length(trim(p_worker_id)) not between 3 and 120 or p_batch_size not between 1 and 100 or p_lease_seconds not between 30 and 900 then raise exception 'MOBILE_PUSH_CLAIM_INVALID' using errcode='22023'; end if;
 with due as(select o.id from public.mobile_push_delivery_outbox o where o.attempt_count<8 and o.available_at<=pg_catalog.clock_timestamp() and (o.status in('pending','failed') or(o.status='processing' and o.lease_expires_at<=pg_catalog.clock_timestamp())) order by o.available_at,o.id for update skip locked limit p_batch_size), claimed as(update public.mobile_push_delivery_outbox o set status='processing',attempt_count=o.attempt_count+1,lease_owner=p_worker_id,lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds),last_error_code=null from due where o.id=due.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('deliveryId',id,'notificationId',notification_id,'attemptCount',attempt_count,'leaseExpiresAt',lease_expires_at) order by available_at,id),'[]'::jsonb) into result from claimed; return result; end $$;
create or replace function public.mobile_prepare_push_delivery(p_delivery_id uuid, p_worker_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if (select enabled from public.mobile_push_control where singleton) is not true then return null; end if;

  if public.artist_activity_mobile_delivery_refused(p_delivery_id, p_worker_id) then return null; end if;
  return public.mobile_prepare_push_delivery_before_artist_activity(p_delivery_id, p_worker_id);
end $$;
update public.mobile_push_delivery_outbox set status='failed',available_at='infinity',
 last_error_code='MOBILE_PUSH_PRELAUNCH_DISABLED',lease_owner=null,lease_expires_at=null
 where status in ('pending','processing') or (status='failed' and available_at<>'infinity'::timestamptz);

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
        or (c.kind='kakao' and exists(select 1 from public.fan_notification_delivery_control control where control.channel='kakao' and control.mode<>'disabled') and n.kind::text not in('runmusic_result','benefit_available','recipient_information_required') and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
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
create or replace function public.get_owned_notification_connections(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'kakaoEnabled',exists(select 1 from public.fan_notification_delivery_control where channel='kakao' and mode<>'disabled'),
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
commit;
