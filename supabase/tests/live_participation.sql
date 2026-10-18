-- Disposable database only. Canonical producer assertions, not mocked awards.
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
\ir live_participation_fixture.sql
-- Unlinked ordinary certification keeps image requirements and native tickets before general earning activation.
do $$declare cert uuid;source uuid;reward jsonb;l uuid;begin
 cert:=pg_temp.cert('ordinary-unlinked');
 perform pg_temp.expect_error(format('select public.submit_owned_certification(%L,%L,%L,%L::jsonb,null,null)',pg_temp.uuid(110),cert,extensions.gen_random_uuid(),'[]'),'CERTIFICATION_UPLOAD_COUNT_INVALID');
 source:=pg_temp.review(pg_temp.uuid(110),cert,extensions.gen_random_uuid());reward:=public.read_owned_mobile_fan_reward(pg_temp.uuid(110),source);
 perform pg_temp.assert(reward->>'asset'='legacy_free_draw'and reward->>'amount'='2','ordinary native earning/ticket policy changed');
 perform pg_temp.assert((select count(*)=6 from jsonb_object_keys(reward)),'native fanReward DTO changed');
 l:=pg_temp.live(899,now()+interval'1 hour',now()+interval'2 hours');perform pg_temp.mission(l,'story','text',cert);
 reward:=public.award_mobile_fan_activity(pg_temp.uuid(110),pg_temp.uuid(1),'certification',cert::text);
 perform pg_temp.assert(reward->>'amount'='0'and not exists(select 1 from public.live_participation_receipts where source_id=source),'historical legacy reward was backfilled as points');
end $$;
select pg_temp.closed_sources(900);
-- All six orders use real attendance and certification review producers.
do $$declare orders text[][]:=array[array['attendance','early','first'],array['attendance','first','early'],array['early','attendance','first'],array['early','first','attendance'],array['first','attendance','early'],array['first','early','attendance']];i integer;j integer;k text;l uuid;o uuid;c1 uuid;c2 uuid;m uuid;s uuid;result jsonb;begin
 for i in 1..6 loop
 if i=4 then
 insert into public.mobile_fan_economy_policies(id,celebrity_id,kind,version,rules,effective_at)values(pg_temp.uuid(3),pg_temp.uuid(1),'earning','general-test',jsonb_build_object('verification',1,'reaction',1,'comment',1,'checkin',1,'certification',1,'membership_instagram',1,'membership_tiktok',1,'membership_youtube',1,'share',1,'live_reservation',1,'live_attendance',1,'mission_completion',1,'first_clip',1,'journey_completion',1,'invitation_milestone',1),now()-interval'1 hour');
 insert into public.mobile_fan_earning_cutovers values(pg_temp.uuid(1),pg_temp.uuid(3),now()-interval'1 hour','general-test');
 end if;
 perform pg_temp.assert(public.mobile_fan_source_uses_points(pg_temp.uuid(1),clock_timestamp())=(i>=4),'earning test boundary missing');
 l:=pg_temp.live(700+i,now()-interval'1 minute',now()+interval'1 hour');o:=pg_temp.uuid(100+i);c1:=pg_temp.cert('early-'||i);c2:=pg_temp.cert('first-'||i);
 perform pg_temp.mission(l,'attendance','attendance');perform pg_temp.mission(l,'early','image',c1);perform pg_temp.mission(l,'first','image',c2);
 for j in 1..3 loop
 k:=orders[i][j];
 if k='attendance'then s:=extensions.gen_random_uuid();result:=public.attend_owned_live_event_with_replay(o,'participation-'||(700+i),extensions.gen_random_uuid(),'TEST2026',true,s,'byus:stamp:v1:'||s,'0x'||repeat('b',64));
 else s:=pg_temp.review(o,case when k='early'then c1 else c2 end,extensions.gen_random_uuid());end if;
 end loop;
 perform pg_temp.assert((select sum(awarded_points)=30 from public.live_participation_receipts where app_user_id=o and live_event_id=l),'attendance order did not converge to30');
 perform pg_temp.assert(public.mobile_fan_economy_balance(o,pg_temp.uuid(1),'fan_point')=30,'linked source also earned general points');
 perform pg_temp.assert((select count(*)=3 from public.live_participation_receipts where app_user_id=o and live_event_id=l),'missing receipt');
 perform pg_temp.assert(not exists(select 1 from public.fan_ticket_ledger where app_user_id=o and source_id in(select source_id from public.live_participation_receipts where live_event_id=l)),'linked source gave legacy tickets');
 perform pg_temp.assert((public.read_owned_mobile_fan_reward(o,s)->>'asset')='fan_point','native reward projection lost broadcast receipt');
 end loop;end $$;
