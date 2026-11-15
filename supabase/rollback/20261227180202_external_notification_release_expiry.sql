-- Restore claim behavior; terminal rows remain closed.
begin;
create or replace function public.claim_email_notification_deliveries(p_worker_id text,p_batch_size integer,p_lease_seconds integer,p_now timestamptz default pg_catalog.now())
returns table(id uuid,notification_id uuid,plan_id uuid,channel text,sequence integer,template_key text,locale text,destination text,payload jsonb,attempt_count integer,lease_owner text,lease_expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_fan_notification_delivery_control('email');
  if p_worker_id is null or length(trim(p_worker_id)) not between 3 and 120
    or p_batch_size is null or p_batch_size not between 1 and 100
    or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then raise exception 'PHASE5_EXTERNAL_CLAIM_INVALID'; end if;
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
      'EMAIL_NOT_ELIGIBLE','CURRENT_STATE_INELIGIBLE','SUBSCRIPTION_OWNER_CHANGED',
      'KAKAO_NOT_ELIGIBLE','KAKAO_STATE_CHANGED','PUSH_SUBSCRIPTION_GONE'),false);
$$;
commit;
