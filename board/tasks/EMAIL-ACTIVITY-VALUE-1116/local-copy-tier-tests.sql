begin;
do $$
declare u uuid; b uuid; c uuid; n uuid; l uuid; t timestamptz; oldn uuid; sk text;
begin
 select f.app_user_id,f.benefit_id,ch.id,f.id,f.source_key into strict u,b,c,oldn,sk from fan_notifications f join fan_notification_channels ch on ch.app_user_id=f.app_user_id and ch.kind='email' where f.kind='benefit_won' and public.email_notification_delivery_is_eligible(f.id,ch.id) limit 1;
 perform public.fan_web_patch_notification_preferences(u,'{"activity_email_notifications":false}');
 update fan_notifications set source_key='activity:original:'||id where id=oldn;
 insert into fan_notifications(app_user_id,kind,benefit_id,source_key,scheduled_for) values(u,'benefit_won',b,sk,now()) returning id into n;
 assert public.email_notification_delivery_is_eligible(n,c), 'tier1 actual eligible while activity off';
 perform public.create_external_notification_plan_before_fan_web(n);
 assert exists(select 1 from external_notification_delivery_outbox where notification_id=n and channel='email'),'tier1 email planned';
 select id,starts_at-interval '5 minutes' into strict l,t from live_events where publication_status='published' and content_status='scheduled' and archived_at is null order by starts_at desc limit 1;
 insert into fan_notifications(app_user_id,kind,live_event_id,source_key,scheduled_for) values(u,'live_10m',l,'activity:tier2:'||gen_random_uuid(),t) returning id into n;
 assert public.email_notification_delivery_is_eligible(n,c,t), 'tier2 actual eligible while activity off';
 perform public.create_external_notification_plan_before_fan_web(n,t);
 assert exists(select 1 from external_notification_delivery_outbox where notification_id=n and channel='email'),'tier2 email planned';
 delete from notification_preferences where app_user_id=u;
 assert public.email_notification_delivery_is_eligible(n,c,t), 'no preferences actual default on';
end $$;
rollback;
