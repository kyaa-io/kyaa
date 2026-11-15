-- Rollback of 20261227220102_email_delivery_health.sql. Then 20261227220101 (no-op: enum values stay).
-- Order: remove notice rows before narrowing source_shape, restore wrappers, then drop the new objects.
-- SES feedback history (email_delivery_events) and channel health are dropped with the feature.
begin;
set local lock_timeout = '5s';

delete from public.fan_notifications where kind::text = 'email_delivery_blocked';

drop function public.fan_web_notification_path(uuid,uuid);
alter function public.fan_web_notification_path_before_email_delivery(uuid,uuid) rename to fan_web_notification_path;

do $$
declare previous text; was_valid boolean; added constant text := ' OR (((kind)::text = ''email_delivery_blocked''::text) AND (live_event_id IS NULL) AND (benefit_id IS NULL) AND web_only))';
begin
  select pg_get_expr(conbin, conrelid), convalidated into strict previous, was_valid from pg_constraint where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  if right(previous, length(added)) <> added then raise exception 'EMAIL_DELIVERY_HEALTH_ROLLBACK_SHAPE: %', right(previous, 200); end if;
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  previous := left(previous, length(previous) - length(added));
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (' || previous || ')) not valid';
  if was_valid then alter table public.fan_notifications validate constraint fan_notifications_source_shape; end if;
end $$;
drop function public.fan_web_notification_kind(text);
alter function public.fan_web_notification_kind_before_email_delivery(text) rename to fan_web_notification_kind;

create or replace function public.email_notification_delivery_is_eligible(p_notification_id uuid,p_channel_id uuid,p_at timestamptz default pg_catalog.now())returns boolean language sql stable security definer set search_path=''as $$
 select public.email_notification_delivery_is_eligible_before_group_categories(p_notification_id,p_channel_id,p_at)and public.group_notification_row_allowed(n)from public.fan_notifications n where n.id=p_notification_id
$$;

-- Body of 20261227190101.
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
        or (c.kind='kakao' and exists(select 1 from public.fan_notification_delivery_control control where control.channel='kakao' and control.mode='enabled') and n.kind::text not in('runmusic_result','benefit_available','recipient_information_required') and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
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

drop function public.record_ses_email_event(jsonb);
drop function public.email_delivery_blocked_notice(uuid,uuid,text,timestamptz);
drop function public.email_channel_delivery_blocked(uuid,timestamptz);
drop index public.email_notification_send_attempts_provider_message;
drop table public.email_delivery_health_control;
drop table public.email_channel_delivery_health;
drop table public.email_delivery_events;
drop function public.email_destination_fingerprint(text);

do $$
declare g record;
begin
  grant execute on function public.fan_web_notification_path(uuid,uuid) to service_role;
  for g in select distinct pg_get_userbyid(p.proowner) rolname from pg_proc p where p.prosrc like '%fan_web_notification_path(%' and p.pronamespace = 'public'::regnamespace loop
    execute format('grant execute on function public.fan_web_notification_path(uuid,uuid) to %I', g.rolname);
  end loop;
  for g in select distinct pg_get_userbyid(p.proowner) rolname from pg_proc p where p.prosrc like '%fan_web_notification_kind(%' and p.pronamespace = 'public'::regnamespace loop
    execute format('grant execute on function public.fan_web_notification_kind(text) to %I', g.rolname);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
