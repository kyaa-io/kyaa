begin;
insert into public.app_users(id,privy_user_id,verified_email) values
 ('5c100000-0000-4000-8000-000000000001','did:privy:mobile-settings','mobile-settings@example.test'),
 ('5c100000-0000-4000-8000-000000000020','did:privy:mobile-settings-2','mobile-settings-2@example.test');
insert into public.admin_allowlist(id,email,role,active)values('5c100000-0000-4000-8000-000000000030','mobile-settings@example.test','admin',true);
do $$ declare settings jsonb; registered jsonb; unlinked jsonb; transferred jsonb; recovered jsonb; response_lost jsonb; patched jsonb; inquiry jsonb; detail jsonb; fanpage jsonb; notification_id uuid; notification_detail jsonb; store_policy jsonb;replacement_policy jsonb;reward_version integer;asset uuid:='5c100000-0000-4000-8000-000000000010'; begin
 select public.mobile_get_owned_settings('5c100000-0000-4000-8000-000000000001') into settings;
 if settings->>'preferredLocale'<>'ko' or (settings->>'revision')::integer<>1 then raise exception 'default settings invalid: %',settings; end if;
 select public.mobile_patch_owned_settings('5c100000-0000-4000-8000-000000000001',1,'{"preferredLocale":"fr","regionCode":"FR","qrVisible":false,"topics":{"benefit":false}}') into patched;
 if patched->>'preferredLocale'<>'fr' or patched->>'regionCode'<>'FR' or (patched->>'qrVisible')::boolean or (patched#>>'{topics,benefit}')::boolean or (patched->>'revision')::integer<>2 then raise exception 'settings patch invalid: %',patched; end if;
 select public.mobile_patch_owned_settings('5c100000-0000-4000-8000-000000000001',2,'{"regionCode":null}') into patched;
 if patched->'regionCode'<>'null'::jsonb or (patched->>'revision')::integer<>3 then raise exception 'optional region clear invalid: %',patched; end if;
 begin perform public.mobile_patch_owned_settings('5c100000-0000-4000-8000-000000000001',1,'{}'); raise exception 'stale revision accepted'; exception when serialization_failure then null; end;
 select public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000002','ios','device-token-12345','authorized','1.0.0','fr',0,'5c100000-0000-4000-8000-000000000003') into registered;
 if registered->>'status'<>'active' or (registered->>'accountVersion')::integer<>1 then raise exception 'registration invalid: %',registered; end if;
 if registered<>public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000002','ios','device-token-12345','authorized','1.0.0','fr',0,'5c100000-0000-4000-8000-000000000003') then raise exception 'registration replay changed'; end if;
 unlinked:=public.mobile_disable_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000002',(registered->>'installationVersion')::bigint,'5c100000-0000-4000-8000-000000000004');
 if unlinked->>'status'<>'disabled'or(unlinked->>'installationVersion')::bigint<>(registered->>'installationVersion')::bigint+1 then raise exception'unlink result invalid: %',unlinked;end if;
 if public.mobile_disable_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000002',(registered->>'installationVersion')::bigint,'5c100000-0000-4000-8000-000000000004')->>'replayed'<>'true'then raise exception'unlink replay was not stable';end if;
 transferred:=public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000020','5c100000-0000-4000-8000-000000000002','android','device-token-67890','authorized','1.0.0','ko',(unlinked->>'installationVersion')::bigint,'5c100000-0000-4000-8000-000000000021');
 if (transferred->>'installationVersion')::bigint<>(unlinked->>'installationVersion')::bigint+1 then raise exception'installation ownership transfer version invalid: %',transferred;end if;
 begin perform public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000002','ios','stale-device-token','authorized','1.0.1','fr',(unlinked->>'installationVersion')::bigint,'5c100000-0000-4000-8000-000000000022');raise exception'stale registration replaced current owner';exception when serialization_failure then null;end;
 perform public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000040','ios','response-lost-token-a','authorized','1.0.0','ko',0,'5c100000-0000-4000-8000-000000000041');
 recovered:=public.mobile_get_installation_version('5c100000-0000-4000-8000-000000000020','5c100000-0000-4000-8000-000000000040');
 if recovered<>jsonb_build_object('installationId','5c100000-0000-4000-8000-000000000040'::uuid,'installationVersion',1)then raise exception'installation recovery leaked or missed state: %',recovered;end if;
 response_lost:=public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000020','5c100000-0000-4000-8000-000000000040','android','response-lost-token-b','authorized','1.0.0','ko',(recovered->>'installationVersion')::bigint,'5c100000-0000-4000-8000-000000000042');
 perform public.mobile_register_owned_installation('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000040','ios','response-lost-token-a','authorized','1.0.0','ko',0,'5c100000-0000-4000-8000-000000000041');
 if(response_lost->>'installationVersion')::bigint<>2 or not exists(select 1 from public.mobile_installations where installation_id='5c100000-0000-4000-8000-000000000040'and app_user_id='5c100000-0000-4000-8000-000000000020'and disabled_at is null)then raise exception'response-loss account switch recovery failed: %',response_lost;end if;
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash,ready_at)values(asset,'5c100000-0000-4000-8000-000000000001','image','support','image/webp',100,100,'5c100000-0000-4000-8000-000000000001/'||asset::text||'/original.webp','5c100000-0000-4000-8000-000000000001/'||asset::text||'/thumbnail.webp','ready',100,100,'5c100000-0000-4000-8000-000000000011',md5('support-asset'),clock_timestamp());
 inquiry:=public.mobile_cs_create('5c100000-0000-4000-8000-000000000001','앱 문의','이미지를 확인해 주세요.','ko','5c100000-0000-4000-8000-000000000012',null,null,array[asset]);
 detail:=public.mobile_cs_read('5c100000-0000-4000-8000-000000000001',(inquiry->>'id')::uuid,null,null,null);
 if detail#>>'{messages,0,assetIds,0}'<>asset::text or public.authorize_mobile_media_read('5c100000-0000-4000-8000-000000000001',asset,'original')is null then raise exception'support attachment was not linked/readable: %',detail;end if;
 begin perform public.mobile_cs_create('5c100000-0000-4000-8000-000000000001','앱 문의','이미지를 확인해 주세요.','ko','5c100000-0000-4000-8000-000000000012',null,null,'{}'::uuid[]);raise exception'support attachment idempotency mismatch accepted';exception when unique_violation then null;end;
 fanpage:=public.fan_web_submit_fanpage_request('5c100000-0000-4000-8000-000000000001','{"name":"Brand Test","subjectType":"brand","officialSocialUrl":"https://instagram.com/brand.test","note":"","locale":"ko","idempotencyKey":"5c100000-0000-4000-8000-000000000013"}'::jsonb);
 if fanpage#>>'{item,subjectType}'<>'brand'then raise exception'fanpage subject type missing: %',fanpage;end if;
 update public.fanpage_requests set status='rejected',review_reason='duplicate',reviewed_at=clock_timestamp(),revision=revision+1 where id=(fanpage#>>'{item,id}')::uuid;
 perform public.fan_web_drain_notification_intents('5c100000-0000-4000-8000-000000000001',100);
 select id into strict notification_id from public.fan_notifications where app_user_id='5c100000-0000-4000-8000-000000000001'and kind::text='fanpage_request_reviewed'order by created_at desc limit 1;
 update public.fan_notifications set scheduled_for=transaction_timestamp()-interval'1 second'where id=notification_id;
 notification_detail:=public.mobile_get_owned_notification('5c100000-0000-4000-8000-000000000001',notification_id,'ko');
 if notification_detail#>>'{target,deepLink}'is null or public.mobile_get_owned_notification('5c100000-0000-4000-8000-000000000020',notification_id,'ko')is not null then raise exception'notification detail ownership invalid: %',notification_detail;end if;
 delete from public.fanpage_requests where id=(fanpage#>>'{item,id}')::uuid;
 if public.mobile_get_owned_notification('5c100000-0000-4000-8000-000000000001',notification_id,'ko')is not null then raise exception'deleted notification target remained resolvable';end if;
 if public.mobile_store_admin_set_sandbox_tester('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000030','5c100000-0000-4000-8000-000000000031','5c100000-0000-4000-8000-000000000001',true,'내부 샌드박스 검증 계정을 활성화합니다.')#>>'{enabled}'<>'true'then raise exception'sandbox tester admin path failed';end if;
 select version into strict reward_version from public.reward_policy_versions order by version desc limit 1;
 store_policy:=public.mobile_store_admin_create_product_policy('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000030','5c100000-0000-4000-8000-000000000032','apple','settings.test.tickets','v1',10,1000,reward_version,clock_timestamp()-interval'1 minute',null,'샌드박스 상품 정책을 최초 등록합니다.');
 replacement_policy:=public.mobile_store_admin_create_product_policy('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000030','5c100000-0000-4000-8000-000000000033','apple','settings.test.tickets','v2',20,1200,reward_version,clock_timestamp(),(store_policy->>'id')::uuid,'샌드박스 상품 정책을 새 버전으로 교체합니다.');
 if replacement_policy->>'replacedPolicyId'<>store_policy->>'id'or replacement_policy->>'policyVersion'<>'v2'then raise exception'product policy replacement failed: %',replacement_policy;end if;
 begin perform public.mobile_store_admin_create_product_policy('5c100000-0000-4000-8000-000000000001','5c100000-0000-4000-8000-000000000030','5c100000-0000-4000-8000-000000000034','apple','settings.test.tickets','stale',30,1200,reward_version,clock_timestamp(),(store_policy->>'id')::uuid,'오래된 정책 기준 교체 요청을 거부합니다.');raise exception'stale product policy replacement accepted';exception when serialization_failure then null;end;
end $$;
update public.app_users set status='disabled' where id='5c100000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.mobile_installations where app_user_id='5c100000-0000-4000-8000-000000000001' and (disabled_at is null or push_token is not null)) then raise exception 'account disable retained token'; end if;
 if (select mobile_account_version from public.app_users where id='5c100000-0000-4000-8000-000000000001')<>2 then raise exception 'account disable version missing'; end if;
end $$;
insert into public.account_deletion_requests(app_user_id,provider_subject) values('5c100000-0000-4000-8000-000000000001','did:privy:mobile-settings');
select pg_catalog.set_config('byus.account_deletion_owner','5c100000-0000-4000-8000-000000000001',true);
select public.scrub_account_deletion('5c100000-0000-4000-8000-000000000001');
do $$ begin if exists(select 1 from public.mobile_installations where app_user_id='5c100000-0000-4000-8000-000000000001')or exists(select 1 from public.mobile_app_settings where app_user_id='5c100000-0000-4000-8000-000000000001')then raise exception'mobile deletion scrub incomplete';end if;end $$;
rollback;

\ir mobile_participation_hardening.sql
