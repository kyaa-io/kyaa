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
  assert not has_function_privilege('anon', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz)', 'execute'), 'anon cannot call';
  assert not has_function_privilege('authenticated', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz)', 'execute'), 'authenticated cannot call';
  assert has_function_privilege('service_role', 'public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz)', 'execute'), 'service_role can call';
end $$;

rollback;
