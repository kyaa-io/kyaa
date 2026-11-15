-- Restore the unordered-by-tier claim and remove the priority column.
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

drop index if exists public.external_notification_email_due_priority_idx;
drop trigger if exists external_notification_delivery_priority on public.external_notification_delivery_outbox;
drop function if exists public.set_external_notification_delivery_priority();
alter table public.external_notification_delivery_outbox drop column if exists priority;
drop function if exists public.external_notification_email_priority(text);
commit;
