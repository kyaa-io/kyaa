begin;
-- Imported legacy definers keep their trusted NOLOGIN owner after CREATE OR REPLACE.
do $access$
declare legacy_owner name; signature text;
begin
 select pg_get_userbyid(proowner)into strict legacy_owner from pg_proc where oid='public.fan_web_lock_active_user(uuid)'::regprocedure;
 if legacy_owner=current_user then return;end if;
 if legacy_owner in ('anon','authenticated','service_role')or(select rolcanlogin from pg_roles where rolname=legacy_owner)then
  raise exception 'Unexpected legacy definer owner: %',legacy_owner;
 end if;
 foreach signature in array array['public.group_wallet_enabled()','public.group_wallet_balance(uuid,text)','public.group_wallet_lock(uuid,boolean)','public.group_wallet_legacy_lock(uuid)','public.group_wallet_invitation_lock(uuid,uuid)','public.group_wallet_refund_lock(uuid)','public.require_group_content_member(uuid,uuid)','public.fan_web_is_page_member(uuid,uuid)','public.group_notification_page(text,uuid)','public.fan_web_notification_kind(text)','public.fan_web_notification_path(uuid,uuid)','public.mobile_social_notification_path(uuid,text,text,uuid)','public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)','public.send_social_dm_message(uuid,uuid,text,uuid)','public.send_social_dm_message(uuid,uuid,text,uuid,uuid)']loop
  execute format('grant execute on function %s to %I',signature::regprocedure,legacy_owner);
 end loop;
 execute format('grant select on public.group_wallet_release,public.group_notification_settings to %I',legacy_owner);
end $access$;
commit;