select pg_temp.closed_sources(910);
do $$declare cert uuid;source uuid;l uuid;before_balance bigint;reward jsonb;begin
 cert:=pg_temp.cert('historical-general');source:=pg_temp.review(pg_temp.uuid(110),cert,extensions.gen_random_uuid());
 perform pg_temp.assert(exists(select 1 from public.mobile_fan_economy_activity_receipts where source_id=source),'active ordinary source did not earn its normal general points');
 before_balance:=public.mobile_fan_economy_balance(pg_temp.uuid(110),pg_temp.uuid(1),'fan_point');
 l:=pg_temp.live(919,now()+interval'1 hour',now()+interval'2 hours');perform pg_temp.mission(l,'story','text',cert);
 reward:=public.award_mobile_fan_activity(pg_temp.uuid(110),pg_temp.uuid(1),'certification',cert::text);
 perform pg_temp.assert(reward->>'amount'='0'and public.mobile_fan_economy_balance(pg_temp.uuid(110),pg_temp.uuid(1),'fan_point')=before_balance,'historical general reward was duplicated as broadcast points');
end $$;

-- Native quiz precheck rolls back incorrect attempts, and correct retries preserve source/stamp/score.
do $$declare l uuid;s uuid;m uuid;q uuid;good uuid;bad uuid;stamp uuid;key uuid:=extensions.gen_random_uuid();result jsonb;begin
 l:=pg_temp.live(801,now()-interval'1 minute',now()+interval'1 hour');s:=pg_temp.survey(l,'quiz');m:=pg_temp.mission(l,'quiz','quiz',null,s);
 select id,correct_option_id into q,good from public.live_survey_questions where survey_id=s;select id into bad from public.live_survey_options where question_id=q and id<>good;stamp:=extensions.gen_random_uuid();
 perform pg_temp.expect_error(format('select public.submit_owned_live_mission(%L,%L,%L,%L::jsonb,%L,%L,%L)',pg_temp.uuid(109),s,key,jsonb_build_array(jsonb_build_object('questionId',q,'selectedOptionIds',jsonb_build_array(bad))),stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('a',64)),'LIVE_PARTICIPATION_QUIZ_INCORRECT');
 perform pg_temp.assert(not exists(select 1 from public.live_survey_responses where app_user_id=pg_temp.uuid(109)and survey_id=s),'incorrect quiz source committed');
 result:=public.submit_owned_live_mission(pg_temp.uuid(109),s,key,jsonb_build_array(jsonb_build_object('questionId',q,'selectedOptionIds',jsonb_build_array(good))),stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('a',64));
 perform pg_temp.assert((select awarded_points=20 from public.live_participation_receipts where mission_id=m and app_user_id=pg_temp.uuid(109)),'quiz broadcast award missing');
 result:=public.read_live_participation('participation-801','during',pg_temp.uuid(109));
 perform pg_temp.assert(result#>>'{missions,0,submittedAnswers,0,questionId}'=q::text,'owned quiz answer not projected');
 perform pg_temp.assert(position('correct_option' in result::text)=0 and position('correctness'in result::text)=0,'quiz correctness leaked');
 result:=public.read_live_participation('participation-801','during',null);
 perform pg_temp.assert(result#>'{missions,0,questions}'='[]'::jsonb and result#>'{missions,0,submittedAnswers}'='[]'::jsonb and result#>'{missions,0,submissionId}'='null'::jsonb,'guest quiz privacy failed');
end $$;
-- Real response counts, not prototype percentages.
do $$declare l uuid;s uuid;m uuid;q uuid;option uuid;stamp uuid:=extensions.gen_random_uuid();result jsonb;begin
 l:=pg_temp.live(802,now()-interval'1 minute',now()+interval'1 hour');s:=pg_temp.survey(l,'vote');m:=pg_temp.mission(l,'corner','choice',null,s);
 select id into q from public.live_survey_questions where survey_id=s;select id into option from public.live_survey_options where question_id=q order by position limit 1;
 result:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-802',m,extensions.gen_random_uuid(),jsonb_build_object('kind','choice','answers',jsonb_build_array(jsonb_build_object('questionId',q,'optionIds',jsonb_build_array(option)))),stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('b',64));
 result:=public.read_live_participation('participation-802','during',pg_temp.uuid(109));
 perform pg_temp.assert(result#>>'{missions,0,responseCount}'='1'and result#>>'{missions,0,questions,0,options,0,responseCount}'='1'and result#>>'{missions,0,questions,0,options,1,responseCount}'='0','poll counts are not actual responses');
end $$;
-- Pending result recovery precedes current availability and revision; original text remains owner-only.
do $$declare l uuid;c uuid;m uuid;stamp uuid:=extensions.gen_random_uuid();key uuid:=extensions.gen_random_uuid();payload jsonb:='{"kind":"text","text":"private complete story","uploadIds":[]}'::jsonb;result jsonb;source uuid;begin
 l:=pg_temp.live(803,now()+interval'1 hour',now()+interval'2 hours');c:=pg_temp.cert('story-recovery');m:=pg_temp.mission(l,'story','text',c);
 result:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-803',m,key,payload,stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('c',64));source:=(result->>'sourceId')::uuid;
 perform pg_temp.assert(result->>'state'='pending'and result->>'awardedPoints'='0','text credited before approval');
 perform pg_temp.assert(public.read_live_participation('participation-803','before',pg_temp.uuid(109))#>>'{missions,0,submittedText}'='private complete story','owner original text lost');
 perform pg_temp.assert(public.read_live_participation('participation-803','before',pg_temp.uuid(110))#>'{missions,0,submittedText}'='null'::jsonb,'another owner saw text');
 perform pg_temp.assert(position('private complete story'in public.read_live_participation('participation-803','before',null)::text)=0,'guest saw text');
 update public.live_participation_missions set closes_at=clock_timestamp()-interval'1 second',revision=revision+1 where id=m;
 result:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-803',m,key,payload,extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(result->>'replayed'='true'and(result->>'sourceId')::uuid=source,'closed revision recovery lost source');
 perform pg_temp.expect_error(format('select public.submit_owned_live_participation(%L,%L,%L,%L,%L::jsonb,%L,%L,%L)',pg_temp.uuid(109),'participation-803',m,key,'{"kind":"text","text":"different","uploadIds":[]}',stamp,'unused','unused'),'LIVE_PARTICIPATION_REQUEST_CONFLICT');
end $$;
-- Rejection/resubmission and administrator selection use the existing review producer atomically.
do $$declare l uuid;c uuid;m uuid;bonus uuid;stamp uuid:=extensions.gen_random_uuid();r jsonb;source uuid;resubmitted uuid;begin
 l:=pg_temp.live(804,now()-interval'2 hours',now()-interval'1 hour');c:=pg_temp.cert('reflection-review');m:=pg_temp.mission(l,'reflection','text',c);bonus:=pg_temp.mission(l,'bonus','bonus');
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-804',m,extensions.gen_random_uuid(),'{"kind":"text","text":"first response","uploadIds":[]}',stamp,'unused','unused');source:=(r->>'sourceId')::uuid;
 perform public.review_admin_certification_submission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),source,extensions.gen_random_uuid(),1,'reject','내용을 보완해 주세요');
 perform pg_temp.assert(not exists(select 1 from public.live_participation_receipts where source_id=source),'rejection awarded points');
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-804',m,extensions.gen_random_uuid(),'{"kind":"text","text":"revised response","uploadIds":[]}',stamp,'unused','unused');resubmitted:=(r->>'sourceId')::uuid;
 perform pg_temp.assert((select previous_submission_id=source from public.certification_submissions where id=resubmitted),'rejected chain not retained');
 perform public.review_admin_certification_submission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),resubmitted,extensions.gen_random_uuid(),1,'approve',null);
 perform public.admin_select_live_participation(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),resubmitted);
 perform public.admin_select_live_participation(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),resubmitted);
 perform pg_temp.assert((select sum(awarded_points)=30 and count(*)=2 from public.live_participation_receipts where app_user_id=pg_temp.uuid(109)and live_event_id=l),'selection bonus duplicated or not atomic');
 perform pg_temp.expect_error(format('select public.admin_select_live_participation(%L,%L,%L,%L)',pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),source),'LIVE_PARTICIPATION_SELECTION_INVALID');
 perform pg_temp.assert((select item->'participationPayload'->>'text'='revised response'from jsonb_array_elements(public.get_admin_certification_queue(pg_temp.uuid(10),pg_temp.uuid(11),'approved'))item where item->>'id'=resubmitted::text),'full review payload missing');
