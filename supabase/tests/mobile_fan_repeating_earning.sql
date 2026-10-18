do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;
if to_regprocedure('public.activate_mobile_fan_earning_v2(uuid,text,jsonb,jsonb)')is null then raise exception 'FAIL repeating policy activation missing';end if;
end $$;
begin;
create function pg_temp.earn_assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',message;end if;raise notice 'PASS %',message;end $$;
create function pg_temp.earn_rules()returns jsonb language sql as $$select '{"verification":100,"reaction":2,"comment":10,"checkin":100,"certification":30,"membership_instagram":50,"membership_tiktok":50,"membership_youtube":50,"share":10,"live_reservation":10,"live_attendance":50,"mission_completion":30,"first_clip":100,"journey_completion":20,"invitation_milestone":200}'::jsonb$$;
create function pg_temp.earn_caps()returns jsonb language sql as $$select jsonb_agg(jsonb_build_object('key',k,'scope',case when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip','invitation_milestone')then'lifetime'else'daily'end,'dailyLimit',case when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip','invitation_milestone')then null when k='reaction'then 5 when k='comment'then 2 else 1 end,'lifetimeLimit',case when k='invitation_milestone'then 5 when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip')then 1 else null end))from jsonb_object_keys(pg_temp.earn_rules())k$$;
do $$declare owner uuid:='ea000000-0000-4000-8000-000000000001';author uuid:='ea000000-0000-4000-8000-000000000002';creator uuid:='ea000000-0000-4000-8000-000000000010';r jsonb;sid uuid;old_source uuid;first_source uuid;target uuid;policy uuid;begin
 perform pg_temp.earn_assert((select wallet=public.read_owned_mobile_fan_economy_wallet(owner,'earning-fixture')and missions=public.read_owned_mobile_fan_economy_missions(owner,'earning-fixture')from public.repeating_earning_upgrade_snapshot),'upgrade preserves old wallet and mission JSON');
 r:=public.activate_mobile_fan_earning_v2(creator,'earning-v2',pg_temp.earn_rules(),pg_temp.earn_caps());policy:=(r->>'policyId')::uuid;
 perform pg_temp.earn_assert((select count(*)=15 from public.mobile_fan_earning_action_rules where policy_id=policy),'all15 caps installed atomically');
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='5'and x->>'status'='lifetime_limit'and x->>'usedToday'='0'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status('ea000000-0000-4000-8000-000000000005','earning-fixture')->'actions')x where x->>'key'='invitation_milestone'),'legacy ticket ordinals1to5 consume all invitation opportunities after upgrade');
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='3'and x->>'status'='available'and x->>'lifetimeLimit'='5'and x->>'usedToday'='0'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status('ea000000-0000-4000-8000-000000000003','earning-fixture')->'actions')x where x->>'key'='invitation_milestone'),'legacy ordinals1to3 leave only ordinal4and5 available on another creator');

 perform pg_temp.earn_assert(public.activate_mobile_fan_earning_v2(creator,'earning-v2',pg_temp.earn_rules(),pg_temp.earn_caps())->>'replayed'='true','same manifest activation replays');
 select reward_source_id into old_source from public.fan_post_likes where post_id='ea000000-0000-4000-8000-000000000020'and app_user_id=owner;
 delete from public.fan_post_likes where post_id='ea000000-0000-4000-8000-000000000020'and app_user_id=owner;
 insert into public.fan_post_likes(post_id,app_user_id,created_at)values('ea000000-0000-4000-8000-000000000020',owner,clock_timestamp())returning reward_source_id into sid;
 perform pg_temp.earn_assert((select decision='duplicate'from public.mobile_fan_activity_decisions where source_id=sid),'activation snapshots existing like as permanent no-pay target');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','fan_post_likes','ea000000-0000-4000-8000-000000000020')->>'sourceId'=old_source::text,'readded like bridge resolves original source');
 for n in 1..6 loop
 target:=extensions.gen_random_uuid();
 if n in(1,4)then
 insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(target,creator,author,'Clip '||n,'public',extensions.gen_random_uuid(),repeat('a',64));
 insert into public.fan_clip_likes(clip_id,app_user_id,created_at)values(target,owner,clock_timestamp())returning reward_source_id into sid;
 elsif n in(2,5)then
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)values(target,creator,'earning-'||n,'published',clock_timestamp(),clock_timestamp());
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)select target,locale,'Fixture','{"type":"doc","content":[{"type":"paragraph","content":[]}]}'::jsonb from unnest(array['ko','en']::public.content_locale[])locale;
 insert into public.celebrity_notice_likes(notice_id,app_user_id,created_at)values(target,owner,clock_timestamp())returning reward_source_id into sid;
 else
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible)values(target,creator,author,'Post '||n,extensions.gen_random_uuid(),repeat('a',64),false);
 insert into public.fan_post_likes(post_id,app_user_id,created_at)values(target,owner,clock_timestamp())returning reward_source_id into sid;
 end if;
 if n=1 then first_source:=sid;end if;
 perform pg_temp.earn_assert((select decision=case when n<=5 then'awarded'else'daily_limit'end from public.mobile_fan_activity_decisions where source_id=sid),'three like producers combined5 vs6 #'||n);
 end loop;
 perform pg_temp.earn_assert(public.mobile_fan_economy_balance(owner,creator,'fan_point')=10,'five different likes award10P');
 r:=public.read_owned_mobile_fan_reward(owner,sid);
 perform pg_temp.earn_assert(r->>'status'='not_eligible'and r->>'amount'='0'and(select count(*)=6 from jsonb_object_keys(r)),'cap rejection preserves six-field legacy reward shape');
 perform pg_temp.earn_assert(public.award_mobile_fan_activity(owner,creator,'reaction',sid::text)=r,'denied retry is terminal');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_earning_status(owner,'earning-fixture')#>>'{policy,version}'='earning-v2','optin policy configured');
 perform pg_temp.earn_assert((select x->>'usedToday'='5'and x->>'remainingToday'='0'and x->>'status'='daily_limit'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status(owner,'earning-fixture')->'actions')x where x->>'key'='reaction'),'accurate daily usage and remaining');
 perform pg_temp.earn_assert(not exists(select 1 from jsonb_array_elements(public.read_owned_mobile_fan_economy_missions(owner,'earning-fixture')->'missions')x where x->>'key'in('reaction','comment','share')),'old once missions exclude repeating v2 actions');
 insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key,created_at)values(creator,owner,'First distinct comment',extensions.gen_random_uuid(),clock_timestamp())returning id into sid;
 perform pg_temp.earn_assert((select decision='awarded'from public.mobile_fan_activity_decisions where source_id=sid),'lounge comment source paid');
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key,created_at)values(target,owner,'Second distinct comment',extensions.gen_random_uuid(),clock_timestamp())returning id into sid;
 perform pg_temp.earn_assert((select decision='awarded'from public.mobile_fan_activity_decisions where source_id=sid),'post comment source shares cap');
 insert into public.fan_clip_comments(clip_id,app_user_id,body,idempotency_key)select id,owner,'Third distinct comment',extensions.gen_random_uuid()from public.fan_clips where celebrity_id=creator limit 1 returning id into sid;
 perform pg_temp.earn_assert((select decision='daily_limit'from public.mobile_fan_activity_decisions where source_id=sid),'clip third comment cap denied');
 insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key,created_at)values(creator,owner,'  FIRST   DISTINCT comment ',extensions.gen_random_uuid(),clock_timestamp())returning id into sid;
 perform pg_temp.earn_assert((select decision='duplicate'from public.mobile_fan_activity_decisions where source_id=sid),'normalized duplicate comment denied before cap');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(author,'earning-fixture','fan_post_likes',target)->'sourceId'='null'::jsonb,'source bridge owner isolated');
 perform pg_temp.earn_assert(not has_function_privilege('anon','public.read_owned_mobile_fan_earning_status(uuid,text)','execute')and not has_function_privilege('authenticated','public.capture_mobile_fan_activity_event()','execute')and not has_table_privilege('service_role','public.mobile_fan_activity_decisions','insert')and not has_function_privilege('service_role','public.award_mobile_fan_activity_v1(uuid,uuid,text,text)','execute'),'ACLs closed incl renamed helpers');
 perform pg_temp.earn_assert(('2026-10-18 14:59:59+00'::timestamptz at time zone 'Asia/Seoul')::date='2026-10-18'and('2026-10-18 15:00:00+00'::timestamptz at time zone 'Asia/Seoul')::date='2026-10-19','KST midnight boundary');
 perform public.activate_mobile_fan_earning_v2(creator,'earning-v3',jsonb_set(pg_temp.earn_rules(),'{reaction}','3'),pg_temp.earn_caps());
 insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key,created_at)values(creator,owner,'New policy same day comment',extensions.gen_random_uuid(),clock_timestamp())returning id into sid;
 perform pg_temp.earn_assert((select decision='daily_limit'from public.mobile_fan_activity_decisions where source_id=sid),'new policy never resets daily cap');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_reward(owner,first_source)->>'amount'='2','historical award keeps original amount');
