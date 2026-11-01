begin;
do $$declare actor uuid:=gen_random_uuid();r jsonb;signature text;begin
 foreach signature in array array['public.group_wallet_enabled()','public.group_wallet_balance(uuid,text)','public.group_wallet_lock(uuid,boolean)','public.group_wallet_legacy_lock(uuid)','public.group_wallet_invitation_lock(uuid,uuid)','public.group_wallet_refund_lock(uuid)','public.require_group_content_member(uuid,uuid)','public.fan_web_is_page_member(uuid,uuid)','public.group_notification_page(text,uuid)','public.fan_web_notification_kind(text)','public.fan_web_notification_path(uuid,uuid)','public.mobile_social_notification_path(uuid,text,text,uuid)','public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)','public.send_social_dm_message(uuid,uuid,text,uuid)','public.send_social_dm_message(uuid,uuid,text,uuid,uuid)']loop
  if not has_function_privilege('groups_legacy_owner_fixture',signature,'execute')then raise exception 'missing legacy execute %',signature;end if;
 end loop;
 if not has_table_privilege('groups_legacy_owner_fixture','public.group_wallet_release','select')or has_table_privilege('groups_legacy_owner_fixture','public.group_wallet_release','update')then raise exception 'legacy release access must be select only';end if;
 if not has_table_privilege('groups_legacy_owner_fixture','public.group_notification_settings','select')or has_table_privilege('groups_legacy_owner_fixture','public.group_notification_settings','update')then raise exception 'legacy notification access must be select only';end if;
 if has_function_privilege('anon','public.group_wallet_enabled()','execute')or has_function_privilege('authenticated','public.group_wallet_enabled()','execute')or has_function_privilege('service_role','public.group_wallet_enabled()','execute')then raise exception 'private helper exposed';end if;
 if exists(select 1 from (values('anon'),('authenticated'),('service_role'))roles(name)where has_table_privilege(name,'public.group_wallet_release','select')or has_table_privilege(name,'public.group_notification_settings','select'))then raise exception 'private table exposed';end if;
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:legacy-owner-'||actor,actor||'@example.test');
 update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
 execute 'set local role service_role';
 r:=public.read_owned_group_wallet(actor);
 execute 'reset role';
 if r->>'points'<>'0'or r->>'hearts'<>'0'or r->>'tickets'<>'0'then raise exception 'distinct-owner wallet read failed';end if;
end $$;
rollback;
