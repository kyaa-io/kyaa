-- Signed mail unsubscribe links: the web app verifies the link, then calls this one function.
-- The notification id in the link names the member, so a link can never act on another member.
begin;
set local lock_timeout='5s';

create function public.apply_email_unsubscribe(
  p_notification_id uuid,
  p_template_key text,
  p_scope text,
  p_preference text,
  p_enabled boolean,
  p_now timestamptz default pg_catalog.now()
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid;
  v_channel public.fan_notification_channels%rowtype;
begin
  if p_scope not in ('preference','email') or p_enabled is null
     or (p_scope='preference' and p_preference is null) then
    raise exception 'EMAIL_UNSUBSCRIBE_INVALID' using errcode='22023';
  end if;
  select n.app_user_id into v_user from public.fan_notifications n
   where n.id=p_notification_id and n.kind::text=p_template_key;
  if not found then raise exception 'EMAIL_UNSUBSCRIBE_NOT_FOUND' using errcode='P0002'; end if;

  if p_scope='preference' then
    perform public.fan_web_patch_notification_preferences(v_user, jsonb_build_object(p_preference, p_enabled));
  else
    select * into v_channel from public.fan_notification_channels
     where app_user_id=v_user and kind='email' for update;
    if not found then raise exception 'EMAIL_UNSUBSCRIBE_NO_CHANNEL' using errcode='P0002'; end if;
    -- Only undo a switch the member turned off. A channel closed for another reason stays closed.
    if p_enabled=false and v_channel.consent_revoked_at is null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, false, 'email-unsubscribe-v1', p_now);
    elsif p_enabled and v_channel.consent_revoked_at is not null then
      perform public.set_owned_notification_channel_consent(v_user, v_channel.id, true, 'email-unsubscribe-v1', p_now);
    end if;
  end if;
  return jsonb_build_object('scope', p_scope, 'enabled', p_enabled);
end $$;

revoke all on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
