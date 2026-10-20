-- Disposable latest-chain database only; all fixtures roll back.
begin;
create function pg_temp.expect_error(q text,marker text)returns void language plpgsql as $$begin execute q;raise exception 'expected error %',marker;exception when others then if sqlerrm='expected error '||marker or position(marker in sqlerrm)=0 then raise;end if;end$$;
create function pg_temp.refuse_moderation_audit()returns trigger language plpgsql as $$begin if new.correlation_id='10000000-0000-4000-8000-000000001234'then raise exception 'AUDIT_REJECTED';end if;return new;end$$;
create trigger ugc_test_audit before insert on public.audit_logs for each row execute function pg_temp.refuse_moderation_audit();
do $$declare a uuid:=extensions.gen_random_uuid();b uuid:=extensions.gen_random_uuid();c uuid:=extensions.gen_random_uuid();creator uuid:=extensions.gen_random_uuid();admin uuid:=extensions.gen_random_uuid();operator uuid:=extensions.gen_random_uuid();post uuid;post2 uuid;block uuid;report uuid;conversation uuid;message uuid;result jsonb;t text;f text;before_count integer;asset uuid;collision_key uuid;
begin
 if not public.ugc_body_rejected(U&'\FF26\FF35\FF23\FF2B')or not public.ugc_body_rejected(U&'f\200Bu\200Cc\200Dk')or not public.ugc_body_rejected('씨발')or public.ugc_body_rejected('Shiitake official KARA administrator')or public.ugc_body_rejected('sh it')then raise exception 'Unicode/word boundary/allowed catalog failed';end if;
 foreach t in array array['fan_posts','fan_post_comments','fan_clips','fan_clip_comments','celebrity_notice_comments','fan_lounge_messages','live_fan_submissions','mobile_participation_posts','mobile_participation_comments','social_dm_messages']loop
 if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname='ugc_body_filter')then raise exception 'missing production trigger %',t;end if;
 execute format('create temp table %I(body text,song jsonb)',t);
 execute format('create trigger check_filter before insert or update on pg_temp.%I for each row execute function public.guard_ugc_body()',t);
 perform pg_temp.expect_error(format('insert into pg_temp.%I(body)values(''fuck'')',t),'CONTENT_REJECTED');
 execute format('insert into pg_temp.%I(body)values(''hello official'')',t);
 execute format('update pg_temp.%I set body=body',t);
 end loop;
 foreach f in array array['title','artist','album']loop perform pg_temp.expect_error(format('insert into pg_temp.live_fan_submissions(body,song)values(''safe'',jsonb_build_object(%L,''fuck''))',f),'CONTENT_REJECTED');end loop;
 insert into public.app_users(id,privy_user_id,verified_email)values(a,'did:privy:moderation-admin','moderation-admin@example.invalid'),(b,'did:privy:moderation-author','moderation-author@example.invalid'),(c,'did:privy:moderation-viewer','moderation-viewer@example.invalid');
 foreach t in array array['fan_posts','fan_post_comments','fan_clips','fan_clip_comments','celebrity_notice_comments','fan_lounge_messages','live_fan_submissions','mobile_participation_posts','mobile_participation_comments','social_dm_messages']loop
 perform pg_temp.expect_error(format('insert into public.%I(body,%I)values(''fuck'',%L)',t,case when t='social_dm_messages'then 'sender_id'else 'app_user_id'end,b),'CONTENT_REJECTED');
 end loop;
 insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(b,'ModerationAuthor','moderationauthor');
 insert into public.admin_allowlist(id,email,role)values(admin,'moderation-admin@example.invalid','admin'),(operator,'moderation-viewer@example.invalid','operator');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'moderation-qa','published','/qa.webp',now(),'{creator}','creator');
 post:=(public.save_fan_post(b,'moderation-qa',null,'safe body','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 post2:=(public.save_fan_post(b,'moderation-qa',null,'second body','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 perform pg_temp.expect_error(format('select public.save_fan_post(%L,''moderation-qa'',null,''fuck'',''public'',''{}'',null,%L)',b,extensions.gen_random_uuid()),'CONTENT_REJECTED');
 block:=(public.block_content_author(a,'fan_post',post)->>'id')::uuid;
 perform public.block_content_author(a,'fan_post',post);
 if(select count(*)from public.content_reports where target_type='user_block'and target_id=block)<>1 or public.read_fan_post(a,post)is not null or public.read_fan_post(c,post)is null then raise exception 'block queue/idempotency/personal hiding failed';end if;
 result:=public.read_admin_content_reports(a,admin);
 if not exists(select 1 from jsonb_array_elements(result->'items')r where r->>'targetId'=block::text and r#>>'{target,body}'='safe body'and r#>>'{target,authorUserId}'=b::text and r#>>'{target,authorNickname}'='ModerationAuthor'and r#>>'{target,celebritySlug}'='moderation-qa')then raise exception 'block author/context review information missing';end if;
 if not exists(select 1 from public.content_reports where target_id=block and context_target_id=post)then raise exception 'block context missing';end if;
 perform public.remove_content_block(a,block);
 perform public.block_content_author(a,'fan_post',post);
 if(select count(*)from public.content_reports where target_type='user_block'and app_user_id=a)<>2 then raise exception 'reblock queue missing';end if;
 perform public.remove_content_block(a,(select id from public.user_blocks where app_user_id=a and blocked_app_user_id=b));
 report:=(public.post_content_report(a,'fan_post',post,'harassment',extensions.gen_random_uuid())->>'id')::uuid;
 perform pg_temp.expect_error(format('select public.resolve_admin_content_report(%L,%L,%L,%L,''resolved'',true,''confirmed abusive content'',true)',c,operator,extensions.gen_random_uuid(),report),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_error(format('select public.resolve_admin_content_report(%L,%L,''10000000-0000-4000-8000-000000001234'',%L,''resolved'',true,''confirmed abusive content'',true)',a,admin,report),'AUDIT_REJECTED');
 if exists(select 1 from public.app_user_moderation_restrictions where app_user_id=b)or(select status from public.content_reports where id=report)<>'open'or(select hidden_at is not null from public.fan_posts where id=post)then raise exception 'audit failure did not roll back atomically';end if;
 perform public.resolve_admin_content_report(a,admin,extensions.gen_random_uuid(),report,'resolved',true,'confirmed abusive content',true);
 perform public.resolve_admin_content_report(a,admin,extensions.gen_random_uuid(),report,'resolved',true,'confirmed abusive content',true);
 if(select status from public.app_users where id=b)<>'active' or not exists(select 1 from public.fan_posts where id=post2 and deleted_at is null)then raise exception 'restriction destroyed account/content';end if;
 perform pg_temp.expect_error(format('select public.fan_web_lock_active_user(%L)',b),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform pg_temp.expect_error(format('select public.save_fan_post(%L,''moderation-qa'',null,''safe'',''public'',''{}'',null,%L)',b,extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 report:=(public.post_content_report(a,'fan_post',post2,'harassment',extensions.gen_random_uuid())->>'id')::uuid;
 perform public.resolve_admin_content_report(a,admin,extensions.gen_random_uuid(),report,'resolved',true,'confirmed second violation',false);
 if(select hidden_at is null from public.fan_posts where id=post2)then raise exception 'restricted author admin hide failed';end if;
 -- DM queue and global hide are independent of friendship/request UI state.
 insert into public.social_dm_conversations(id,user_low_id,user_high_id,requester_id,status,request_id,payload_hash)values(extensions.gen_random_uuid(),least(a,c),greatest(a,c),a,'accepted',extensions.gen_random_uuid(),md5('moderation'))returning id into conversation;
 insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash)values(conversation,c,'DM proof',extensions.gen_random_uuid(),md5('DM proof'))returning id into message;
 insert into public.mobile_media_assets(app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,request_id,request_hash,width,height,attached_type,attached_id,access_scope)
 values(c,'image','dm','image/webp',64,64,'moderation/original','moderation/thumbnail','ready',extensions.gen_random_uuid(),'test',2,2,'dm_message',message,'dm')returning id into asset;
 if public.authorize_mobile_media_read(a,asset,'original')is null then raise exception 'DM attachment fixture inaccessible';end if;
 select idempotency_key into collision_key from public.content_reports where app_user_id=a and target_type='fan_post'limit 1;
 insert into public.social_dm_message_reports(message_id,reporter_id,reason,request_id)values(message,a,'harassment',collision_key)returning id into report;
 if not exists(select 1 from public.content_reports where id=report and target_type='dm_message'and celebrity_id is null and target_app_user_id=c)then raise exception 'DM report not mirrored';end if;
 result:=public.read_admin_content_reports(a,admin);
 if not exists(select 1 from jsonb_array_elements(result->'items')r where r->>'id'=report::text and r#>>'{target,body}'='DM proof')then raise exception 'DM report absent from queue';end if;
 perform public.resolve_admin_content_report(a,admin,extensions.gen_random_uuid(),report,'resolved',true,'confirmed abusive message',false);
 if public.authorize_mobile_media_read(a,asset,'original')is not null then raise exception 'hidden DM media still accessible';end if;
 if jsonb_array_length(public.read_social_dm_messages(a,conversation,null,null,50)->'messages')<>0 then raise exception 'hidden DM still readable';end if;
 update public.content_reports set created_at=now()-interval'25 hours'where target_id=block;
 if (public.read_admin_content_report_summary(a,admin)->>'overdueCount')::int<1 then raise exception 'overdue queue missing';end if;
 if public.read_admin_content_report_summary(a,admin)->>'openCount' is null then raise exception 'summary missing';end if;
 if has_table_privilege('authenticated','public.app_user_moderation_restrictions','select')or has_function_privilege('authenticated','public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean)','execute')then raise exception 'moderation ACL leaked';end if;
 -- Restricted users retain the authenticated self-deletion path.
 perform public.begin_owned_account_deletion('did:privy:moderation-author');
 if not exists(select 1 from public.account_deletion_requests where app_user_id=b)then raise exception 'restricted self deletion unavailable';end if;
end$$;
rollback;