end $$;
set constraints all immediate;
do $$declare owner uuid:='ea000000-0000-4000-8000-000000000001';author uuid:='ea000000-0000-4000-8000-000000000002';creator uuid:='ea000000-0000-4000-8000-000000000010';sid uuid;target uuid;mission uuid;revision uuid;admin_id uuid:=extensions.gen_random_uuid();first_submission uuid;source_time timestamptz;native_asset uuid;r jsonb;begin
 insert into public.fan_post_likes(post_id,app_user_id,created_at)select id,author,clock_timestamp()from public.fan_posts where app_user_id=author and celebrity_id=creator limit 1 returning reward_source_id into sid;
 perform pg_temp.earn_assert((select decision='not_eligible'from public.mobile_fan_activity_decisions where source_id=sid),'self content like never paid');
 insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,created_at)select id,owner,'Notice producer source',extensions.gen_random_uuid(),clock_timestamp()from public.celebrity_notices where celebrity_id=creator limit 1 returning id into sid;
 perform pg_temp.earn_assert((select decision='daily_limit'from public.mobile_fan_activity_decisions where source_id=sid),'notice comments join same combined cap');
 for n in 1..2 loop
 execute 'set constraints zzz_repeating_earning deferred';
 sid:=extensions.gen_random_uuid();
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)values(sid,creator,owner,'',extensions.gen_random_uuid(),repeat('a',64),false,clock_timestamp());
 insert into public.content_assets(app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,upload_settled_at,post_id,position)values(owner,creator,'fixture/'||sid||'.webp',1,1,1,repeat('c',64),clock_timestamp(),clock_timestamp(),sid,0);
 perform pg_temp.earn_assert(not exists(select 1 from public.mobile_fan_activity_sources where source_id=sid),'post capture waits for asset attachment #'||n);
 execute 'set constraints zzz_repeating_earning immediate';
 perform pg_temp.earn_assert((select decision=case when n=1 then'daily_limit'else'duplicate'end from public.mobile_fan_activity_decisions where source_id=sid),'image SHA fingerprint blocks recreated post #'||n);
 end loop;
 insert into public.community_stamp_invitation_reward_configs(invitation_policy_version,config_version,celebrity_id,ticket_amount,reward_policy_version,effective_at)values(1,9001,creator,1,2,clock_timestamp());
 for n in 1..6 loop
 insert into public.community_stamp_invitation_milestones(inviter_app_user_id,invitation_policy_version,milestone_number,qualified_count,created_at)values(owner,1,n,n*10,clock_timestamp())returning id into sid;
 r:=public.process_community_stamp_invitation_milestone(owner,n);
 perform pg_temp.earn_assert((select decision=case when n<=5 then'awarded'else'lifetime_limit'end from public.mobile_fan_activity_decisions where source_id=sid),'invitation milestone first5 vs6 #'||n);
 if n=6 then perform pg_temp.earn_assert(r->>'state'='qualified_reward_issued'and not exists(select 1 from public.mobile_fan_economy_activity_receipts where source_id=sid),'terminal invite qualification state never promises point receipt');end if;
 end loop;
 insert into public.admin_allowlist(id,email,role,active)values(admin_id,'earning-author@example.test','admin',true);
 for n in 1..4 loop
 mission:=extensions.gen_random_uuid();revision:=extensions.gen_random_uuid();sid:=extensions.gen_random_uuid();
 insert into public.certification_missions(id,celebrity_id,immutable_key,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,membership_platform)
 values(mission,creator,'earning-cert-'||n,'fixture','Fixture','Fixture','Fixture','Fixture','Fixture','Fixture',case when n=2 then'instagram'::public.social_platform end);
 insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)values(revision,mission,1,2,1,0,author,admin_id,extensions.gen_random_uuid());
 insert into public.certification_submissions(id,app_user_id,celebrity_id,mission_id,mission_revision,reward_revision_id,reward_revision,reward_policy_version,reward_score_points,reward_ticket_amount,attempt_number,idempotency_key,request_hash)
 values(sid,owner,creator,mission,1,revision,1,2,1,0,1,extensions.gen_random_uuid(),repeat('a',64));
 if n in(2,4)then
 native_asset:=extensions.gen_random_uuid();
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,width,height,storage_path,thumbnail_path,state,request_id,request_hash,source_sha256)values(native_asset,owner,'image','certification','image/webp',1,1,1,1,'fixture/'||native_asset,'fixture/thumb-'||native_asset,'ready',extensions.gen_random_uuid(),repeat('a',64),case when n=2 then repeat('a',64)end);
 insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,mobile_media_asset_id,content_type,byte_size,width,height,consumed_submission_id)values(native_asset,owner,creator,mission,native_asset,'image/webp',1,1,1,sid);
 else
 insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,consumed_submission_id)values(extensions.gen_random_uuid(),owner,creator,mission,'fixture/'||sid||'.webp','image/webp',1,1,1,repeat(case when n<=2 then'a'else'b'end,64),sid);
 end if;
 update public.certification_submissions set status='approved',reviewed_by_app_user_id=author,reviewed_by_admin_allowlist_id=admin_id,reviewed_at=clock_timestamp()where id=sid;
 if n<>2 then perform public.award_mobile_fan_activity(owner,creator,'certification',mission::text);end if;
 perform pg_temp.earn_assert((select decision=case when n=1 then'awarded'when n=2 then'duplicate'when n=4 then'not_eligible'else'daily_limit'end from public.mobile_fan_activity_decisions where source_id=sid),'certification legacy/native SHA duplicate, cap and missinghash no-pay #'||n);
 end loop;
 -- Delayed processing keeps the source interval after another policy activates.
 sid:=extensions.gen_random_uuid();source_time:=clock_timestamp();
 insert into public.mobile_fan_activity_sources(source_id,app_user_id,celebrity_id,action_key,source_type,source_key,target_key,occurred_at,eligible)values(sid,owner,creator,'reaction','fan_post_likes',sid,'fan_post:'||sid,source_time,true);
 perform public.activate_mobile_fan_earning_v2(creator,'earning-v4',jsonb_set(pg_temp.earn_rules(),'{reaction}','4'),pg_temp.earn_caps());
 r:=public.award_mobile_fan_activity(owner,creator,'reaction',sid::text);
 perform pg_temp.earn_assert(r->>'policyVersion'='earning-v3'and r->>'status'='not_eligible','delayed source uses retired source-time policy and preserved daily cap');
 r:=public.read_owned_mobile_fan_earning_status(owner,'earning-fixture');
 perform pg_temp.earn_assert((select x->>'status'='not_eligible'and x->>'lifetimeUsed'='0'from jsonb_array_elements(r->'actions')x where x->>'key'='membership_instagram'),'approved duplicate membership accurately unavailable without claiming paid usage');
 raise notice 'EARNING_STATUS_JSON=%',r;
