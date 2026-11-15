-- Rollback for 20261228110100_email_unsubscribe_destination_binding.sql: restores apply_email_unsubscribe of 20261227210001.
-- Roll the web back first: the new web passes p_destination_binding, which the restored function does not take.
-- Links stop being tied to the send address again. Nothing else is touched.
begin;
set local lock_timeout='5s';
drop function if exists public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz,text);
drop function if exists public.email_unsubscribe_destination_binding(uuid,text);

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
