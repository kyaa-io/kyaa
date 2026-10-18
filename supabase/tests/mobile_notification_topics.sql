begin;
do $$ declare u uuid:='92200000-0000-4000-8000-000000000001'; s jsonb; begin
 insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:notification-topics','notification-topics@example.invalid');
 s:=public.mobile_get_owned_settings(u);
 if s->'previews' is distinct from '[]'::jsonb or s#>>'{topics,social}' is distinct from 'true' or s#>>'{topics,friendActivity}' is distinct from 'true' then raise exception 'new topic defaults invalid'; end if;
 s:=public.mobile_patch_owned_settings(u,1,'{"topics":{"favoriteNews":false,"social":false,"activity":false,"friendActivity":false}}');
 if public.mobile_notification_topic_enabled(u,'official_post') or public.mobile_notification_topic_enabled(u,'fan_friend_request') or public.mobile_notification_topic_enabled(u,'fan_dm_request') or public.mobile_notification_topic_enabled(u,'fan_dm_message') or public.mobile_notification_topic_enabled(u,'friend_post') or public.mobile_notification_topic_enabled(u,'friend_reaction') or public.mobile_notification_topic_enabled(u,'benefit_won') or public.mobile_notification_topic_enabled(u,'survey_reminder') then raise exception 'disabled topics still enabled'; end if;
 if not public.mobile_notification_topic_enabled(u,'content_reply') then raise exception 'favorite news switch changed replies'; end if;
 s:=public.mobile_patch_owned_settings(u,2,'{"topics":{"community":false,"social":true,"friendActivity":true}}');
 if public.mobile_notification_topic_enabled(u,'content_reply') or not public.mobile_notification_topic_enabled(u,'fan_friend_request') or not public.mobile_notification_topic_enabled(u,'friend_reaction') then raise exception 'legacy community changed distinct new topics'; end if;
 begin perform public.mobile_patch_owned_settings(u,2,'{"topics":{"social":true}}'); raise exception 'stale revision accepted'; exception when serialization_failure then null; end;
 begin perform public.mobile_patch_owned_settings(u,3,'{"topics":{"social":"false"}}'); raise exception 'string topic accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.mobile_patch_owned_settings(u,3,'{"topics":{"unknown":true}}'); raise exception 'unknown topic accepted'; exception when invalid_parameter_value then null; end;
 if has_function_privilege('anon','public.mobile_get_owned_settings(uuid)','EXECUTE') or has_function_privilege('service_role','public.mobile_get_owned_settings_before_topics(uuid)','EXECUTE') then raise exception 'settings helper exposed'; end if;
end $$;
rollback;