end $$;
-- Native assets bind byte digests without changing the old media DTO or old finish RPC.
do $$declare owner uuid:='ea000000-0000-4000-8000-000000000001';creator uuid:='ea000000-0000-4000-8000-000000000010';asset uuid;job uuid;post uuid;before_json jsonb;begin
 for n in 1..3 loop
 asset:=extensions.gen_random_uuid();job:=extensions.gen_random_uuid();post:=extensions.gen_random_uuid();
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,storage_path,thumbnail_path,state,request_id,request_hash)
 values(asset,owner,'image','fan_post','image/webp',1,'fixture/'||asset,'fixture/thumb-'||asset,'processing',extensions.gen_random_uuid(),repeat('a',64));
 insert into public.mobile_media_validation_jobs(id,asset_id,asset_version,status)values(job,asset,1,'processing');
 if n=3 then perform public.finish_mobile_media_validation(asset,1,job,'image/webp',1,1,null);
 else perform public.finish_mobile_media_validation_v2(asset,1,job,'image/webp',1,1,null,repeat('d',64));end if;
 perform pg_temp.earn_assert((select state='ready'and source_sha256 is not distinct from case when n=3 then null else repeat('d',64)end from public.mobile_media_assets where id=asset),'native finish preserves old7args and atomically binds v2 bytes SHA #'||n);
 if n=1 then
 begin update public.mobile_media_assets set source_sha256=repeat('e',64)where id=asset;raise exception 'Expected immutable digest';exception when others then if sqlerrm<>'MEDIA_SOURCE_IMMUTABLE'then raise;end if;end;
 perform pg_temp.earn_assert(true,'validated native SHA cannot be replaced');end if;
 execute 'set constraints zzz_repeating_earning deferred';
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)values(post,creator,owner,'Native only photo',extensions.gen_random_uuid(),repeat('a',64),false,clock_timestamp());
 perform public.attach_mobile_media(owner,asset,'fan_post','fan_post',post,1,0::smallint);
 execute 'set constraints zzz_repeating_earning immediate';
 perform pg_temp.earn_assert((select decision=case when n=1 then'daily_limit'when n=2 then'duplicate'else'not_eligible'end from public.mobile_fan_activity_decisions where source_id=post),'native photo SHA dedup and historical missinghash no-pay without failing content #'||n);
 end loop;
 perform pg_temp.earn_assert(not has_function_privilege('authenticated','public.finish_mobile_media_validation_v2(uuid,integer,uuid,text,integer,integer,numeric,text)','execute')and has_function_privilege('service_role','public.finish_mobile_media_validation(uuid,integer,uuid,text,integer,integer,numeric)','execute'),'new media finish internal-only and old RPC preserved');
