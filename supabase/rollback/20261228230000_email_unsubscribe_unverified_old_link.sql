-- Rollback for 20261228230000_email_unsubscribe_unverified_old_link.sql: restores apply_email_unsubscribe of 20261228130000.
-- An old link with no recorded send address can switch mail on again. Nothing else is touched.
begin;
set local lock_timeout='5s';

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
begin
  if p_scope is null or p_via is null or p_scope not in ('activity','email') or p_via not in ('mail_page','one_click') or p_enabled is null
 then
    raise exception 'EMAIL_UNSUBSCRIBE_INVALID' using errcode='22023';
  end if;
  select n.app_user_id into v_user from public.fan_notifications n
   where n.id=p_notification_id and n.kind::text=p_template_key;
  if not found then raise exception 'EMAIL_UNSUBSCRIBE_NOT_FOUND' using errcode='P0002'; end if;

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
