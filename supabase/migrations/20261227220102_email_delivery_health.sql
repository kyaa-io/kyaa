-- EMAIL-BOUNCE-DB-1115 (board/tasks/EMAIL-B-1115/plan.md ③-1): SES bounce/complaint feedback.
-- One SES event = one row in email_delivery_events (SNS message id is the idempotency key).
-- One mail channel = at most one row in email_channel_delivery_health. The row is bound to the
-- destination fingerprint it was learned for, so a member who changes address is released at once.
-- fan_notification_channels.status is never changed here (same shape as Apple relay suppression,
-- 20260910100000:485-515). Raw addresses and provider diagnostic text are never stored.
-- Input of record_ses_email_event: {"snsMessageId": "<SNS MessageId>", "message": <parsed SES event>}.
-- Site notice (kind email_delivery_blocked, site only, once per member per 30 days) stays off until
-- the inbox can render it (EMAIL-BOUNCE-UI): email_delivery_health_control.notice_enabled.
-- Rollback: supabase/rollback/20261227220102_email_delivery_health.sql
begin;
set local lock_timeout = '5s';

create function public.email_destination_fingerprint(p_address text) returns text
language sql immutable set search_path = '' as $$
  select case when nullif(trim(p_address), '') is null then null
    else encode(extensions.digest(lower(trim(p_address)), 'sha256'), 'hex') end
$$;

