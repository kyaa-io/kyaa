do $$
declare
  u uuid := extensions.gen_random_uuid();
  input jsonb := '{"orderNo":"C-20270113-0001","amountKrw":2000,"extra":"럭키드로우"}';
  k text;

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
    values(u,'email','eligible',public.email_destination_fingerprint(u||'@example.invalid'),'test',now());
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  assert (select count(*) from public.chemi_mail_outbox where user_id=u) = 1;
  perform public.chemi_reminder_set(u,'tomorrow','tarot',false);
  assert (select status from public.chemi_mail_outbox where user_id=u) = 'cancelled';
  perform public.chemi_reminder_set(u,'tomorrow','tarot',true);
  assert (select status from public.chemi_mail_outbox where user_id=u) = 'pending';
  assert public.chemi_mail_claim() is null;
end $$;

-- The integration test drains these fixtures through the production sender
-- with its SES client replaced by an in-process inbox.
do $$
declare
  u uuid;
  marketing boolean;
  input jsonb := '{"orderNo":"C-20270113-0001","amountKrw":2000}';
begin
  foreach marketing in array array[false, true] loop
    u := extensions.gen_random_uuid();
    insert into public.app_users(id,privy_user_id,verified_email)
      values(u,'did:privy:'||u,marketing||'@example.invalid');
    insert into public.fan_notification_channels(app_user_id,kind,status,destination_fingerprint,destination_label,verified_at)
      values(u,'email','eligible',public.email_destination_fingerprint(marketing||'@example.invalid'),'test',now());
    insert into public.notification_preferences(app_user_id,marketing_notifications) values(u,marketing);
    perform public.chemi_mail_enqueue(u,'friend','friend','test-friend:'||u,'{}',now());
    perform public.chemi_mail_enqueue(u,'remind','requested','test-remind:'||u,'{}',now());
    perform public.chemi_mail_enqueue(u,'receipt','transactional','test-receipt:'||u,input,now());
    perform public.chemi_mail_enqueue(u,'refund','transactional','test-refund:'||u,input,now());
    perform public.chemi_mail_enqueue(u,'lucky_draw','marketing_ok','test-lucky:'||u,'{}',now());
  end loop;
end $$;
