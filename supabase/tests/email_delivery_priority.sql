-- Disposable fixture only; no provider calls or real recipients.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'local only'; end if; end $$;
begin;
do $$
declare
  owner_id uuid:=alert_safety_test.owner('en'); owners uuid[]:='{}'; o uuid; n uuid; required_id uuid; awaited_id uuid; i integer;
  claimed uuid[]; claim_now timestamptz;
begin
  perform alert_safety_test.assert(public.external_notification_email_priority('benefit_won')=1,'win is required');
  perform alert_safety_test.assert(public.external_notification_email_priority('support_reply')=1,'support reply is required');
  perform alert_safety_test.assert(public.external_notification_email_priority('live_10m')=2,'live 10m is awaited');
  perform alert_safety_test.assert(public.external_notification_email_priority('fanpage_request_reviewed')=2,'review result is awaited');
  perform alert_safety_test.assert(public.external_notification_email_priority('official_post')=3,'official post is activity');
  perform alert_safety_test.assert(public.external_notification_email_priority('level_up')=3,'level up is activity');

  perform public.configure_fan_notification_delivery('email','enabled');
  update public.fan_notification_delivery_control set activated_at=now()-interval '2 days',
    allowed_kinds=array['live_10m','live_reserved'] where channel='email';
  -- Only this fixture's rows are due.
  update public.external_notification_delivery_outbox set available_at='infinity'
    where channel='email' and status in('pending','failed','processing');

  -- Live reminders are one per member and live, so the backlog spans 40 members.
  for i in 1..40 loop
    o:=alert_safety_test.owner('en'); owners:=owners||o;
    n:=alert_safety_test.notification(o,'live_10m');
    perform alert_safety_test.assert((select priority from public.external_notification_delivery_outbox where notification_id=n and channel='email')=2,'plan stamps tier from kind');
  end loop;
  -- No activity kind can reach email yet, so a backlog of 40 earlier activity rows is simulated on eligible rows.
  update public.external_notification_delivery_outbox d set priority=3,available_at=now()-interval '1 hour'
    from public.fan_notifications f where f.id=d.notification_id and f.app_user_id=any(owners) and d.channel='email';
  begin
    update public.external_notification_delivery_outbox set priority=4 where notification_id=n;
    raise exception 'invalid tier accepted';
  exception when check_violation then null; end;

  -- A reserved-live notice is stamped tier 1 (it is not sendable here: the fixture has no reservation).
  n:=alert_safety_test.notification(owner_id,'live_reserved');
  perform alert_safety_test.assert((select priority from public.external_notification_delivery_outbox where notification_id=n and channel='email')=1,'required row stamped tier 1');
  -- Later arrivals: a sendable row standing in for a required kind, and a genuine tier-2 reminder.
  o:=alert_safety_test.owner('en');
  required_id:=alert_safety_test.notification(o,'live_10m');
  update public.external_notification_delivery_outbox set priority=1 where notification_id=required_id and channel='email';
  awaited_id:=alert_safety_test.notification(alert_safety_test.owner('ko'),'live_10m');
  perform alert_safety_test.assert((select priority from public.external_notification_delivery_outbox where notification_id=awaited_id and channel='email')=2,'awaited row stamped tier 2');

  claim_now:=clock_timestamp()+interval '1 second';
  select array_agg(q.notification_id) into claimed from public.claim_email_notification_deliveries_safely('priority-test',40,120,claim_now) q;
  perform alert_safety_test.assert(cardinality(claimed)=40,'one full batch claimed: '||coalesce(cardinality(claimed),0));
  perform alert_safety_test.assert(claimed[1]=required_id,'later required row leads the batch: '||coalesce(array_position(claimed,required_id)::text,'none'));
  perform alert_safety_test.assert(claimed[2]=awaited_id,'later awaited row comes next: '||coalesce(array_position(claimed,awaited_id)::text,'none'));
  perform alert_safety_test.assert((select count(*) from public.external_notification_delivery_outbox d join public.fan_notifications f on f.id=d.notification_id
    where f.app_user_id=any(owners) and d.channel='email' and d.status='pending' and d.priority=3)=2,'two activity rows wait for the next batch');
end $$;
rollback;
select 'Email delivery priority PASS' as result;
