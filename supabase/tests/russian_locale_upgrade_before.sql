\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Russian locale upgrade tests require disposable local byus_clean'; end if;
end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email,preferred_locale) values
  ('8e260000-0000-4000-8000-000000000001','did:privy:ru-upgrade-ko','ru-upgrade-ko@example.invalid','ko'),
  ('8e260000-0000-4000-8000-000000000002','did:privy:ru-upgrade-en','ru-upgrade-en@example.invalid','en'),
  ('8e260000-0000-4000-8000-000000000003','did:privy:ru-upgrade-new','ru-upgrade-new@example.invalid',null);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('8e260000-0000-4000-8000-000000000004','russian-upgrade','published','/images/creator.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('8e260000-0000-4000-8000-000000000004','ko','러시아어 검증','소개','사진'),
  ('8e260000-0000-4000-8000-000000000004','en','Russian QA','Summary','Photo');
insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)
values('8e260000-0000-4000-8000-000000000005','8e260000-0000-4000-8000-000000000004','8e260000-0000-4000-8000-000000000001','Hello from fans','public',extensions.gen_random_uuid(),'ru-upgrade-fixture');
do $$ declare source jsonb; begin
  source:=public.fan_web_content_target('8e260000-0000-4000-8000-000000000001','fan_post','8e260000-0000-4000-8000-000000000005','en');
  perform public.save_content_translation('8e260000-0000-4000-8000-000000000001','fan_post','8e260000-0000-4000-8000-000000000005','fr','en',1,source->>'sourceHash','Bonjour des fans','en');
end $$;

commit;