end $$;
-- Existing winning pass and submitted survey IDs are bridge evidence; reads never create rewards.
set constraints all deferred;
do $$declare owner uuid:='ea000000-0000-4000-8000-000000000001';author uuid:='ea000000-0000-4000-8000-000000000002';creator uuid:='ea000000-0000-4000-8000-000000000010';other_creator uuid:=extensions.gen_random_uuid();quiz uuid:=extensions.gen_random_uuid();attempt uuid:=extensions.gen_random_uuid();failed uuid:=extensions.gen_random_uuid();open_attempt uuid:=extensions.gen_random_uuid();pass uuid:=extensions.gen_random_uuid();passport uuid:=extensions.gen_random_uuid();job uuid:=extensions.gen_random_uuid();share uuid:=extensions.gen_random_uuid();visitor uuid:=extensions.gen_random_uuid();sid uuid;brand uuid:=extensions.gen_random_uuid();live uuid:=extensions.gen_random_uuid();survey uuid:=extensions.gen_random_uuid();draft_survey uuid:=extensions.gen_random_uuid();response uuid:=extensions.gen_random_uuid();begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(other_creator,'earning-other','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select other_creator,locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(owner,91342,'0xea00000000000000000000000000000000000001','privy','embedded');
 insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,creator,1,'draft');
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,owner,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp()),(failed,owner,creator,quiz,1,extensions.gen_random_uuid(),'failed',0,clock_timestamp());
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key)values(open_attempt,owner,creator,quiz,1,extensions.gen_random_uuid());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id,passed_at)values(pass,owner,creator,attempt,clock_timestamp());
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','quiz_attempts',attempt)->>'sourceId'=pass::text,'winning quiz attempt resolves canonical pass');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','quiz_attempts',failed)->'sourceId'='null'::jsonb and public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','quiz_attempts',open_attempt)->'sourceId'='null'::jsonb,'failed and open quiz attempts return no source');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(author,'earning-fixture','quiz_attempts',attempt)->'sourceId'='null'::jsonb and public.read_owned_mobile_fan_activity_source(owner,'earning-other','quiz_attempts',attempt)->'sourceId'='null'::jsonb,'quiz bridge owner and creator isolated');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)values(job,'passport',passport,'byus:passport:v1:'||owner||':earning-fixture',1,jsonb_build_object('recipient','0xea00000000000000000000000000000000000001','celebritySlug','earning-fixture','passportId','0x'||repeat('e',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,owner,creator,pass,job);
 insert into public.community_stamp_share_links(id,token,owner_app_user_id,celebrity_id,fan_passport_id)values(share,repeat('e',32),owner,creator,passport);
 insert into public.app_users(id,privy_user_id,verified_email)values(visitor,'did:privy:earning-visitor','earning-visitor@example.test');
 insert into public.community_stamp_share_visits(share_link_id,visitor_app_user_id)values(share,owner)returning id into sid;
 perform pg_temp.earn_assert((select decision='not_eligible'from public.mobile_fan_activity_decisions where source_id=sid),'share self visit never paid');
 insert into public.community_stamp_share_visits(share_link_id,visitor_app_user_id)values(share,author)returning id into sid;
 perform pg_temp.earn_assert((select decision='awarded'from public.mobile_fan_activity_decisions where source_id=sid),'real other-account share visit earns10P');
 insert into public.community_stamp_share_visits(share_link_id,visitor_app_user_id)values(share,visitor)returning id into sid;
 perform pg_temp.earn_assert((select decision='daily_limit'from public.mobile_fan_activity_decisions where source_id=sid),'share second visitor daily cap');
 insert into public.brands(id,slug,status,logo_url,logo_alt)values(brand,'earning-brand','draft','/fixture.webp','Fixture');
 insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash)values(live,'earning-live',creator,brand,now()+interval'1 day',now()+interval'2 days',now()-interval'1 day',now(),'https://www.youtube.com/watch?v=abcdefghijk','/fixture.webp',extensions.crypt('EARNING',extensions.gen_salt('bf',12)));
 insert into public.live_surveys(id,live_event_id,version,legacy_contract,attendance_requirement,visible_from,visible_until)values(survey,live,1,false,'not_required',now()-interval'1 day',now()+interval'1 day'),(draft_survey,live,2,false,'not_required',now()-interval'1 day',now()+interval'1 day');
 insert into public.live_survey_responses(id,app_user_id,live_event_id,celebrity_id,survey_id,passport_id,status,submitted_at,legacy_contract)values(response,owner,live,creator,survey,passport,'submitted',clock_timestamp(),false),(extensions.gen_random_uuid(),owner,live,creator,draft_survey,passport,'draft',null,false);
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','live_survey_responses',survey)->>'sourceId'=response::text,'submitted survey resolves canonical response');
 perform pg_temp.earn_assert(public.read_owned_mobile_fan_activity_source(owner,'earning-fixture','live_survey_responses',draft_survey)->'sourceId'='null'::jsonb and public.read_owned_mobile_fan_activity_source(author,'earning-fixture','live_survey_responses',survey)->'sourceId'='null'::jsonb and public.read_owned_mobile_fan_activity_source(owner,'earning-other','live_survey_responses',survey)->'sourceId'='null'::jsonb,'survey draft foreign owner and creator return null');
