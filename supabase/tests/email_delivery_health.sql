-- Disposable-database contract test for 20261227220102 (SES bounce/complaint feedback). No provider calls.
-- Every fixture row rolls back.
begin;
create function pg_temp.ok(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'email_delivery_health: %', label; end if; end $$;

-- One accepted (or outcome-unknown) send for a channel, written the way finish_email_notification_send leaves it.
create function pg_temp.sent(p_user uuid, p_channel uuid, p_message text, p_unknown boolean default false) returns uuid
language plpgsql as $$
declare v_note uuid; v_plan uuid; v_delivery uuid; v_fp text;
begin
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
    values (p_user, 'artist_comment', 'artist_comment:edh:' || replace(extensions.gen_random_uuid()::text, '-', ''), now())
    returning id into v_note;
  insert into public.notification_delivery_plans(notification_id, primary_channel_id, status, sent_at)
    values (v_note, p_channel, case when p_unknown then 'failed' else 'sent' end, case when p_unknown then null else now() end)
    on conflict (notification_id) do update set primary_channel_id = excluded.primary_channel_id, status = excluded.status, sent_at = excluded.sent_at
    returning id into v_plan;
  insert into public.external_notification_delivery_outbox(plan_id, notification_id, channel_id, channel, sequence, template_key, locale,
      status, available_at, attempt_count, sent_at, last_error_code)
    values (v_plan, v_note, p_channel, 'email', 1, 'artist_comment', 'ko',
      case when p_unknown then 'failed' else 'sent' end::public.notification_delivery_status,
      case when p_unknown then 'infinity'::timestamptz else now() end, 1,
      case when p_unknown then null else now() end, case when p_unknown then 'EMAIL_SEND_OUTCOME_UNKNOWN' end)
    returning id into v_delivery;
  select destination_fingerprint into strict v_fp from public.fan_notification_channels where id = p_channel;
  insert into public.email_notification_send_attempts(delivery_id, worker_id, attempt_count, destination_fingerprint, status,
      provider_message_id, error_code, lease_expires_at)
    values (v_delivery, 'edh-fixture', 1, v_fp, case when p_unknown then 'unknown' else 'accepted' end,
      case when p_unknown then null else p_message end, case when p_unknown then 'EMAIL_SEND_OUTCOME_UNKNOWN' end, now());
  return v_delivery;
end $$;

-- SES event in the shape the SES feedback Lambda passes it (apps/worker/src/ses-feedback.ts toSesFeedbackPayload,
-- input contract of 20261228110000). p_extra uses the SES event's detail objects; events happen in call order.
create function pg_temp.ev(p_sns text, p_type text, p_message text, p_delivery uuid, p_extra jsonb default '{}') returns jsonb
language sql as $$
  select public.record_ses_email_event(jsonb_build_object(
    'sns_message_id', p_sns,
    'event_type', case p_type when 'DeliveryDelay' then 'delivery_delay' else lower(p_type) end,
    'ses_message_id', p_message,
    'delivery_id', p_delivery::text,
    'occurred_at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recipients', coalesce(
      (select jsonb_agg(r->'emailAddress') from jsonb_array_elements(coalesce(p_extra#>'{bounce,bouncedRecipients}', p_extra#>'{complaint,complainedRecipients}')) r),
      p_extra#>'{delivery,recipients}', '["someone@example.invalid"]'),
    'bounce_type', p_extra#>>'{bounce,bounceType}', 'bounce_sub_type', p_extra#>>'{bounce,bounceSubType}',
    'complaint_feedback_type', p_extra#>>'{complaint,complaintFeedbackType}', 'complaint_sub_type', null,
    'delay_type', null, 'reject_reason', null))
$$;
create function pg_temp.bounce(p_type text, p_sub text) returns jsonb language sql as $$
  select jsonb_build_object('bounce', jsonb_build_object('bounceType', p_type, 'bounceSubType', p_sub, 'timestamp', '2026-11-15T12:00:05.000Z',
    'bouncedRecipients', jsonb_build_array(jsonb_build_object('emailAddress', 'someone@example.invalid', 'diagnosticCode', 'smtp; 550 5.1.1 user unknown <someone@example.invalid>'))))
$$;
create function pg_temp.state(p_channel uuid) returns text language sql as $$
  select state from public.email_channel_delivery_health where channel_id = p_channel
$$;

do $$
declare
  u uuid[] := array[extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid(),
    extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid()];
  ch uuid[] := array[extensions.gen_random_uuid(), extensions.gen_random_uuid(), extensions.gen_random_uuid(),
    extensions.gen_random_uuid(), extensions.gen_random_uuid()];
  draw uuid := extensions.gen_random_uuid();
  d uuid; d2 uuid; r jsonb; note uuid; i integer; h public.email_channel_delivery_health%rowtype; failed boolean;
begin
  insert into public.app_users(id, privy_user_id, verified_email)
    select u[k], 'did:privy:edh-' || k || '-' || u[k], 'edh' || k || '@example.invalid' from generate_series(1, 6) g(k);
  -- Members 1..5 have a mail channel; member 6 has no channel and no send at all.
  insert into public.fan_notification_channels(id, app_user_id, kind, status, consent_version, consented_at, destination_fingerprint, destination_label, verified_at)
    select ch[k], u[k], 'email', 'eligible', 'fixture', now(), public.email_destination_fingerprint('edh' || k || '@example.invalid'), 'e***@example.invalid', now()
    from generate_series(1, 5) g(k);
  insert into public.fan_notification_channel_private(channel_id, destination)
    select ch[k], 'edh' || k || '@example.invalid' from generate_series(1, 5) g(k);
  perform pg_temp.ok(public.email_destination_fingerprint(' EDH1@Example.Invalid ') = encode(extensions.digest('edh1@example.invalid', 'sha256'), 'hex'),
    'fingerprint matches the channel enrollment formula');

  -- Mail release for runmusic results, used for eligibility and plan checks.
  insert into public.runmusic_draw_entries(draw_id, app_user_id, weight, mission_snapshot, rank, winner, receipt_id, prize_code)
    select draw, u[k], 1, '{}', k, false, null, null from generate_series(1, 6) g(k);
  update public.runmusic_campaign set draw_id = draw, results_published = true;
  update public.fan_notification_delivery_control set mode = 'enabled', activated_at = now() - interval '1 second', test_user_ids = '{}',
    allowed_kinds = array['runmusic_result'] where channel = 'email';

  -- Permanent bounce: stopped at once. Notice switch off: no site notice.
  d := pg_temp.sent(u[1], ch[1], 'm-perm-1');
  r := pg_temp.ev('sns-perm-1', 'Bounce', 'm-perm-1', d, pg_temp.bounce('Permanent', 'General'));
  perform pg_temp.ok(r->>'match' = 'matched' and r->>'effect' = 'bounced' and r->>'state' = 'bounced', 'permanent bounce blocks: ' || r::text);
  select * into strict h from public.email_channel_delivery_health where channel_id = ch[1];
  perform pg_temp.ok(h.reason = 'bounce_general' and h.destination_fingerprint = public.email_destination_fingerprint('edh1@example.invalid'), 'reason and fingerprint kept');
  perform pg_temp.ok(public.email_channel_delivery_blocked(ch[1]), 'channel reads as blocked');
  perform pg_temp.ok((select status from public.fan_notification_channels where id = ch[1]) = 'eligible', 'channel status untouched');
  perform pg_temp.ok(not exists (select 1 from public.fan_notifications where app_user_id = u[1] and kind::text = 'email_delivery_blocked'), 'notice stays off by default');
  -- Nothing raw is stored.
  perform pg_temp.ok(not exists (select 1 from public.email_delivery_events e cross join lateral jsonb_each_text(to_jsonb(e)) kv(k, v) where kv.k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'email_delivery_events' and data_type = 'text') and kv.v ~* 'example\.(com|invalid)|smtp|\m550[ -]'), 'no raw address or diagnostic text stored');

  -- Same SNS message twice: same result, one row, no second effect.
  r := pg_temp.ev('sns-perm-1', 'Bounce', 'm-perm-1', d, pg_temp.bounce('Permanent', 'General'));
  perform pg_temp.ok((r->>'duplicate')::boolean and r->>'effect' = 'bounced', 'duplicate returns the first result');
  perform pg_temp.ok((select count(*) from public.email_delivery_events where sns_message_id = 'sns-perm-1') = 1, 'duplicate stored once');

  -- A new mail for the stopped member never gets a plan; eligibility refuses too.
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
    values (u[1], 'runmusic_result', 'runmusic_result:' || draw || ':' || u[1], now()) returning id into note;
  perform pg_temp.ok(not exists (select 1 from public.notification_delivery_plans where notification_id = note), 'blocked mail channel gets no plan');
  perform pg_temp.ok(not public.email_notification_delivery_is_eligible(note, ch[1]), 'blocked mail channel is not eligible');

  -- Address changed: released automatically; the old address's late events do not touch the new one.
  update public.fan_notification_channels set destination_fingerprint = public.email_destination_fingerprint('edh1-new@example.invalid') where id = ch[1];
  update public.fan_notification_channel_private set destination = 'edh1-new@example.invalid' where channel_id = ch[1];
  perform pg_temp.ok(not public.email_channel_delivery_blocked(ch[1]), 'address change releases the block');
  perform pg_temp.ok(public.email_notification_delivery_is_eligible(note, ch[1]), 'new address is eligible again');
  r := pg_temp.ev('sns-perm-late', 'Complaint', 'm-perm-1', d, '{"complaint":{"complaintFeedbackType":"abuse"}}');
  perform pg_temp.ok(r->>'effect' = 'stale_address' and not public.email_channel_delivery_blocked(ch[1]), 'late event for the old address is ignored');

  -- From here a newly stopped channel creates one site-only notice.
  update public.email_delivery_health_control set notice_enabled = true;

  -- Soft bounces: two count, a delivery resets, three in a row pause for 14 days.
  d := pg_temp.sent(u[2], ch[2], 'm-soft-1');
  r := pg_temp.ev('sns-soft-1', 'Bounce', 'm-soft-1', d, pg_temp.bounce('Transient', 'MailboxFull'));
  perform pg_temp.ok(r->>'effect' = 'soft_counted', 'first soft bounce counted');
  r := pg_temp.ev('sns-soft-2', 'Bounce', 'm-soft-1', d, pg_temp.bounce('Transient', 'General'));
  r := pg_temp.ev('sns-soft-3', 'Delivery', 'm-soft-1', d, '{"delivery":{"timestamp":"2026-11-15T12:01:00.000Z","recipients":["edh2@example.invalid"]}}');
  perform pg_temp.ok(r->>'effect' = 'soft_reset' and (select consecutive_soft_bounces from public.email_channel_delivery_health where channel_id = ch[2]) = 0, 'delivery resets the count');
  r := pg_temp.ev('sns-soft-4', 'Bounce', 'm-soft-1', d, pg_temp.bounce('Transient', 'ContentRejected'));
  perform pg_temp.ok(r->>'effect' = 'ops_alert' and (select consecutive_soft_bounces from public.email_channel_delivery_health where channel_id = ch[2]) = 0, 'content rejection is not the member''s fault');
  for i in 1..3 loop
    d2 := pg_temp.sent(u[2], ch[2], 'm-soft-x' || i);
    r := pg_temp.ev('sns-soft-x' || i, 'Bounce', 'm-soft-x' || i, d2, pg_temp.bounce(case when i = 2 then 'Undetermined' else 'Transient' end, case when i = 2 then 'Undetermined' else 'General' end));
  end loop;
  select * into strict h from public.email_channel_delivery_health where channel_id = ch[2];
  perform pg_temp.ok(r->>'effect' = 'soft_paused' and h.state = 'soft_paused' and h.paused_until between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', 'three soft bounces pause 14 days');
  perform pg_temp.ok(public.email_channel_delivery_blocked(ch[2]) and not public.email_channel_delivery_blocked(ch[2], now() + interval '15 days'), 'pause ends by itself');
  perform pg_temp.ok((select count(*) from public.fan_notifications where app_user_id = u[2] and kind::text = 'email_delivery_blocked') = 1, 'pause creates one notice');
  -- Paused again after it lapses: still only one notice in 30 days.
  update public.email_channel_delivery_health set paused_until = now() - interval '1 minute' where channel_id = ch[2];
  r := pg_temp.ev('sns-soft-y', 'Bounce', 'm-soft-x3', null, pg_temp.bounce('Transient', 'General'));
  perform pg_temp.ok(r->>'effect' = 'soft_paused' and public.email_channel_delivery_blocked(ch[2]), 'retry after the pause that bounces pauses again');
  perform pg_temp.ok((select count(*) from public.fan_notifications where app_user_id = u[2] and kind::text = 'email_delivery_blocked') = 1, 'one notice per 30 days');

  -- Complaint: stopped at once with a site-only notice that opens settings and shows in the inbox.
  d := pg_temp.sent(u[3], ch[3], 'm-cmp-1');
  r := pg_temp.ev('sns-cmp-1', 'Complaint', 'm-cmp-1', d, '{"complaint":{"complaintFeedbackType":"abuse","complainedRecipients":[{"emailAddress":"edh3@example.invalid"}]}}');
  perform pg_temp.ok(r->>'effect' = 'complained' and pg_temp.state(ch[3]) = 'complained' and public.email_channel_delivery_blocked(ch[3]), 'complaint blocks');
  select id into strict note from public.fan_notifications where app_user_id = u[3] and kind::text = 'email_delivery_blocked';
  perform pg_temp.ok((select web_only and payload->>'state' = 'complained' and payload->>'destinationLabel' = 'e***@example.invalid' from public.fan_notifications where id = note), 'notice is site only with masked label');
  perform pg_temp.ok(public.fan_web_notification_path(u[3], note) = '/settings', 'notice opens settings');
  perform pg_temp.ok(public.get_owned_web_notifications(u[3], 'ko') @> jsonb_build_array(jsonb_build_object('id', note, 'deep_link', '/settings')), 'notice is listed in the inbox');
  perform pg_temp.ok(not exists (select 1 from public.notification_delivery_plans where notification_id = note)
    and not exists (select 1 from public.notification_delivery_outbox where notification_id = note), 'notice never goes out by mail or push');
  -- A later permanent bounce does not weaken a complaint.
  r := pg_temp.ev('sns-cmp-2', 'Bounce', 'm-cmp-1', d, pg_temp.bounce('Permanent', 'General'));
  perform pg_temp.ok(pg_temp.state(ch[3]) = 'complained', 'complaint outranks bounce');

  -- not-spam feedback and the account suppression list.
  d := pg_temp.sent(u[4], ch[4], 'm-sup-1');
  r := pg_temp.ev('sns-ns-1', 'Complaint', 'm-sup-1', d, '{"complaint":{"complaintFeedbackType":"not-spam"}}');
  perform pg_temp.ok(r->>'effect' = 'not_spam' and pg_temp.state(ch[4]) = 'ok', 'not-spam does not block');
  r := pg_temp.ev('sns-sup-1', 'Bounce', 'm-sup-1', d, pg_temp.bounce('Permanent', 'OnAccountSuppressionList'));
  perform pg_temp.ok(pg_temp.state(ch[4]) = 'bounced'
    and (select reason from public.email_channel_delivery_health where channel_id = ch[4]) = 'bounce_on_account_suppression_list', 'suppression-list bounce blocks');

  -- Outcome-unknown send corrected by the SES Send event (found by the delivery_id tag).
  d := pg_temp.sent(u[5], ch[5], null, true);
  r := pg_temp.ev('sns-send-1', 'Send', 'm-unk-1', d);
  perform pg_temp.ok(r->>'match' = 'matched' and (r->>'sendConfirmed')::boolean, 'send event matched by tag: ' || r::text);
  perform pg_temp.ok((select status = 'accepted' and provider_message_id = 'm-unk-1' and error_code is null from public.email_notification_send_attempts where delivery_id = d), 'attempt corrected to accepted');
  perform pg_temp.ok((select status = 'sent' and sent_at is not null and last_error_code is null from public.external_notification_delivery_outbox where id = d), 'delivery corrected to sent');
  perform pg_temp.ok((select p.status = 'sent' from public.notification_delivery_plans p join public.external_notification_delivery_outbox o on o.plan_id = p.id where o.id = d), 'plan corrected to sent');
  r := pg_temp.ev('sns-send-1', 'Send', 'm-unk-1', d);
  perform pg_temp.ok((r->>'duplicate')::boolean, 'repeated send event is a duplicate');
  r := pg_temp.ev('sns-dlv-1', 'Delivery', 'm-unk-1', null, '{"delivery":{"recipients":["edh5@example.invalid"]}}');
  perform pg_temp.ok(r->>'match' = 'matched' and pg_temp.state(ch[5]) = 'ok', 'later events match by provider id');
  -- A tag cannot claim a send that already has another provider id.
  r := pg_temp.ev('sns-forged', 'Complaint', 'm-other', d, '{"complaint":{"complaintFeedbackType":"abuse"}}');
  perform pg_temp.ok(r->>'match' = 'unmatched' and pg_temp.state(ch[5]) = 'ok', 'mismatched tag stays unmatched');

  -- Unknown provider id (inquiry mail, Cognito, other environments): recorded, nothing stopped.
  r := pg_temp.ev('sns-unknown-1', 'Bounce', 'm-not-ours', null, pg_temp.bounce('Permanent', 'General'));
  perform pg_temp.ok(r->>'match' = 'unmatched' and r->>'effect' = 'unmatched'
    and (select channel_id is null and delivery_id is null and destination_fingerprint is not null from public.email_delivery_events where sns_message_id = 'sns-unknown-1'), 'unknown message id is unmatched');
  perform pg_temp.ok((select count(*) from public.email_channel_delivery_health) = 5 and (select count(*) from public.email_delivery_events where match_status = 'unmatched') = 2, 'unmatched events create no health rows');

  -- Member 6: no channel, no send, no health row.
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
    values (u[6], 'runmusic_result', 'runmusic_result:' || draw || ':' || u[6], now()) returning id into note;
  perform pg_temp.ok(not exists (select 1 from public.notification_delivery_plans where notification_id = note), 'no channel: no plan');
  perform pg_temp.ok(not public.email_channel_delivery_blocked(extensions.gen_random_uuid()), 'unknown channel is not blocked');
  perform pg_temp.ok(coalesce(public.email_notification_delivery_is_eligible(note, null), false) = false, 'no channel: not eligible, no error');
  perform pg_temp.ok(jsonb_typeof(public.get_owned_web_notifications(u[6], 'ko')) = 'array', 'inbox still reads');
  perform pg_temp.ok(jsonb_typeof(public.get_owned_notification_connections(u[6])->'channels') = 'array', 'connections still read');
  -- Untouched member with a channel and no events stays eligible.
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
    values (u[5], 'runmusic_result', 'runmusic_result:' || draw || ':' || u[5], now()) returning id into note;
  perform pg_temp.ok(exists (select 1 from public.notification_delivery_plans where notification_id = note and primary_channel_id = ch[5]), 'healthy member still gets a plan');

  -- Bad input is refused; tables and the recorder are service only.
  begin
    perform public.record_ses_email_event('{"message":{}}');
    failed := false;
  exception when sqlstate '22023' then failed := true;
  end;
  perform pg_temp.ok(failed, 'missing SNS id is refused');
  perform pg_temp.ok(has_function_privilege('service_role', 'public.record_ses_email_event(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_ses_email_event(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_ses_email_event(jsonb)', 'execute'), 'recorder is service only');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.email_delivery_events', 'select')
    and not has_table_privilege('authenticated', 'public.email_channel_delivery_health', 'select')
    and not has_table_privilege('service_role', 'public.email_channel_delivery_health', 'insert')
    and has_table_privilege('service_role', 'public.email_channel_delivery_health', 'select'), 'tables are service read only');
  perform pg_temp.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.email_delivery_events'::regclass, 'public.email_channel_delivery_health'::regclass, 'public.email_delivery_health_control'::regclass)), 'RLS on');
end $$;
rollback;
