begin;
set local lock_timeout = '5s';

drop function public.chemi_mail_drain_test(text);

-- Claim and authorize one attempt atomically. A lost or ambiguous provider
-- response must not result in another send.
create function public.chemi_mail_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  job public.chemi_mail_outbox%rowtype;
  prefs public.notification_preferences%rowtype;
  address text;
  body text;
  token uuid := extensions.gen_random_uuid();
begin
  update public.chemi_mail_outbox
    set status = 'failed', lease_owner = null, lease_expires_at = null,
        last_error_code = 'CHEMI_MAIL_DELIVERY_UNKNOWN'
    where status = 'leased' and lease_expires_at <= now();

  for job in select * from public.chemi_mail_outbox
    where status = 'pending' and send_after <= now()
    order by send_after, id limit 50 for update skip locked
  loop
    select u.verified_email into address
      from public.app_users u
      join public.fan_notification_channels c on c.id = public.chemi_mail_channel(u.id)
      where u.id = job.user_id
        and c.destination_fingerprint = public.email_destination_fingerprint(u.verified_email);
    select * into prefs from public.notification_preferences where app_user_id = job.user_id;
    body := null;
    if address is not null and (job.category <> 'friend' or
        coalesce(prefs.friend_activity_notifications and prefs.activity_email_notifications, true)) then
      body := public.chemi_mail_render(job.kind, job.category, job.payload,
        coalesce(prefs.marketing_notifications, false));
    end if;
    if body is null then
      update public.chemi_mail_outbox set status = 'cancelled', last_error_code = 'CHEMI_MAIL_INELIGIBLE'
        where id = job.id;
      continue;
    end if;
    update public.chemi_mail_outbox
      set status = 'leased', lease_owner = token::text, lease_expires_at = now() + interval '2 minutes',
          attempts = attempts + 1, to_hash = public.email_destination_fingerprint(address), last_error_code = null
      where id = job.id;
    return jsonb_build_object('id', job.id, 'token', token, 'kind', job.kind,
      'destination', address, 'body', body, 'advertising',
      job.category <> 'transactional' and coalesce(prefs.marketing_notifications, false));
  end loop;
  return null;
end $$;

create function public.chemi_mail_finish(p_id uuid, p_token uuid, p_sent boolean, p_test_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  job_kind text;
begin
  update public.chemi_mail_outbox set
    status = case when p_sent then 'sent' else 'failed' end,
    sent_at = case when p_sent then now() end,
    last_error_code = case when not p_sent then 'CHEMI_MAIL_SEND_FAILED' end,
    lease_owner = null, lease_expires_at = null
  where id = p_id and status = 'leased' and lease_owner = p_token::text
  returning kind into job_kind;
  if not found then return false; end if;
  if p_sent and p_test_hash is not null then
    insert into public.chemi_mail_test_sink(mail_id, template_key, payload_hash)
    values (p_id, 'chemi:' || job_kind, p_test_hash);
  end if;
  return true;
end $$;

revoke all on function public.chemi_mail_claim(), public.chemi_mail_finish(uuid,uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_mail_claim(), public.chemi_mail_finish(uuid,uuid,boolean,text)
  to service_role;

create or replace function public.apply_email_unsubscribe(
  p_notification_id uuid,
  p_template_key text,
  p_scope text,
  p_preference text,
  p_enabled boolean,
  p_now timestamptz default pg_catalog.now(),
  p_destination_binding text default null,
  p_via text default 'mail_page'
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid;
  v_channel public.fan_notification_channels%rowtype;
  v_has_channel boolean;
  v_chemi boolean := p_template_key in ('chemi_friend', 'chemi_remind', 'chemi_lucky_draw');
  v_sent_fingerprint text;
begin
  if p_scope is null or p_via is null or p_scope not in ('activity','email') or p_via not in ('mail_page','one_click') or p_enabled is null
 then
    raise exception 'EMAIL_UNSUBSCRIBE_INVALID' using errcode='22023';
  end if;
  if v_chemi then
    select m.user_id, m.to_hash into v_user, v_sent_fingerprint from public.chemi_mail_outbox m
      where m.id = p_notification_id and 'chemi_' || m.kind = p_template_key
        and m.status in ('leased', 'sent', 'failed') and m.to_hash is not null;
    if v_user is null then raise exception 'EMAIL_UNSUBSCRIBE_NOT_FOUND' using errcode='P0002'; end if;
    if p_destination_binding is distinct from
        public.email_unsubscribe_destination_binding(p_notification_id, v_sent_fingerprint) then
      raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
    end if;
  else
    select n.app_user_id into v_user from public.fan_notifications n
      where n.id=p_notification_id and n.kind::text=p_template_key;
    if not found then raise exception 'EMAIL_UNSUBSCRIBE_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  -- Lock the mail channel first so an address change cannot slip in between the check and the change.
  select * into v_channel from public.fan_notification_channels
   where app_user_id=v_user and kind='email' for update;
  v_has_channel := found;

  if p_destination_binding is not null then
    if not v_has_channel
       or public.email_unsubscribe_destination_binding(p_notification_id, v_channel.destination_fingerprint) <> p_destination_binding then
      raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
    end if;
  elsif exists (
      select 1 from public.email_notification_send_attempts a
      join public.external_notification_delivery_outbox o on o.id=a.delivery_id
      where o.notification_id=p_notification_id and o.channel='email')
    and not (v_has_channel and exists (
      select 1 from public.email_notification_send_attempts a
      join public.external_notification_delivery_outbox o on o.id=a.delivery_id
      where o.notification_id=p_notification_id and o.channel='email'
        and a.destination_fingerprint=v_channel.destination_fingerprint)) then
    raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
  elsif p_enabled and not exists (
      select 1 from public.email_notification_send_attempts a
      join public.external_notification_delivery_outbox o on o.id=a.delivery_id
      where o.notification_id=p_notification_id and o.channel='email') then
    -- No binding and no recorded send address: the address this link was sent to cannot be confirmed.
    -- Switching mail off is always safe to allow; turning it back on is not.
    raise exception 'EMAIL_UNSUBSCRIBE_DESTINATION_CHANGED' using errcode='55000';
  end if;

  if not p_enabled and v_chemi then
    update public.notification_preferences set marketing_notifications = false where app_user_id = v_user;
  end if;

  if p_scope='activity' then
    insert into public.notification_preferences(app_user_id) values(v_user) on conflict do nothing;
    update public.notification_preferences set activity_email_notifications=p_enabled, activity_email_updated_at=p_now, activity_email_updated_via=p_via where app_user_id=v_user;
  else
    if not v_has_channel then raise exception 'EMAIL_UNSUBSCRIBE_NO_CHANNEL' using errcode='P0002'; end if;
    -- Only undo a switch the member turned off. A channel closed for another reason stays closed.
    if p_enabled=false and v_channel.consent_revoked_at is null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, false, 'email-unsubscribe-v1', p_now);
    elsif p_enabled and v_channel.consent_revoked_at is not null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, true, 'email-unsubscribe-v1', p_now);
    end if;
  end if;
  return jsonb_build_object('scope', p_scope, 'enabled', p_enabled);
end $$;

revoke all on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