end $$;
set constraints all immediate;
-- Invitation opportunity consumption follows global ordinals, across assets/creators/versions.
do $$declare legacy_owner uuid:='ea000000-0000-4000-8000-000000000003';legacy_creator uuid:='ea000000-0000-4000-8000-000000000011';policy uuid;happened timestamptz;reason text;begin
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='3'and x->>'status'='available'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status(legacy_owner,'earning-fixture')->'actions')x where x->>'key'='invitation_milestone'),'policy version changes retain legacy invitation consumption3');
 policy:=(public.activate_mobile_fan_earning_v2(legacy_creator,'legacy-opportunity-v1',pg_temp.earn_rules(),pg_temp.earn_caps())->>'policyId')::uuid;
 happened:=clock_timestamp();
 foreach reason in array array['duplicate','not_eligible','disabled']loop
 insert into public.mobile_fan_activity_decisions(app_user_id,celebrity_id,action_key,scope_key,source_type,source_id,target_key,occurred_at,kst_day,policy_id,decision)
 values(legacy_owner,legacy_creator,'invitation_milestone','fixture-'||reason,'invitation_milestone',extensions.gen_random_uuid(),'invitation-fixture',happened,(happened at time zone 'Asia/Seoul')::date,policy,reason);
 end loop;
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='3'and x->>'status'='available'and x->>'usedToday'='0'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status(legacy_owner,'earning-fixture')->'actions')x where x->>'key'='invitation_milestone'),'duplicate noteligible disabled decisions do not consume all5 opportunities');
 perform public.activate_mobile_fan_earning_v2(legacy_creator,'legacy-opportunity-v2',pg_temp.earn_rules(),pg_temp.earn_caps());
 insert into public.mobile_fan_activity_decisions(app_user_id,celebrity_id,action_key,scope_key,source_type,source_id,target_key,occurred_at,kst_day,policy_id,decision)
 values(legacy_owner,legacy_creator,'invitation_milestone','6','invitation_milestone',extensions.gen_random_uuid(),'invitation_milestone:6',happened,(happened at time zone 'Asia/Seoul')::date,policy,'lifetime_limit');
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='5'and x->>'status'='lifetime_limit'and x->>'usedToday'='0'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status(legacy_owner,'earning-fixture')->'actions')x where x->>'key'='invitation_milestone'),'ordinal6 terminal on another creator and retired version consumes all5 opportunities');
 perform pg_temp.earn_assert((select x->>'lifetimeUsed'='5'and x->>'status'='lifetime_limit'from jsonb_array_elements(public.read_owned_mobile_fan_earning_status(legacy_owner,'earning-legacy')->'actions')x where x->>'key'='invitation_milestone'),'current creator policy version cannot reset prior terminal invitation limit');
 perform pg_temp.earn_assert(not exists(select 1 from public.repeating_earning_legacy_invite_snapshot s where s.ticket_balance<>public.get_fan_ticket_balance(s.app_user_id,legacy_creator)
 or s.ticket_entries is distinct from(select jsonb_agg(to_jsonb(l)order by l.id)from public.fan_ticket_ledger l where l.app_user_id=s.app_user_id)
 or s.milestones is distinct from(select jsonb_agg(to_jsonb(m)order by m.id)from public.community_stamp_invitation_milestones m where m.inviter_app_user_id=s.app_user_id))
 and not exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id in(select app_user_id from public.repeating_earning_legacy_invite_snapshot)),'status reads preserve actual old ticket ledger milestone states and zero new point receipts');
end $$;
rollback;