end $$;
-- A native pending replay cannot replace the original payload or song FK through a longer web-only tail.
do $$declare l uuid;c uuid;m uuid;upload uuid:=extensions.gen_random_uuid();key uuid:=extensions.gen_random_uuid();source uuid;r jsonb;begin
 l:=pg_temp.live(809,now()+interval'1 hour',now()+interval'2 hours');c:=pg_temp.cert('cross-channel-replay');m:=pg_temp.mission(l,'story','text',c);
 perform public.register_owned_certification_upload(pg_temp.uuid(109),c,upload,pg_temp.uuid(109)||'/'||c||'/'||upload||'.webp',100,10,10,repeat('e',64));
 r:=public.submit_owned_certification(pg_temp.uuid(109),c,key,jsonb_build_array(upload),repeat('A',1000),null);source:=(r->>'id')::uuid;
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-809',m,key,jsonb_build_object('kind','text','text',repeat('A',1000)||'different tail','uploadIds',jsonb_build_array(upload)),extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(r->>'replayed'='true'and r->>'awardedPoints'='0','cross-channel source replay claimed another award');
 perform pg_temp.assert((select note=repeat('A',1000)and participation_payload is null and live_fan_submission_id is null and review_revision=1 from public.certification_submissions where id=source),'native pending original or revision changed through a web-only tail');
 perform pg_temp.assert(public.read_live_participation('participation-809','before',pg_temp.uuid(109))#>>'{missions,0,submittedText}'=repeat('A',1000),'cross-channel catalog displayed unreviewed replacement text');
 perform pg_temp.assert(public.get_owned_certification_proof_source(pg_temp.uuid(110),source,upload)is null and public.get_owned_certification_proof_source(pg_temp.uuid(109),source,upload)is not null,'other-owner private proof source denial failed');
end $$;
-- Historical canonical attendance/reservation fixtures isolate return eligibility without waiting on wall time.
do $$declare previous uuid;current uuid;return_mission uuid;result jsonb;cert uuid;upload uuid;source uuid;owner uuid;k text;begin
 previous:=pg_temp.live(805,now()-interval'10 minutes',now()-interval'5 minutes');current:=pg_temp.live(806,now()-interval'4 minutes',now()-interval'1 minute');
 perform pg_temp.mission(previous,'reserve','reservation');perform pg_temp.mission(previous,'attendance','attendance');perform pg_temp.mission(current,'attendance','attendance');return_mission:=pg_temp.mission(current,'return','return');
 insert into public.live_reservations(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,reserved_at,created_at)values(pg_temp.uuid(110),previous,pg_temp.uuid(1),pg_temp.uuid(410),extensions.gen_random_uuid(),now()-interval'11 minutes',now()-interval'11 minutes');
 insert into public.live_attendances(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,attended_at,created_at)values(pg_temp.uuid(109),previous,pg_temp.uuid(1),pg_temp.uuid(409),extensions.gen_random_uuid(),now()-interval'7 minutes',now()-interval'7 minutes'),(pg_temp.uuid(109),current,pg_temp.uuid(1),pg_temp.uuid(409),extensions.gen_random_uuid(),now()-interval'2 minutes',now()-interval'2 minutes'),(pg_temp.uuid(110),current,pg_temp.uuid(1),pg_temp.uuid(410),extensions.gen_random_uuid(),now()-interval'2 minutes',now()-interval'2 minutes');
 result:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-806',return_mission,extensions.gen_random_uuid(),'{"kind":"return"}',extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(result->>'awardedPoints'='20','valid returning fan not awarded');
 result:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-806',return_mission,extensions.gen_random_uuid(),'{"kind":"return"}',extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(result->>'awardedPoints'='0'and result->>'replayed'='true','canonical return replay claimed a new award');
 -- Early/first approvals are canonical attendance proofs, even without a code attendance row.
 foreach k in array array['early','first']loop
 owner:=case when k='early'then pg_temp.uuid(108)else pg_temp.uuid(107)end;
 insert into public.live_attendances(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,attended_at,created_at)values(owner,previous,pg_temp.uuid(1),case when k='early'then pg_temp.uuid(408)else pg_temp.uuid(407)end,extensions.gen_random_uuid(),now()-interval'7 minutes',now()-interval'7 minutes');
 cert:=pg_temp.cert('return-'||k);perform pg_temp.mission(current,k,'image',cert);upload:=extensions.gen_random_uuid();
 perform public.register_owned_certification_upload(owner,cert,upload,owner||'/'||cert||'/'||upload||'.webp',100,10,10,repeat('c',64));
 result:=public.submit_owned_certification(owner,cert,extensions.gen_random_uuid(),jsonb_build_array(upload),null,null);source:=(result->>'id')::uuid;
 -- Set the historical fixture's submission time before approval; the review itself uses the real canonical producer.
 update public.certification_submissions set submitted_at=now()-interval'2 minutes'where id=source;
 perform public.review_admin_certification_submission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),source,extensions.gen_random_uuid(),1,'approve',null);
 perform pg_temp.assert(not exists(select 1 from public.live_attendances where app_user_id=owner and live_event_id=current),'return proof test accidentally had a code attendance');
 result:=public.submit_owned_live_participation(owner,'participation-806',return_mission,extensions.gen_random_uuid(),'{"kind":"return"}',extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(result->>'awardedPoints'='20','approved early/first did not qualify current return');
 end loop;
 perform pg_temp.expect_error(format('select public.submit_owned_live_participation(%L,%L,%L,%L,%L::jsonb,%L,%L,%L)',pg_temp.uuid(110),'participation-806',return_mission,extensions.gen_random_uuid(),'{"kind":"return"}',extensions.gen_random_uuid(),'unused','unused'),'LIVE_PARTICIPATION_RETURN_INELIGIBLE');
end $$;
-- Waiting uses the actual public fan-post thread; crew is one of three approved roles with zero points.
do $$declare l uuid;thread uuid:=extensions.gen_random_uuid();waiting uuid;crew uuid;r jsonb;begin
 l:=pg_temp.live(807,now()+interval'1 hour',now()+interval'2 hours');
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(thread,pg_temp.uuid(1),pg_temp.uuid(109),'검증 전용 대기 글','public',extensions.gen_random_uuid(),repeat('a',64));
 waiting:=pg_temp.mission(l,'waiting','waiting',null,null,null,thread);
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-807',waiting,extensions.gen_random_uuid(),'{"kind":"waiting"}',extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(r->>'awardedPoints'='0'and r->>'state'='approved','waiting paid points');
 l:=pg_temp.live(808,now()-interval'1 minute',now()+interval'1 hour');crew:=pg_temp.mission(l,'crew','crew');
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-808',crew,extensions.gen_random_uuid(),'{"kind":"crew","role":"recording"}',extensions.gen_random_uuid(),'unused','unused');
 r:=public.submit_owned_live_participation(pg_temp.uuid(109),'participation-808',crew,extensions.gen_random_uuid(),'{"kind":"crew","role":"highlights"}',extensions.gen_random_uuid(),'unused','unused');
 perform pg_temp.assert(r->>'awardedPoints'='0'and(select count(*)=1 from public.live_participation_receipts where mission_id=crew),'crew join duplicated or paid');
end $$;
-- Viewer admin sessions can inspect actual sources but cannot change mission configuration.
insert into public.admin_allowlist(id,email,role,active)values(pg_temp.uuid(14),'participation-10@byus.test','viewer',true);
select public.admin_read_live_participation(pg_temp.uuid(110),pg_temp.uuid(14),pg_temp.uuid(701));
select pg_temp.expect_error(format('select public.admin_save_live_participation(%L,%L,%L,%L::jsonb)',pg_temp.uuid(110),pg_temp.uuid(14),extensions.gen_random_uuid(),'{}'),'viewer is read-only');
-- Direct client access cannot read private participation tables or call trusted-owner RPCs.
do $$begin
 perform pg_temp.assert(not has_table_privilege('authenticated','public.live_participation_receipts','SELECT'),'direct receipt select allowed');
 perform pg_temp.assert(not has_function_privilege('authenticated','public.submit_owned_live_participation(uuid,text,uuid,uuid,jsonb,uuid,text,text)','EXECUTE'),'direct owner RPC allowed');
 perform pg_temp.assert(not has_function_privilege('service_role','public.live_participation_award(uuid,uuid,uuid)','EXECUTE'),'generic award RPC exposed');
end $$;
rollback;
