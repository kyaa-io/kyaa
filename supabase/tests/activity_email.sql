begin;
do $$
declare u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); ok boolean;
begin
 insert into app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:activity-'||u,'activity@example.invalid','active');
 assert public.activity_email_allowed(u,'artist_comment'), 'missing preferences default on';
 perform public.fan_web_patch_notification_preferences(u,'{"activity_email_notifications":false}');
 assert (select activity_email_updated_via='settings' from notification_preferences where app_user_id=u), 'settings trace';
 assert not public.activity_email_allowed(u,'artist_comment'), 'tier3 off';
 assert public.activity_email_allowed(u,'benefit_won'), 'tier1 on';
 assert public.activity_email_allowed(u,'live_10m'), 'tier2 on';
 insert into fan_notification_channels(id,app_user_id,kind,status,consent_version,consented_at,destination_fingerprint,destination_label,verified_at) values(c,u,'email','eligible','test',now(),repeat('a',64),'example',now());
 insert into fan_notifications(id,app_user_id,kind,source_key,scheduled_for) values(n,u,'artist_comment','activity:test:'||u,now());
 assert exists(select 1 from fan_notifications where id=n), 'in-app notification remains';
 assert not public.email_notification_delivery_is_eligible(n,c), 'actual outer mail gate rejects tier3';
 perform public.create_external_notification_plan_before_fan_web(n);
 assert not exists(select 1 from external_notification_delivery_outbox where notification_id=n and channel='email'), 'actual plan creates no email';
 perform public.apply_email_unsubscribe(n,'artist_comment','activity',null,false,now(),null,'one_click');
 assert (select benefit_notifications and live_reminders and activity_email_updated_via='one_click' from notification_preferences where app_user_id=u), 'one-click only activity';
 assert (select consent_revoked_at is null from fan_notification_channels where id=c), 'channel consent unchanged';
 ok:=false;begin perform public.apply_email_unsubscribe(n,'artist_comment','preference','benefit_notifications',false);exception when sqlstate '22023' then ok:=true;end;assert ok,'preference refused';
delete from notification_preferences where app_user_id=u;
 perform public.create_external_notification_plan_before_fan_web(n);
 assert exists(select 1 from external_notification_delivery_outbox where notification_id=n and channel='email'), 'missing preference row defaults on in actual plan';
end $$;
rollback;
