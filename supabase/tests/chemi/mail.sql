do $$
declare
  u uuid := extensions.gen_random_uuid();
  input jsonb := '{"orderNo":"C-20270113-0001","amountKrw":2000,"extra":"럭키드로우"}';
  k text;
  sent integer;
begin
  foreach k in array array['receipt','refund'] loop
    assert public.chemi_mail_render(k,'transactional',input,true) like '%736-86-03473%';
    assert public.chemi_mail_render(k,'transactional',input,true) not like '%럭키드로우%';
  end loop;
  assert public.chemi_mail_render('friend','friend','{}',false) not like '%럭키드로우%';
  assert public.chemi_mail_render('remind','requested','{}',true) like '%럭키드로우%';
  assert public.chemi_mail_render('lucky_draw','marketing_ok','{}',false) is null;

  insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:'||u,u||'@example.invalid');
  begin
    perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
    raise exception 'unverified accepted';
  exception when raise_exception then
    if sqlerrm <> 'CHEMI_MAIL_UNVERIFIED' then raise; end if;
  end;
  insert into public.fan_notification_channels(app_user_id,kind,status,destination_fingerprint,destination_label,verified_at)
    values(u,'email','eligible',repeat('a',64),'test',now());
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  assert (select count(*) from public.chemi_mail_outbox where user_id=u) = 1;
  perform public.chemi_reminder_set(u,'tomorrow','tarot',false);
  assert (select status from public.chemi_mail_outbox where user_id=u) = 'cancelled';
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  assert (select status from public.chemi_mail_outbox where user_id=u) = 'pending';
  assert public.chemi_mail_drain_test('dev') = 0;
  perform public.chemi_mail_enqueue(u,'receipt','transactional','test-receipt:'||u,input,now());
  perform public.chemi_mail_enqueue(u,'refund','transactional','test-refund:'||u,input,now());
  perform public.chemi_mail_enqueue(u,'friend','friend','test-friend:'||u,'{}',now());
  begin
    perform public.chemi_mail_drain_test('prod');
    raise exception 'production accepted';
  exception when raise_exception then
    if sqlerrm <> 'CHEMI_MAIL_TEST_DEV_ONLY' then raise; end if;
  end;
  sent := public.chemi_mail_drain_test('dev');
  assert sent = 3;
  assert (select count(*) from public.chemi_mail_test_sink) = 3;
  assert public.chemi_mail_drain_test('dev') = 0;
end $$;
