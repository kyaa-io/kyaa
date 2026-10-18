\ir mobile_social_notifications.sql
\ir mobile_notification_topics.sql
begin;
do $$
declare a uuid:='92400000-0000-4000-8000-000000000001'; b uuid:='92400000-0000-4000-8000-000000000002';
 creator uuid:='92400000-0000-4000-8000-000000000010'; notice uuid:='92400000-0000-4000-8000-000000000011'; request uuid:='92400000-0000-4000-8000-000000000012';
 news uuid:='92400000-0000-4000-8000-000000000021'; info uuid:='92400000-0000-4000-8000-000000000022'; post uuid; reply uuid; first_page jsonb; next_page jsonb; item jsonb; result jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values(a,'did:privy:inbox-a','inbox-a@example.test'),(b,'did:privy:inbox-b','inbox-b@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(creator,'inbox-creator','published','/inbox.jpg',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','인박스','설명','인박스'),(creator,'en','Inbox','Summary','Inbox');
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at) values(notice,creator,'inbox-news','published',now(),now());
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values(notice,'ko','private source title','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"do not project source body"}]}]}');
 result:=public.save_fan_post(a,'inbox-creator',null,'private source body','public','{}',null,extensions.gen_random_uuid()); post:=(result->>'id')::uuid;
 result:=public.post_fan_post_comment(b,post,null,'private comment body',extensions.gen_random_uuid()); reply:=(result->>'id')::uuid;
 perform public.fan_web_drain_notification_intents(a);
 insert into public.fanpage_requests(id,app_user_id,name,official_social_url,official_social_key,note,locale,status,review_reason,reviewed_at,idempotency_key,request_hash)
 values(request,a,'private requested name','https://www.instagram.com/inbox_test/',public.fan_web_social_profile_key('https://www.instagram.com/inbox_test/'),'private request note','ko','rejected','private review reason',now(),extensions.gen_random_uuid(),repeat('a',64));
 insert into public.fan_notifications(id,app_user_id,kind,source_key,scheduled_for,created_at,deep_link,payload,web_only) values
 (news,a,'official_post','web:inbox:news',now()-interval '1 second',now()-interval '1 minute','/my',jsonb_build_object('targetId',notice,'targetType','notice','revision',1),true),
 (info,a,'fanpage_request_reviewed','web:inbox:info',now()-interval '1 second',now()-interval '2 minutes','/my',jsonb_build_object('targetId',request,'targetType','fanpage_request','revision',1),true),
 ('92400000-0000-4000-8000-000000000023',a,'official_post','web:inbox:missing',now()-interval '1 second',now(),'/my','{"targetId":"92400000-0000-4000-8000-000000000099","targetType":"notice","revision":1}',true);
 insert into public.fan_notifications(app_user_id,kind,source_key,celebrity_id,scheduled_for,created_at,deep_link,source_event_id,target_type,target_id,payload) values
 (a,'level_up','inbox:level:1',creator,now()-interval '1 second',now()-interval '3 minutes','/my',extensions.gen_random_uuid(),'celebrity',creator,jsonb_build_object('schemaVersion',1,'celebrityId',creator)),
 (a,'level_up','inbox:level:2',creator,now()-interval '1 second',now()-interval '4 minutes','/my',extensions.gen_random_uuid(),'celebrity',creator,jsonb_build_object('schemaVersion',1,'celebrityId',creator));
 update public.fan_notifications set scheduled_for=now()-interval '1 second' where app_user_id=a;
 first_page:=public.mobile_get_owned_notifications(a,'ko',null,2);
 if jsonb_array_length(first_page->'items') is distinct from 2 or first_page->'unreadByGroup' is distinct from '{"activity":3,"relationships":1,"info":1}'::jsonb then raise exception 'source group counts invalid: %',first_page; end if;
 next_page:=public.mobile_get_owned_notifications(a,'ko',null,2,(first_page#>>'{nextCursor,createdAt}')::timestamptz,(first_page#>>'{nextCursor,id}')::uuid);
 if next_page->'unreadByGroup' is distinct from first_page->'unreadByGroup' or next_page->'unreadByCategory' is distinct from first_page->'unreadByCategory' then raise exception 'cursor changed global unread counts'; end if;
 if exists(select 1 from jsonb_array_elements(next_page->'items') n join jsonb_array_elements(first_page->'items') f on n->>'id'=f->>'id') then raise exception 'pagination repeated an item'; end if;
 result:=public.mobile_get_owned_notifications(a,'en','activity',100);
 if jsonb_array_length(result->'items') is distinct from 3 or result->'unreadByGroup' is distinct from first_page->'unreadByGroup' then raise exception 'group filter corrupted global counts'; end if;
 if jsonb_array_length(public.mobile_get_owned_notifications(a,'ko','community',100)->'items') is distinct from 2 then raise exception 'legacy category changed'; end if;
 item:=public.mobile_get_owned_notification(a,news,'en');
 if item->>'subject' is distinct from 'Inbox' or item->>'imageUrl' is distinct from '/inbox.jpg' or item->>'group' is distinct from 'activity' or item::text like '%private%' or item::text like '%source body%' then raise exception 'safe news presentation invalid: %',item; end if;
 if public.mobile_get_owned_notification(b,news,'ko') is not null then raise exception 'foreign inbox item visible'; end if;
 perform public.mark_owned_web_notifications_read(a,news);
 result:=public.mobile_get_owned_notifications(a,'ko',null,100);
 if result->'unreadByGroup' is distinct from '{"activity":2,"relationships":1,"info":1}'::jsonb then raise exception 'read-one affected other groups: %',result; end if;
 update public.celebrity_notices set publication_status='draft',published_at=null where id=notice;
 if public.mobile_get_owned_notification(a,news,'ko') is not null then raise exception 'unpublished source metadata remained visible'; end if;
 perform public.mark_owned_web_notifications_read(a,null);
 if public.mobile_get_owned_notifications(a,'ko',null,100)->'unreadByGroup' is distinct from '{}'::jsonb then raise exception 'read-all left group unread counts'; end if;
 if public.mobile_notification_inbox_group('fan_dm_message') is distinct from 'relationships' or public.mobile_notification_inbox_group('fanpage_request_reviewed') is distinct from 'info' then raise exception 'group classifier invalid'; end if;
 if has_function_privilege('service_role','public.mobile_notification_inbox_item(uuid,uuid,public.content_locale)','EXECUTE') or has_function_privilege('anon','public.mobile_get_owned_notifications(uuid,public.content_locale,text,integer,timestamptz,uuid)','EXECUTE') then raise exception 'private inbox helper exposed'; end if;
 update public.app_users set status='disabled' where id=a;
 if public.mobile_get_owned_notification(a,info,'ko') is not null then raise exception 'disabled owner retained item'; end if;
end $$;
rollback;
