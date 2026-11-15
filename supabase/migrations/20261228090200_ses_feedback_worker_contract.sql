-- EMAIL-BOUNCE-FIX-1116: record_ses_email_event takes the SES feedback Lambda's own payload
-- (apps/worker/src/ses-feedback.ts toSesFeedbackPayload), not the raw SES event:
--   {sns_message_id, event_type, ses_message_id, delivery_id, occurred_at, recipients[], bounce_type,
--    bounce_sub_type, complaint_feedback_type, complaint_sub_type, delay_type, reject_reason}
-- 20261227220102 expected {snsMessageId, message:<raw SES event>} and refused every Lambda call.
-- Also:
-- * SES evidence that arrives while the send is still 'sending' (Send/Delivery before the worker's
--   finish) marks the attempt accepted and the delivery/plan sent at once. finish_email_notification_send
--   already keeps an accepted attempt as is, so a later finish(unknown) no longer leaves it failed.
-- * Soft bounces are counted by event time, not arrival: the count is the soft bounces after the
--   latest Delivery for the same channel and address, so late or reordered events give the same state.
-- Lock order follows finish_email_notification_send (delivery row, then attempt row).
-- Rollback: supabase/rollback/20261228090200_ses_feedback_worker_contract.sql
begin;
set local lock_timeout = '5s';

create or replace function public.record_ses_email_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sns text := p_event->>'sns_message_id';
  v_type text := p_event->>'event_type';
  v_now timestamptz := pg_catalog.now();
  v_message_id text; v_tag text; v_delivery uuid; v_attempt_delivery uuid;
  v_bounce_type text; v_bounce_sub text; v_feedback text; v_at timestamptz; v_fp text;
  a public.email_notification_send_attempts%rowtype; v_attempt_found boolean := false;
  v_channel_id uuid; v_plan_id uuid; c public.fan_notification_channels%rowtype;
  h public.email_channel_delivery_health%rowtype;
  v_event_id uuid; v_match text := 'unmatched'; v_effect text := 'recorded'; v_confirmed boolean := false;
  v_was_blocked boolean; v_is_blocked boolean; v_last_delivery timestamptz;
  existing public.email_delivery_events%rowtype;
begin
  if jsonb_typeof(p_event) is distinct from 'object' or jsonb_typeof(p_event->'sns_message_id') is distinct from 'string'
    or length(v_sns) not between 1 and 200
    or v_type is null or v_type not in ('send','delivery','bounce','complaint','delivery_delay','reject')
    or jsonb_typeof(p_event->'recipients') is distinct from 'array' then
    raise exception 'SES_EVENT_INVALID' using errcode = '22023';
  end if;
  v_message_id := p_event->>'ses_message_id';
  if v_message_id !~ '^[A-Za-z0-9._@+=-]+$' or length(v_message_id) > 512 then v_message_id := null; end if;
  v_tag := p_event->>'delivery_id';
  if v_tag ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_delivery := v_tag::uuid; end if;
  if v_type = 'bounce' then
    v_bounce_type := p_event->>'bounce_type';
    if v_bounce_type !~ '^[A-Za-z]{1,40}$' then v_bounce_type := null; end if;
    v_bounce_sub := p_event->>'bounce_sub_type';
    if v_bounce_sub !~ '^[A-Za-z]{1,40}$' then v_bounce_sub := null; end if;
  end if;
  if v_type = 'complaint' then
    v_feedback := lower(p_event->>'complaint_feedback_type');
    if v_feedback !~ '^[a-z-]{1,40}$' then v_feedback := null; end if;
  end if;
  begin
    v_at := (p_event->>'occurred_at')::timestamptz;
  exception when others then v_at := null;
  end;
  v_at := coalesce(v_at, v_now);

  -- Find the send without a lock, then lock its delivery row before the attempt row.
  if v_message_id is not null then
    select delivery_id into v_attempt_delivery from public.email_notification_send_attempts where provider_message_id = v_message_id;
  end if;
  if v_attempt_delivery is null and v_delivery is not null then
    select delivery_id into v_attempt_delivery from public.email_notification_send_attempts where delivery_id = v_delivery;
  end if;
  if v_attempt_delivery is not null then
    select o.channel_id, o.plan_id into v_channel_id, v_plan_id from public.external_notification_delivery_outbox o
      where o.id = v_attempt_delivery and o.channel = 'email' for update;
    if found then
      select * into a from public.email_notification_send_attempts where delivery_id = v_attempt_delivery for update;
      -- A tag never overrides a different provider id already recorded for that send.
      v_attempt_found := found and (a.provider_message_id is null or a.provider_message_id = v_message_id);
    end if;
  end if;
  if v_attempt_found then
    v_match := 'matched'; v_fp := a.destination_fingerprint;
  else
    v_channel_id := null; v_plan_id := null;
    v_fp := public.email_destination_fingerprint(p_event#>>'{recipients,0}');
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
    -- SES only reports these for mail it accepted: a send still in flight or of unknown outcome was sent.
    if a.status in ('sending','unknown') and v_message_id is not null and v_type in ('send','delivery','bounce','complaint','delivery_delay') then
      update public.email_notification_send_attempts set status = 'accepted', provider_message_id = v_message_id,
        error_code = null, updated_at = v_now where delivery_id = a.delivery_id;
      update public.external_notification_delivery_outbox set status = 'sent', sent_at = v_at, last_error_code = null,
          lease_owner = null, lease_expires_at = null, updated_at = v_now
        where id = a.delivery_id
          and (status = 'processing' or (status = 'failed' and last_error_code = 'EMAIL_SEND_OUTCOME_UNKNOWN'));
      if found then
        update public.notification_delivery_plans set status = 'sent', sent_at = v_at, updated_at = v_now
          where id = v_plan_id and status in ('pending','failed');
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
      if v_type in ('delivery','bounce') then
        -- Soft bounces after the latest delivery, by SES event time (this event included).
        select max(occurred_at) into v_last_delivery from public.email_delivery_events
          where channel_id = c.id and destination_fingerprint = v_fp and match_status = 'matched' and event_type = 'delivery';
        select count(*) into h.consecutive_soft_bounces from public.email_delivery_events
          where channel_id = c.id and destination_fingerprint = v_fp and match_status = 'matched' and event_type = 'bounce'
            and bounce_type is distinct from 'Permanent'
            and bounce_sub_type is distinct from 'ContentRejected' and bounce_sub_type is distinct from 'MessageTooLarge'
            and bounce_sub_type is distinct from 'AttachmentRejected'
            and (v_last_delivery is null or occurred_at > v_last_delivery);
      end if;
      if v_type = 'delivery' then
        if h.state = 'soft_paused' and h.consecutive_soft_bounces < 3 then h.state := 'ok'; h.reason := null; h.paused_until := null; end if;
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
        if v_last_delivery is not null and v_at <= v_last_delivery then
          v_effect := 'soft_superseded';
        elsif h.consecutive_soft_bounces >= 3 and h.state in ('ok','soft_paused') then
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
      elsif v_type = 'reject' then
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

revoke all on function public.record_ses_email_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_ses_email_event(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
