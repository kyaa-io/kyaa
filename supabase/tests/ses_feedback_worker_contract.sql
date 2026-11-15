-- Disposable-database contract test for 20261228110000. Input: psql variable payloads = the contents of
-- supabase/tests/fixtures/ses_feedback_worker_payloads.json, the real toSesFeedbackPayload output for AWS
-- documentation examples (apps/worker/test/ses-feedback-db-contract.test.ts keeps the file equal to it).
-- Run through supabase/tests/ses_feedback_worker_contract.sh. No provider calls; every row rolls back.
begin;
\o /dev/null
select set_config('sfc.payloads', :'payloads', true);
\o
create function pg_temp.ok(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ses_feedback_worker_contract: %', label; end if; end $$;
create function pg_temp.p(p_name text) returns jsonb language sql as $$
  select current_setting('sfc.payloads')::jsonb -> p_name
$$;
create function pg_temp.rec(p_name text) returns jsonb language sql as $$
  select public.record_ses_email_event(pg_temp.p(p_name))
$$;
create function pg_temp.d(n integer) returns uuid language sql as $$
  select ('5e5f0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- One mail job on p_channel with a fixed delivery id. 'accepted': finished with p_message.
-- 'sending': begin_email_notification_send has run and the worker w-fix is calling SES.
create function pg_temp.job(p_user uuid, p_channel uuid, p_delivery uuid, p_state text, p_message text default null) returns void
language plpgsql as $$
declare v_note uuid; v_plan uuid; v_fp text; v_sending boolean := p_state = 'sending';
begin
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
    values (p_user, 'artist_comment', 'artist_comment:sfc:' || replace(p_delivery::text, '-', ''), now()) returning id into v_note;
  insert into public.notification_delivery_plans(notification_id, primary_channel_id, status, sent_at)
    values (v_note, p_channel, case when v_sending then 'pending' else 'sent' end, case when v_sending then null else now() end)
    on conflict (notification_id) do update set primary_channel_id = excluded.primary_channel_id, status = excluded.status, sent_at = excluded.sent_at
    returning id into v_plan;
  insert into public.external_notification_delivery_outbox(id, plan_id, notification_id, channel_id, channel, sequence, template_key, locale,
      status, available_at, attempt_count, sent_at, lease_owner, lease_expires_at)
    values (p_delivery, v_plan, v_note, p_channel, 'email', 1, 'artist_comment', 'ko',
      case when v_sending then 'processing' else 'sent' end::public.notification_delivery_status, now(), 1,
      case when v_sending then null else now() end,
      case when v_sending then 'w-fix' end, case when v_sending then now() + interval '5 minutes' end);
  select destination_fingerprint into strict v_fp from public.fan_notification_channels where id = p_channel;
  insert into public.email_notification_send_attempts(delivery_id, worker_id, attempt_count, destination_fingerprint, status,
      provider_message_id, lease_expires_at)
    values (p_delivery, 'w-fix', 1, v_fp, case when v_sending then 'sending' else 'accepted' end,
      case when v_sending then null else p_message end, now() + interval '5 minutes');
end $$;
create function pg_temp.finish_unknown(p_delivery uuid) returns boolean language sql as $$
  select public.finish_email_notification_send(p_delivery, 'w-fix', 1, 'unknown', null, 'EMAIL_SEND_OUTCOME_UNKNOWN')
$$;
-- Attempt / delivery / plan states of one job, e.g. 'accepted/sent/sent'.
create function pg_temp.states(p_delivery uuid) returns text language sql as $$
  select a.status || '/' || o.status || '/' || p.status from public.email_notification_send_attempts a
    join public.external_notification_delivery_outbox o on o.id = a.delivery_id
    join public.notification_delivery_plans p on p.id = o.plan_id where a.delivery_id = p_delivery
$$;

do $$
declare
  u uuid[] := array[extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid()];
  ch uuid[] := array[extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid()];
  r jsonb; h public.email_channel_delivery_health%rowtype; failed boolean; i integer;
begin
  insert into public.app_users(id, privy_user_id, verified_email)
    select u[k], 'did:privy:sfc-' || k || '-' || u[k], 'sfc' || k || '@example.invalid' from generate_series(1, 4) g(k);
  insert into public.fan_notification_channels(id, app_user_id, kind, status, consent_version, consented_at, destination_fingerprint, destination_label, verified_at)
    select ch[k], u[k], 'email', 'eligible', 'fixture', now(), public.email_destination_fingerprint('sfc' || k || '@example.invalid'), 's***@example.invalid', now()
    from generate_series(1, 4) g(k);
  insert into public.fan_notification_channel_private(channel_id, destination)
    select ch[k], 'sfc' || k || '@example.invalid' from generate_series(1, 4) g(k);

  -- (a) AWS Bounce example through the real Lambda mapping: one event row, mail channel stopped.
  perform pg_temp.job(u[1], ch[1], pg_temp.d(1), 'accepted', 'EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000');
  r := pg_temp.rec('aws_bounce');
  perform pg_temp.ok(r->>'match' = 'matched' and r->>'effect' = 'bounced' and r->>'state' = 'bounced', 'AWS bounce example is recorded: ' || r::text);
  perform pg_temp.ok((select count(*) from public.email_delivery_events where sns_message_id = 'sns-aws-bounce') = 1, 'one event row');
  perform pg_temp.ok((select event_type = 'bounce' and bounce_type = 'Permanent' and bounce_sub_type = 'General' and delivery_id = pg_temp.d(1) and channel_id = ch[1]
    from public.email_delivery_events where sns_message_id = 'sns-aws-bounce'), 'event row keeps type, send and channel');
  select * into strict h from public.email_channel_delivery_health where channel_id = ch[1];
  perform pg_temp.ok(h.state = 'bounced' and h.reason = 'bounce_general' and public.email_channel_delivery_blocked(ch[1]), 'channel stopped');
  perform pg_temp.ok(not exists (select 1 from public.email_delivery_events e where to_jsonb(e)::text ~* 'example\.com|smtp|550'), 'no raw address or diagnostic stored');

  -- (b) AWS Delivery example.
  perform pg_temp.job(u[2], ch[2], pg_temp.d(2), 'accepted', 'ses-delivery-2');
  r := pg_temp.rec('aws_delivery');
  perform pg_temp.ok(r->>'match' = 'matched' and r->>'effect' = 'soft_reset' and r->>'state' = 'ok'
    and (select count(*) from public.email_delivery_events where sns_message_id = 'sns-aws-delivery') = 1, 'AWS delivery example is recorded: ' || r::text);

  -- (c) Same SNS message again.
  r := pg_temp.rec('aws_bounce');
  perform pg_temp.ok((r->>'duplicate')::boolean and r->>'effect' = 'bounced'
    and (select count(*) from public.email_delivery_events where sns_message_id = 'sns-aws-bounce') = 1, 'duplicate stored once');

  -- (d) Send evidence and the worker's finish(unknown), in every order.
  perform pg_temp.job(u[3], ch[3], pg_temp.d(3), 'sending');
  perform pg_temp.job(u[3], ch[3], pg_temp.d(4), 'sending');
  perform pg_temp.job(u[3], ch[3], pg_temp.d(5), 'sending');
  -- A: unknown, then Send.
  perform pg_temp.ok(pg_temp.finish_unknown(pg_temp.d(3)) and pg_temp.states(pg_temp.d(3)) = 'unknown/failed/failed', 'A starts unknown');
  r := pg_temp.rec('send_unknown_first');
  perform pg_temp.ok((r->>'sendConfirmed')::boolean and pg_temp.states(pg_temp.d(3)) = 'accepted/sent/sent', 'A: Send after unknown confirms: ' || pg_temp.states(pg_temp.d(3)));
  -- B: Send while the worker is still in the SES call, then finish(unknown).
  r := pg_temp.rec('send_before_finish');
  perform pg_temp.ok((r->>'sendConfirmed')::boolean and pg_temp.states(pg_temp.d(4)) = 'accepted/sent/sent', 'B: Send during the call confirms');
  perform pg_temp.ok(pg_temp.finish_unknown(pg_temp.d(4)), 'B: the late finish is acknowledged');
  perform pg_temp.ok(pg_temp.states(pg_temp.d(4)) = 'accepted/sent/sent', 'B: late finish(unknown) keeps the evidence: ' || pg_temp.states(pg_temp.d(4)));
  -- C: Send, finish(unknown), then the same SNS message again.
  r := pg_temp.rec('send_replayed');
  perform pg_temp.ok(pg_temp.finish_unknown(pg_temp.d(5)), 'C: the late finish is acknowledged');
  r := pg_temp.rec('send_replayed');
  perform pg_temp.ok((r->>'duplicate')::boolean and pg_temp.states(pg_temp.d(5)) = 'accepted/sent/sent', 'C: replay stays confirmed: ' || pg_temp.states(pg_temp.d(5)));
  perform pg_temp.ok((select bool_and(provider_message_id = 'ses-send-' || right(delivery_id::text, 1) and error_code is null)
    from public.email_notification_send_attempts where delivery_id in (pg_temp.d(3), pg_temp.d(4), pg_temp.d(5))), 'provider id kept from the event');
  perform pg_temp.ok((select bool_and(sent_at is not null and last_error_code is null and lease_owner is null)
    from public.external_notification_delivery_outbox where id in (pg_temp.d(3), pg_temp.d(4), pg_temp.d(5))), 'deliveries closed as sent');
  -- No second SES call: nothing is claimable and begin refuses.
  perform pg_temp.ok(not exists (select 1 from public.claim_email_notification_deliveries_safely('w-other', 100, 60, now() + interval '1 day') c
    where c.id in (pg_temp.d(3), pg_temp.d(4), pg_temp.d(5))), 'confirmed sends are not claimed again');
  perform pg_temp.ok(not public.begin_email_notification_send(pg_temp.d(4), 'w-fix', 1, public.email_destination_fingerprint('sfc3@example.invalid')), 'begin refuses a confirmed send');

  -- (e) Another send's message id or tag confirms nothing.
  perform pg_temp.job(u[3], ch[3], pg_temp.d(6), 'accepted', 'ses-send-6');
  perform pg_temp.job(u[3], ch[3], pg_temp.d(7), 'sending');
  r := pg_temp.rec('other_send_message_id');
  perform pg_temp.ok(not (r->>'sendConfirmed')::boolean and pg_temp.states(pg_temp.d(7)) = 'sending/processing/pending'
    and (select delivery_id = pg_temp.d(4) from public.email_delivery_events where sns_message_id = 'sns-other-id'), 'tag of an in-flight send does not beat another send''s message id');
  r := pg_temp.rec('other_send_tag');
  perform pg_temp.ok(r->>'match' = 'unmatched' and not (r->>'sendConfirmed')::boolean
    and (select provider_message_id = 'ses-send-6' from public.email_notification_send_attempts where delivery_id = pg_temp.d(6)), 'tag of an accepted send with another message id stays unmatched');
  perform pg_temp.ok(public.finish_email_notification_send(pg_temp.d(7), 'w-fix', 1, 'accepted', 'ses-send-7', null)
    and pg_temp.states(pg_temp.d(7)) = 'accepted/sent/sent', 'the in-flight send still finishes normally');

  -- (f) Soft bounce A, delivery B, soft bounces C and D, received as B, A, C, D.
  for i in 8..11 loop perform pg_temp.job(u[4], ch[4], pg_temp.d(i), 'accepted', 'ses-order-' || chr(89 + i)); end loop;
  r := pg_temp.rec('reorder_b_delivery');
  r := pg_temp.rec('reorder_a_bounce');
  perform pg_temp.ok(r->>'effect' = 'soft_superseded', 'bounce older than a delivery does not count: ' || r::text);
  r := pg_temp.rec('reorder_c_bounce');
  r := pg_temp.rec('reorder_d_bounce');
  select * into strict h from public.email_channel_delivery_health where channel_id = ch[4];
  perform pg_temp.ok(r->>'effect' = 'soft_counted' and h.consecutive_soft_bounces = 2 and h.state = 'ok' and not public.email_channel_delivery_blocked(ch[4]),
    'two soft bounces after the last delivery, mail not stopped: ' || to_jsonb(h)::text);

  -- The old {snsMessageId, message} input and a non-Lambda event type are refused (Lambda throws, event parks).
  begin
    perform public.record_ses_email_event('{"snsMessageId":"sns-old","message":{"eventType":"Bounce","mail":{"messageId":"x"}}}');
    failed := false;
  exception when sqlstate '22023' then failed := true;
  end;
  perform pg_temp.ok(failed, 'old nested input is refused');
  begin
    perform public.record_ses_email_event(pg_temp.p('aws_delivery') || '{"sns_message_id":"sns-open","event_type":"open"}');
    failed := false;
  exception when sqlstate '22023' then failed := true;
  end;
  perform pg_temp.ok(failed, 'unknown event type is refused');
  perform pg_temp.ok(has_function_privilege('service_role', 'public.record_ses_email_event(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_ses_email_event(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_ses_email_event(jsonb)', 'execute'), 'recorder is service only');
end $$;
rollback;
