-- Run with psql -v ON_ERROR_STOP=1 against a disposable clean-replay database.
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Mobile preferred locale tests require disposable local byus_clean';
  end if;
end $$;
begin;

do $$
declare
  locales constant text[]:=array['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr'];
  locale text;
  owner uuid;
begin
  foreach locale in array locales loop
    owner:=extensions.gen_random_uuid();
    insert into public.app_users(id,privy_user_id,verified_email)
    values(owner,'did:privy:locale-'||owner,owner||'@example.invalid');

    if public.initialize_owned_preferred_locale(owner,locale)<>locale
      or (select preferred_locale from public.app_users where id=owner)<>locale then
      raise exception 'preferred locale initialization failed: %',locale;
    end if;
    if public.set_owned_preferred_locale(owner,locale)<>locale
      or (select preferred_locale from public.app_users where id=owner)<>locale then
      raise exception 'preferred locale update failed: %',locale;
    end if;
  end loop;
end $$;

do $$
declare owner uuid:=extensions.gen_random_uuid();
begin
  insert into public.app_users(id,privy_user_id,verified_email)
  values(owner,'did:privy:locale-invalid-'||owner,owner||'@example.invalid');
  begin
    perform public.initialize_owned_preferred_locale(owner,'de');
    raise exception 'invalid initialization accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'PREFERRED_LOCALE_INVALID' then raise; end if;
  end;
  begin
    perform public.set_owned_preferred_locale(owner,'de');
    raise exception 'invalid update accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'PREFERRED_LOCALE_INVALID' then raise; end if;
  end;
end $$;

do $$
declare
  korean_owner constant uuid:='94000000-0000-4000-8000-000000000001';
  english_owner constant uuid:='94000000-0000-4000-8000-000000000002';
  french_owner constant uuid:='94000000-0000-4000-8000-000000000003';
  celebrity constant uuid:='94000000-0000-4000-8000-000000000004';
  korean_notification uuid;
  english_notification uuid;
  french_notification uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email,preferred_locale) values
    (korean_owner,'did:privy:locale-ko','locale-ko@example.invalid','ko'),
    (english_owner,'did:privy:locale-en','locale-en@example.invalid','en'),
    (french_owner,'did:privy:locale-fr','locale-fr@example.invalid','fr');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
  values(celebrity,'mobile-locale-test','draft','/test.webp','{creator}','creator');

  perform public.sync_owned_google_notification_channel(
    korean_owner,'did:privy:locale-ko','locale-ko@example.invalid',true
  );
  perform public.sync_owned_google_notification_channel(
    english_owner,'did:privy:locale-en','locale-en@example.invalid',true
  );
  perform public.sync_owned_google_notification_channel(
    french_owner,'did:privy:locale-fr','locale-fr@example.invalid',true
  );

  insert into public.fan_notifications(
    app_user_id,kind,source_key,celebrity_id,source_event_id,scheduled_for,target_type,target_id,deep_link,payload
  ) values(
    korean_owner,'level_up','mobile-locale-ko',celebrity,extensions.gen_random_uuid(),now(),'celebrity',celebrity,'/passports',
    jsonb_build_object('schemaVersion',2,'celebrityId',celebrity)
  ) returning id into korean_notification;
  insert into public.fan_notifications(
    app_user_id,kind,source_key,celebrity_id,source_event_id,scheduled_for,target_type,target_id,deep_link,payload
  ) values(
    english_owner,'level_up','mobile-locale-en',celebrity,extensions.gen_random_uuid(),now(),'celebrity',celebrity,'/passports',
    jsonb_build_object('schemaVersion',2,'celebrityId',celebrity)
  ) returning id into english_notification;
  insert into public.fan_notifications(
    app_user_id,kind,source_key,celebrity_id,source_event_id,scheduled_for,target_type,target_id,deep_link,payload
  ) values(
    french_owner,'level_up','mobile-locale-fr',celebrity,extensions.gen_random_uuid(),now(),'celebrity',celebrity,'/passports',
    jsonb_build_object('schemaVersion',2,'celebrityId',celebrity)
  ) returning id into french_notification;

  if (select email_locale from public.notification_delivery_plans where notification_id=korean_notification) is distinct from 'ko'
    or (select locale from public.external_notification_delivery_outbox where notification_id=korean_notification) is distinct from 'ko' then
    raise exception 'Korean delivery locale changed';
  end if;
  if (select email_locale from public.notification_delivery_plans where notification_id=english_notification) is distinct from 'en'
    or (select locale from public.external_notification_delivery_outbox where notification_id=english_notification) is distinct from 'en' then
    raise exception 'English delivery locale changed';
  end if;
  if (select email_locale from public.notification_delivery_plans where notification_id=french_notification) is distinct from 'en'
    or (select locale from public.external_notification_delivery_outbox where notification_id=french_notification) is distinct from 'en' then
    raise exception 'non-Korean delivery locale was not mapped to English';
  end if;
end $$;

rollback;
select 'Mobile preferred locales and KO/EN delivery compatibility PASS' as result;
