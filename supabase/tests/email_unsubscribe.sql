-- Local disposable-database contract test for apply_email_unsubscribe. All fixtures are rolled back.
begin;

do $$
declare
  user_a uuid := pg_catalog.gen_random_uuid();
  user_b uuid := pg_catalog.gen_random_uuid();
  channel_a uuid := pg_catalog.gen_random_uuid();
  channel_b uuid := pg_catalog.gen_random_uuid();
  note_a uuid := pg_catalog.gen_random_uuid();
  note_b uuid := pg_catalog.gen_random_uuid();
  result jsonb;
  c public.fan_notification_channels%rowtype;
  failed boolean;
begin
  insert into public.app_users (id, privy_user_id, verified_email, status) values
    (user_a, 'did:privy:email-unsub-a-' || user_a, 'unsub-a@example.invalid', 'active'),
    (user_b, 'did:privy:email-unsub-b-' || user_b, 'unsub-b@example.invalid', 'active');
  insert into public.fan_notification_channels (id, app_user_id, kind, status, consent_version, consented_at, destination_fingerprint, destination_label, verified_at) values
    (channel_a, user_a, 'email', 'eligible', '2026-09-v1', now(), repeat('a', 64), 'u***@example.invalid', now()),
    (channel_b, user_b, 'email', 'eligible', '2026-09-v1', now(), repeat('b', 64), 'u***@example.invalid', now());
  insert into public.fan_notifications (id, app_user_id, kind, source_key, scheduled_for) values
    (note_a, user_a, 'runmusic_result', 'runmusic_result:unsub-a:' || user_a, now()),
    (note_b, user_b, 'runmusic_result', 'runmusic_result:unsub-b:' || user_b, now());

  -- A kind switch changes only the notification's owner.
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', false);
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = false, 'owner preference is off';
  assert not exists (select 1 from public.notification_preferences where app_user_id = user_b and benefit_notifications = false), 'other member is untouched';

  -- It can be switched back on.
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', true);
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = true, 'preference is back on';

  -- Turning off all mail closes only the owner's mail channel.
  result := public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, false);
  assert result = jsonb_build_object('scope', 'email', 'enabled', false), 'email scope result';
  select * into c from public.fan_notification_channels where id = channel_a;
  assert c.status = 'disabled' and c.consent_revoked_at is not null, 'owner mail channel is off';
  select * into c from public.fan_notification_channels where id = channel_b;
  assert c.status = 'eligible' and c.consent_revoked_at is null, 'other member mail channel is untouched';

  -- Repeating the request changes nothing (mail clients may post twice).
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, false);
  assert (select count(*) from public.fan_notification_consent_audits where channel_id = channel_a and not consented) = 1, 'one revoke audit';

  -- The same link turns it back on, and the channel is eligible again.
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, true);
  select * into c from public.fan_notification_channels where id = channel_a;
  assert c.status = 'eligible' and c.consent_revoked_at is null and c.consented_at is not null, 'owner mail channel is back on';

  -- A switch-on never reopens a channel the member did not turn off.
  update public.fan_notification_channels set status = 'disabled' where id = channel_b;
  perform public.apply_email_unsubscribe(note_b, 'runmusic_result', 'email', null, true);
  select * into c from public.fan_notification_channels where id = channel_b;
  assert c.status = 'disabled', 'a channel closed for another reason stays closed';

  -- The link names the kind; a different kind, a missing notification, or a bad scope is refused.
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'live_10m', 'email', null, false); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'kind mismatch is refused';
  failed := false;
  begin perform public.apply_email_unsubscribe(pg_catalog.gen_random_uuid(), 'runmusic_result', 'email', null, false); exception when sqlstate 'P0002' then failed := true; end;
  assert failed, 'unknown notification is refused';
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'everything', null, false); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown scope is refused';
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'not_a_preference', false); exception when sqlstate '22023' then failed := true; end;
  assert failed, 'unknown preference is refused';

  -- Only the server role can call it.
  assert not has_function_privilege('anon', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text)', 'execute'), 'anon cannot call';
  assert not has_function_privilege('authenticated', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text)', 'execute'), 'authenticated cannot call';
  assert has_function_privilege('service_role', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text)', 'execute'), 'service_role can call';
  assert not has_function_privilege('service_role', 'public.email_unsubscribe_destination_binding(uuid,text)', 'execute'), 'binding helper is not exposed';
end $$;

-- EMAIL-UNSUB-BIND-1116: a link only acts while the member's mail address is the one the mail went to.
do $$
declare
  user_a uuid := pg_catalog.gen_random_uuid();
  user_b uuid := pg_catalog.gen_random_uuid();
  channel_a uuid := pg_catalog.gen_random_uuid();
  channel_b uuid := pg_catalog.gen_random_uuid();
  note_a uuid := pg_catalog.gen_random_uuid();
  note_b uuid := pg_catalog.gen_random_uuid();
  note_old uuid := pg_catalog.gen_random_uuid();
  plan_old uuid;
  delivery_old uuid := pg_catalog.gen_random_uuid();
  fp_a text := encode(extensions.digest(lower(trim('bind-a@example.invalid')), 'sha256'), 'hex');
  fp_new text := encode(extensions.digest(lower(trim('bind-a-new@example.invalid')), 'sha256'), 'hex');
  fp_b text := encode(extensions.digest(lower(trim('bind-b@example.invalid')), 'sha256'), 'hex');
  link_a text;
  c public.fan_notification_channels%rowtype;
  failed boolean;