create table public.email_delivery_events (
  id uuid primary key default extensions.gen_random_uuid(),
  sns_message_id text not null unique check (length(sns_message_id) between 1 and 200),
  event_type text not null check (event_type in ('send','delivery','bounce','complaint','delivery_delay','reject','rendering_failure','other')),
  bounce_type text check (bounce_type ~ '^[A-Za-z]{1,40}$'),
  bounce_sub_type text check (bounce_sub_type ~ '^[A-Za-z]{1,40}$'),
  complaint_feedback_type text check (complaint_feedback_type ~ '^[a-z-]{1,40}$'),
  provider_message_id text check (length(provider_message_id) between 1 and 512),
  delivery_id uuid,
  channel_id uuid,
  destination_fingerprint text check (destination_fingerprint ~ '^[0-9a-f]{64}$'),
  match_status text not null check (match_status in ('matched','unmatched')),
  effect text not null default 'pending' check (effect ~ '^[a-z_]{1,40}$'),
  send_confirmed boolean not null default false,
  occurred_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index email_delivery_events_created on public.email_delivery_events(created_at);
create index email_delivery_events_channel on public.email_delivery_events(channel_id, created_at) where channel_id is not null;

create table public.email_channel_delivery_health (
  channel_id uuid primary key references public.fan_notification_channels(id) on delete cascade,
  state text not null default 'ok' check (state in ('ok','soft_paused','bounced','complained')),
  reason text check (reason ~ '^[a-z_]{1,60}$'),
  consecutive_soft_bounces integer not null default 0 check (consecutive_soft_bounces >= 0),
  paused_until timestamptz,
  destination_fingerprint text not null check (destination_fingerprint ~ '^[0-9a-f]{64}$'),
  last_event_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check ((state = 'soft_paused') = (paused_until is not null)),
  check ((state = 'ok') = (reason is null))
);
create index email_channel_delivery_health_blocked on public.email_channel_delivery_health(updated_at) where state <> 'ok';

create table public.email_delivery_health_control (
  singleton boolean primary key default true check (singleton),
  notice_enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now()
);
insert into public.email_delivery_health_control(singleton) values (true);

do $$ declare t text; begin
  foreach t in array array['email_delivery_events','email_channel_delivery_health','email_delivery_health_control'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to service_role using (true)', t || '_service_read', t);
  end loop;
end $$;

-- Lookups for SES feedback: the provider id of accepted sends.
create index email_notification_send_attempts_provider_message
  on public.email_notification_send_attempts(provider_message_id) where provider_message_id is not null;

create function public.email_channel_delivery_blocked(p_channel_id uuid, p_at timestamptz default pg_catalog.now())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.email_channel_delivery_health h
    join public.fan_notification_channels c on c.id = h.channel_id and c.kind = 'email'
    where h.channel_id = p_channel_id
      and h.destination_fingerprint = c.destination_fingerprint
      and (h.state in ('bounced','complained') or (h.state = 'soft_paused' and h.paused_until > p_at))
  )
$$;

-- Outermost mail eligibility: previous chain unchanged, plus SES feedback suppression.
create or replace function public.email_notification_delivery_is_eligible(p_notification_id uuid, p_channel_id uuid, p_at timestamptz default pg_catalog.now())
returns boolean language sql stable security definer set search_path = '' as $$
  select public.email_notification_delivery_is_eligible_before_group_categories(p_notification_id, p_channel_id, p_at)
    and public.group_notification_row_allowed(n)
    and not public.email_channel_delivery_blocked(p_channel_id, p_at)
  from public.fan_notifications n where n.id = p_notification_id
$$;

-- Plan selection (body of 20261227190101): a stopped mail channel is neither primary nor fallback.
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
      and ((c.kind='email' and n.kind::text not in('live_24h','live_cancelled') and not public.email_channel_delivery_blocked(c.id,p_now))
        or (c.kind='kakao' and exists(select 1 from public.fan_notification_delivery_control control where control.channel='kakao' and control.mode<>'disabled') and n.kind::text not in('runmusic_result','benefit_available','recipient_information_required') and public.kakao_channel_supports_notification(c.id,n.kind::text,notification_payload,locale)))
    order by case c.kind when 'kakao' then 1 else 2 end,c.priority,c.id limit 1;
  if not found then return null; end if;
  if primary_channel.kind='kakao' and n.kind::text not in('live_24h','live_cancelled') then
    select id into fallback_channel from public.fan_notification_channels
      where app_user_id=n.app_user_id and kind='email' and status='eligible' and verified_at is not null
        and consented_at is not null and consent_revoked_at is null
        and not public.email_channel_delivery_blocked(id,p_now) limit 1;
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

-- Site-only notice kind. Shape: no LIVE/benefit, web_only, opens the settings screen.
do $$
declare previous text; was_valid boolean;
begin
  select pg_get_expr(conbin, conrelid), convalidated into strict previous, was_valid from pg_constraint
    where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check ((' || previous
    || ') or (kind::text=''email_delivery_blocked'' and live_event_id is null and benefit_id is null and web_only)) not valid';
  if was_valid then alter table public.fan_notifications validate constraint fan_notifications_source_shape; end if;
end $$;
alter function public.fan_web_notification_kind(text) rename to fan_web_notification_kind_before_email_delivery;
create function public.fan_web_notification_kind(p_kind text) returns boolean language sql immutable security definer set search_path = '' as $$
  select p_kind = 'email_delivery_blocked' or public.fan_web_notification_kind_before_email_delivery(p_kind)
$$;
alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_email_delivery;
create function public.fan_web_notification_path(p_owner uuid, p_notification uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.fan_notifications n join public.app_users u on u.id = n.app_user_id and u.status = 'active'
    where n.id = p_notification and n.app_user_id = p_owner and n.kind::text = 'email_delivery_blocked'
      and n.superseded_at is null and n.scheduled_for <= pg_catalog.now()
  ) then return '/settings'; end if;
  return public.fan_web_notification_path_before_email_delivery(p_owner, p_notification);
end $$;

create function public.email_delivery_blocked_notice(p_channel_id uuid, p_event_id uuid, p_state text, p_now timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.fan_notification_channels%rowtype;
begin
  if (select notice_enabled from public.email_delivery_health_control where singleton) is not true then return; end if;
  select * into c from public.fan_notification_channels where id = p_channel_id;
  if not found or not exists (select 1 from public.app_users where id = c.app_user_id and status = 'active') then return; end if;
  if exists (select 1 from public.fan_notifications where app_user_id = c.app_user_id
      and kind::text = 'email_delivery_blocked' and created_at > p_now - interval '30 days') then return; end if;
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, deep_link, payload, web_only)
  values (c.app_user_id, 'email_delivery_blocked', 'email_delivery_blocked:' || p_event_id::text, p_now, '/settings',
    jsonb_build_object('schemaVersion', 1, 'state', p_state, 'destinationLabel', c.destination_label), true)
  on conflict (app_user_id, source_key) do nothing;
end $$;

create function public.record_ses_email_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sns text := p_event->>'snsMessageId';
  m jsonb := p_event->'message';
  v_now timestamptz := pg_catalog.now();
  v_type text; v_message_id text; v_tag text; v_delivery uuid;
  v_bounce_type text; v_bounce_sub text; v_feedback text; v_at timestamptz; v_fp text;
  a public.email_notification_send_attempts%rowtype; v_attempt_found boolean := false;
  v_channel_id uuid; v_plan_id uuid; c public.fan_notification_channels%rowtype;
  h public.email_channel_delivery_health%rowtype;
  v_event_id uuid; v_match text := 'unmatched'; v_effect text := 'recorded'; v_confirmed boolean := false;
  v_was_blocked boolean; v_is_blocked boolean;
  existing public.email_delivery_events%rowtype;
begin
  if v_sns is null or length(v_sns) not between 1 and 200 or jsonb_typeof(m) is distinct from 'object' then
    raise exception 'SES_EVENT_INVALID' using errcode = '22023';
  end if;
  v_type := case coalesce(m->>'eventType', m->>'notificationType')
    when 'Send' then 'send' when 'Delivery' then 'delivery' when 'Bounce' then 'bounce'
    when 'Complaint' then 'complaint' when 'DeliveryDelay' then 'delivery_delay' when 'Reject' then 'reject'
    when 'Rendering Failure' then 'rendering_failure' else 'other' end;
  v_message_id := m#>>'{mail,messageId}';
  if v_message_id !~ '^[A-Za-z0-9._@+=-]+$' or length(v_message_id) > 512 then v_message_id := null; end if;
  v_tag := case when jsonb_typeof(m#>'{mail,tags,delivery_id}') = 'array' then m#>>'{mail,tags,delivery_id,0}' end;
  if v_tag ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_delivery := v_tag::uuid; end if;
  v_bounce_type := m#>>'{bounce,bounceType}';
  if v_bounce_type !~ '^[A-Za-z]{1,40}$' then v_bounce_type := null; end if;
  v_bounce_sub := m#>>'{bounce,bounceSubType}';
  if v_bounce_sub !~ '^[A-Za-z]{1,40}$' then v_bounce_sub := null; end if;
  v_feedback := lower(m#>>'{complaint,complaintFeedbackType}');
  if v_feedback !~ '^[a-z-]{1,40}$' then v_feedback := null; end if;
  begin
    v_at := coalesce(m#>>'{bounce,timestamp}', m#>>'{complaint,timestamp}', m#>>'{delivery,timestamp}',
      m#>>'{deliveryDelay,timestamp}', m#>>'{mail,timestamp}')::timestamptz;
  exception when others then v_at := null;
  end;
  v_at := coalesce(v_at, v_now);

  if v_message_id is not null then
    select * into a from public.email_notification_send_attempts where provider_message_id = v_message_id for update;
    v_attempt_found := found;
  end if;
  if not v_attempt_found and v_delivery is not null then
    select * into a from public.email_notification_send_attempts where delivery_id = v_delivery for update;
    -- A tag never overrides a different provider id already recorded for that send.
    v_attempt_found := found and (a.provider_message_id is null or a.provider_message_id = v_message_id);
  end if;
  if v_attempt_found then
    select o.channel_id, o.plan_id into v_channel_id, v_plan_id from public.external_notification_delivery_outbox o
      where o.id = a.delivery_id and o.channel = 'email';
    if found then v_match := 'matched'; v_fp := a.destination_fingerprint; else v_attempt_found := false; end if;
  end if;
  if not v_attempt_found then
    v_fp := public.email_destination_fingerprint(coalesce(m#>>'{bounce,bouncedRecipients,0,emailAddress}',
      m#>>'{complaint,complainedRecipients,0,emailAddress}', m#>>'{delivery,recipients,0}', m#>>'{mail,destination,0}'));
    if v_fp !~ '^[0-9a-f]{64}$' then v_fp := null; end if;
  end if;

  insert into public.email_delivery_events(sns_message_id, event_type, bounce_type, bounce_sub_type, complaint_feedback_type,
      provider_message_id, delivery_id, channel_id, destination_fingerprint, match_status, occurred_at)
    values (v_sns, v_type, v_bounce_type, v_bounce_sub, v_feedback, v_message_id,
      case when v_match = 'matched' then a.delivery_id else v_delivery end, v_channel_id, v_fp, v_match, v_at)
    on conflict (sns_message_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    select * into strict existing from public.email_delivery_events where sns_message_id = v_sns;
    return jsonb_build_object('eventId', existing.id, 'duplicate', true, 'match', existing.match_status, 'effect', existing.effect);
  end if;

  if v_match = 'unmatched' then
    v_effect := case when v_type in ('bounce','complaint') then 'unmatched' else 'recorded' end;
  else
    -- SES only reports these for mail it accepted: an "outcome unknown" send was in fact sent.
    if a.status = 'unknown' and v_message_id is not null and v_type in ('send','delivery','bounce','complaint','delivery_delay') then
      update public.email_notification_send_attempts set status = 'accepted', provider_message_id = v_message_id,
        error_code = null, updated_at = v_now where delivery_id = a.delivery_id;
      update public.external_notification_delivery_outbox set status = 'sent', sent_at = v_at, last_error_code = null, updated_at = v_now
        where id = a.delivery_id and status = 'failed' and last_error_code = 'EMAIL_SEND_OUTCOME_UNKNOWN';
      if found then
        update public.notification_delivery_plans set status = 'sent', sent_at = v_at, updated_at = v_now
          where id = v_plan_id and status = 'failed';
      end if;
      v_confirmed := true;
    end if;

    select * into c from public.fan_notification_channels where id = v_channel_id for update;
    if not found or c.kind <> 'email' or c.destination_fingerprint is distinct from v_fp then
      v_effect := 'stale_address';
    else
      insert into public.email_channel_delivery_health(channel_id, destination_fingerprint) values (c.id, v_fp)
        on conflict (channel_id) do nothing;
      select * into strict h from public.email_channel_delivery_health where channel_id = c.id for update;
      if h.destination_fingerprint <> v_fp then
        h.state := 'ok'; h.reason := null; h.paused_until := null; h.consecutive_soft_bounces := 0; h.destination_fingerprint := v_fp;
      end if;
      v_was_blocked := h.state in ('bounced','complained') or (h.state = 'soft_paused' and h.paused_until > v_now);
      if v_type = 'delivery' then
        h.consecutive_soft_bounces := 0;
        if h.state = 'soft_paused' then h.state := 'ok'; h.reason := null; h.paused_until := null; end if;
        v_effect := 'soft_reset';
      elsif v_type = 'bounce' and v_bounce_type = 'Permanent' then
        if h.state <> 'complained' then
          h.state := 'bounced'; h.paused_until := null;
          h.reason := 'bounce_' || lower(regexp_replace(coalesce(v_bounce_sub, 'General'), '([a-z])([A-Z])', '\1_\2', 'g'));
        end if;
        v_effect := 'bounced';
      elsif v_type = 'bounce' and v_bounce_sub in ('ContentRejected','MessageTooLarge','AttachmentRejected') then
        v_effect := 'ops_alert';
      elsif v_type = 'bounce' then
        h.consecutive_soft_bounces := h.consecutive_soft_bounces + 1;
        if h.consecutive_soft_bounces >= 3 and h.state in ('ok','soft_paused') then
          h.state := 'soft_paused'; h.reason := 'soft_bounce_repeated'; h.paused_until := v_now + interval '14 days';
          v_effect := 'soft_paused';
        else
          v_effect := 'soft_counted';
        end if;
      elsif v_type = 'complaint' and v_feedback = 'not-spam' then
        v_effect := 'not_spam';
      elsif v_type = 'complaint' then
        h.state := 'complained'; h.reason := 'complaint'; h.paused_until := null;
        v_effect := 'complained';
      elsif v_type in ('reject','rendering_failure') then
        v_effect := 'ops_alert';
      end if;
      update public.email_channel_delivery_health set state = h.state, reason = h.reason,
        consecutive_soft_bounces = h.consecutive_soft_bounces, paused_until = h.paused_until,
        destination_fingerprint = h.destination_fingerprint, last_event_at = greatest(coalesce(last_event_at, v_at), v_at), updated_at = v_now
        where channel_id = c.id;
      v_is_blocked := h.state in ('bounced','complained') or (h.state = 'soft_paused' and h.paused_until > v_now);
      if v_is_blocked and not v_was_blocked then
        perform public.email_delivery_blocked_notice(c.id, v_event_id, h.state, v_now);
      end if;
    end if;
  end if;

  update public.email_delivery_events set effect = v_effect, send_confirmed = v_confirmed where id = v_event_id;
  return jsonb_build_object('eventId', v_event_id, 'duplicate', false, 'match', v_match, 'effect', v_effect,
    'sendConfirmed', v_confirmed, 'state', h.state);
end $$;

revoke all on function public.email_destination_fingerprint(text),
  public.email_channel_delivery_blocked(uuid,timestamptz),
  public.email_delivery_blocked_notice(uuid,uuid,text,timestamptz),
  public.record_ses_email_event(jsonb),
  public.fan_web_notification_kind_before_email_delivery(text),
  public.fan_web_notification_path_before_email_delivery(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_ses_email_event(jsonb) to service_role;
-- New functions get PUBLIC execute and, on Supabase-style databases, default grants to anon/authenticated/service_role; start the wrappers closed.
revoke all on function public.fan_web_notification_kind(text), public.fan_web_notification_path(uuid,uuid) from public, anon, authenticated, service_role;
-- The wrappers take over the grants their callers relied on.
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
