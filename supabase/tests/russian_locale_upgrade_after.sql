\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Russian locale upgrade tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$
declare owner uuid:='8e260000-0000-4000-8000-000000000003'; source jsonb; installation jsonb;
begin
  if (select preferred_locale from public.app_users where id='8e260000-0000-4000-8000-000000000001')<>'ko'
    or (select preferred_locale from public.app_users where id='8e260000-0000-4000-8000-000000000002')<>'en' then raise exception 'existing locale changed'; end if;
  if public.initialize_owned_preferred_locale(owner,'ru')<>'ru' or public.set_owned_preferred_locale(owner,'ru')<>'ru' then raise exception 'Russian preference failed'; end if;
  if public.initialize_owned_preferred_locale('8e260000-0000-4000-8000-000000000001','ru')<>'ko' then raise exception 'initialization replaced existing preference'; end if;
  if public.read_content_translation(owner,'fan_post','8e260000-0000-4000-8000-000000000005','fr','en')->>'translatedText'<>'Bonjour des fans' then raise exception 'existing translation changed'; end if;
  source:=public.fan_web_content_target(owner,'fan_post','8e260000-0000-4000-8000-000000000005','en');
  perform public.save_content_translation(owner,'fan_post','8e260000-0000-4000-8000-000000000005','ru','en',1,source->>'sourceHash','Привет от фанатов','en');
  if public.read_content_translation(owner,'fan_post','8e260000-0000-4000-8000-000000000005','ru','en')->>'translatedText'<>'Привет от фанатов' then raise exception 'Russian translation cache failed'; end if;
  perform public.mobile_patch_owned_settings(owner,1,'{"preferredLocale":"ru"}');
  installation:=public.mobile_register_owned_installation(owner,'8e260000-0000-4000-8000-000000000006','ios',null,'denied','1.0','ru',0,extensions.gen_random_uuid());
  if not exists(select 1 from public.mobile_installations where installation_id='8e260000-0000-4000-8000-000000000006' and locale='ru') then raise exception 'Russian installation failed'; end if;
  if (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid='public.content_locale'::regtype)<>array['ko','en'] then raise exception 'source locale enum changed'; end if;
  begin perform public.set_owned_preferred_locale(owner,'de');raise exception 'unsupported locale accepted';exception when sqlstate '22023' then null;end;
  if has_function_privilege('anon','public.set_owned_preferred_locale(uuid,text)','execute') or not has_function_privilege('service_role','public.set_owned_preferred_locale(uuid,text)','execute') then raise exception 'preference ACL changed'; end if;
end $$;
rollback;
