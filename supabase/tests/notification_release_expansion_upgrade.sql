-- Disposable replay database only. Exercise rollback, then upgrade with queued work.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'local only'; end if; end $$;
\ir ../rollback/20261227190101_external_notification_release_expiry.sql
create temporary table expiry_upgrade_fixture(notification_id uuid);
do $$ declare o uuid; n uuid; begin
 o:=alert_safety_test.owner('en');
 perform public.mobile_register_owned_installation(o,extensions.gen_random_uuid(),'ios','synthetic-upgrade-token','authorized','1','en',0,extensions.gen_random_uuid());
 n:=alert_safety_test.notification(o);
 update public.fan_notifications set created_at=now()-interval '2 days' where id=n;
 update public.external_notification_delivery_outbox set created_at=now()-interval '2 days' where notification_id=n;
 perform public.configure_fan_notification_delivery('email','disabled');
 insert into expiry_upgrade_fixture values(n);
 perform alert_safety_test.assert(exists(select 1 from public.mobile_push_delivery_outbox where notification_id=n and status='pending'),'upgrade has queued mobile fixture');
end $$;
\ir ../migrations/20261227190101_external_notification_release_expiry.sql
select alert_safety_test.assert(exists(select 1 from public.external_notification_delivery_outbox where notification_id in(select notification_id from expiry_upgrade_fixture) and status='failed' and available_at='infinity' and last_error_code='EMAIL_CHANNEL_NOT_RELEASED'),'upgrade closes held email');
select alert_safety_test.assert(exists(select 1 from public.mobile_push_delivery_outbox where notification_id in(select notification_id from expiry_upgrade_fixture) and status='failed' and available_at='infinity' and last_error_code='MOBILE_PUSH_PRELAUNCH_DISABLED'),'upgrade closes mobile');
select 'Notification rollback and queued upgrade PASS' as result;