begin
  insert into public.app_users (id, privy_user_id, verified_email, status) values
    (user_a, 'did:privy:email-bind-a-' || user_a, 'bind-a@example.invalid', 'active'),
    (user_b, 'did:privy:email-bind-b-' || user_b, 'bind-b@example.invalid', 'active');
  insert into public.fan_notification_channels (id, app_user_id, kind, status, consent_version, consented_at, destination_fingerprint, destination_label, verified_at) values
    (channel_a, user_a, 'email', 'eligible', '2026-09-v1', now(), fp_a, 'b***@example.invalid', now()),
    (channel_b, user_b, 'email', 'eligible', '2026-09-v1', now(), fp_b, 'b***@example.invalid', now());
  insert into public.fan_notifications (id, app_user_id, kind, source_key, scheduled_for) values
    (note_a, user_a, 'runmusic_result', 'runmusic_result:bind-a:' || user_a, now()),
    (note_b, user_b, 'runmusic_result', 'runmusic_result:bind-b:' || user_b, now()),
    (note_old, user_a, 'runmusic_result', 'runmusic_result:bind-old:' || user_a, now());

  -- The worker's binding (apps/worker/test/email-unsubscribe.test.ts pins the same vector).
  assert public.email_unsubscribe_destination_binding('7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d', encode(extensions.digest(lower(trim('Fan@Example.com ')), 'sha256'), 'hex'))
    = encode(extensions.digest('email-unsubscribe-destination:v1:7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d:' || encode(extensions.digest('fan@example.com', 'sha256'), 'hex'), 'sha256'), 'hex'), 'binding formula';

  -- Same address: the link works.
  link_a := public.email_unsubscribe_destination_binding(note_a, fp_a);
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', false, now(), link_a);
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = false, 'bound link works for the same address';
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', true, now(), link_a);

  -- A forged binding changes nothing.
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, false, now(), repeat('0', 64)); exception when sqlstate '55000' then failed := true; end;
  assert failed, 'forged binding is refused';

  -- Another member's notification with this member's binding is refused.
  failed := false;
  begin perform public.apply_email_unsubscribe(note_b, 'runmusic_result', 'email', null, false, now(), link_a); exception when sqlstate '55000' then failed := true; end;
  assert failed, 'binding of another member is refused';
  select * into c from public.fan_notification_channels where id = channel_b;
  assert c.status = 'eligible' and c.consent_revoked_at is null, 'other member mail channel is untouched';

  -- Address changes A -> B: the old link changes neither the kind switch nor all mail.
  update public.fan_notification_channels set destination_fingerprint = fp_new where id = channel_a;
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', false, now(), link_a); exception when sqlstate '55000' then failed := true; end;
  assert failed, 'old-address link cannot switch a kind';
  failed := false;
  begin perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, false, now(), link_a); exception when sqlstate '55000' then failed := true; end;
  assert failed, 'old-address link cannot stop all mail';
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = true, 'kind switch unchanged';
  select * into c from public.fan_notification_channels where id = channel_a;
  assert c.status = 'eligible' and c.consent_revoked_at is null, 'mail channel unchanged';
  -- A mail sent to the new address works.
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, false, now(), public.email_unsubscribe_destination_binding(note_a, fp_new));
  select * into c from public.fan_notification_channels where id = channel_a;
  assert c.status = 'disabled', 'new-address link works';
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'email', null, true, now(), public.email_unsubscribe_destination_binding(note_a, fp_new));

  -- Links sent before the binding (no binding) keep working when no send address is recorded.
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', false);
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = false, 'old link without a recorded send still works';
  perform public.apply_email_unsubscribe(note_a, 'runmusic_result', 'preference', 'benefit_notifications', true);

  -- An old link whose recorded send address is still current works; after the address changes it is refused.
  update public.fan_notification_channels set destination_fingerprint = fp_a where id = channel_a;
  -- Inserting the notification may already have planned its delivery; reuse that plan.
  select id into plan_old from public.notification_delivery_plans where notification_id = note_old;
  if plan_old is null then
    plan_old := pg_catalog.gen_random_uuid();
    insert into public.notification_delivery_plans (id, notification_id, primary_channel_id) values (plan_old, note_old, channel_a);
  end if;
  delete from public.external_notification_delivery_outbox where plan_id = plan_old;
  insert into public.external_notification_delivery_outbox (id, plan_id, notification_id, channel_id, channel, sequence, template_key, status, sent_at)
    values (delivery_old, plan_old, note_old, channel_a, 'email', 1, 'runmusic_result', 'sent', now());
  insert into public.email_notification_send_attempts (delivery_id, worker_id, attempt_count, destination_fingerprint, status, provider_message_id, lease_expires_at)
    values (delivery_old, 'test', 1, fp_a, 'accepted', 'msg-bind-old', now());
  perform public.apply_email_unsubscribe(note_old, 'runmusic_result', 'preference', 'benefit_notifications', false);
  assert (select benefit_notifications from public.notification_preferences where app_user_id = user_a) = false, 'old link to the current address works';
  perform public.apply_email_unsubscribe(note_old, 'runmusic_result', 'preference', 'benefit_notifications', true);
  update public.fan_notification_channels set destination_fingerprint = fp_new where id = channel_a;
  failed := false;
  begin perform public.apply_email_unsubscribe(note_old, 'runmusic_result', 'email', null, false); exception when sqlstate '55000' then failed := true; end;
  assert failed, 'old link to a replaced address is refused';
  select * into c from public.fan_notification_channels where id = channel_a;
  assert c.status = 'eligible' and c.consent_revoked_at is null, 'mail channel unchanged by the old link';
end $$;

rollback;
