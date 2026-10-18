create function pg_temp.assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'LIVE_PARTICIPATION_TEST: %',message;end if;end $$;
create function pg_temp.expect_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if position(expected in sqlerrm)=0 then raise exception 'Unexpected %, wanted %',sqlerrm,expected;end if;return;end;raise exception 'Expected %',expected;end $$;
create function pg_temp.uuid(n integer)returns uuid language sql immutable as $$select('aa900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.live(n integer,starts timestamptz,ends timestamptz)returns uuid language plpgsql as $$declare t public.live_events%rowtype;id uuid:=pg_temp.uuid(n);begin
 select * into strict t from public.live_events where publication_status='published'limit 1;
 insert into public.live_events select(jsonb_populate_record(null::public.live_events,to_jsonb(t)||jsonb_build_object('id',id,'slug','participation-'||n,'celebrity_id',pg_temp.uuid(1),'starts_at',starts,'ends_at',ends,'reservation_opens_at',starts-interval'2 days','reservation_closes_at',starts-interval'1 second','attendance_valid_from',now()-interval'1 day','attendance_valid_until',now()+interval'2 days','fan_code_hash',extensions.crypt('TEST2026',extensions.gen_salt('bf',12)),'publication_status','draft','published_at',null,'ever_published_at',null))).*;
 insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)values(id,'ko','실제 경로 검증','검증 전용','검증 전용'),(id,'en','Contract test','Test only','Test only');
 update public.live_events set publication_status='published',published_at=now(),ever_published_at=now()where live_events.id=pg_temp.uuid(n);
 return id;end $$;
create function pg_temp.mission(live uuid,key text,kind text,cert uuid default null,survey uuid default null,nextlive uuid default null,thread uuid default null)returns uuid language plpgsql as $$declare id uuid;begin
 insert into public.live_participation_missions(live_event_id,mission_key,kind,phase,title,description,certification_mission_id,survey_id,next_live_event_id,thread_id,policy_id,opens_at,closes_at,public,enabled)
 values(live,key,kind,case when key in('reserve','waiting','song','story','dance','topic','matching','sns','nextreserve')then case when key='nextreserve'then'after'else'before'end when key in('reflection','return','bonus')then'after'else'during'end,key,'검증용',cert,survey,nextlive,thread,pg_temp.uuid(2),now()-interval'1 day',now()+interval'1 day',true,true)returning live_participation_missions.id into id;return id;end $$;
create function pg_temp.cert(key text)returns uuid language plpgsql as $$declare r jsonb;id uuid;begin
 r:=public.save_admin_certification_mission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),null::uuid,pg_temp.uuid(1),'participation-'||key,null::bigint,'기타',key,key,'설명','Description','증거와 입장 시간·순서를 직접 확인하세요','Verify proof, arrival time and order',now()-interval'1 day',now()+interval'1 day',3::smallint,2::bigint);
 id:=(r->>'id')::uuid;perform public.set_admin_certification_mission_status(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),id,1,'active');return id;end $$;
create function pg_temp.review(owner uuid,cert uuid,key uuid)returns uuid language plpgsql as $$declare u uuid:=extensions.gen_random_uuid();s jsonb;begin
 perform public.register_owned_certification_upload(owner,cert,u,owner||'/'||cert||'/'||u||'.webp',100,10,10,repeat('a',64));
 s:=public.submit_owned_certification(owner,cert,key,jsonb_build_array(u),null,null);
 perform public.review_admin_certification_submission(pg_temp.uuid(10),pg_temp.uuid(11),extensions.gen_random_uuid(),(s->>'id')::uuid,extensions.gen_random_uuid(),1,'approve',null);return(s->>'id')::uuid;end $$;
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(pg_temp.uuid(1),'participation-contract','draft','/test.webp','{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(pg_temp.uuid(1),'ko','검증','검증','검증'),(pg_temp.uuid(1),'en','Test','Test','Test');
insert into public.mobile_fan_economy_policies(id,celebrity_id,kind,version,rules,effective_at)values(pg_temp.uuid(2),pg_temp.uuid(1),'broadcast','live-v1','{"contract":"live-v1"}',now());
insert into public.app_users(id,privy_user_id,verified_email,status)values(pg_temp.uuid(10),'did:privy:participation-admin','participation-admin@byus.test','active');
insert into public.admin_allowlist(id,email,role,active)values(pg_temp.uuid(11),'participation-admin@byus.test','admin',true);
do $$declare i integer;o uuid;q uuid;a uuid;p uuid;j uuid;begin
 for i in 1..10 loop
 o:=pg_temp.uuid(100+i);q:=pg_temp.uuid(200+i);a:=pg_temp.uuid(300+i);p:=pg_temp.uuid(400+i);j:=pg_temp.uuid(500+i);
 insert into public.app_users(id,privy_user_id,verified_email,status)values(o,'did:privy:participation-'||i,'participation-'||i||'@byus.test','active');
 insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(q,pg_temp.uuid(1),i,'draft');
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(a,o,pg_temp.uuid(1),q,i,extensions.gen_random_uuid(),'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pg_temp.uuid(600+i),o,pg_temp.uuid(1),a);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(o,91342,'0x'||lpad(i::text,40,'0'),'privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)values(j,'passport',p,'byus:passport:v1:'||o||':participation-contract',1,jsonb_build_object('recipient','0x'||lpad(i::text,40,'0'),'celebritySlug','participation-contract','passportId','0x'||repeat('a',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(p,o,pg_temp.uuid(1),pg_temp.uuid(600+i),j);
 end loop;end $$;
update public.celebrities set status='published',published_at=now()where id=pg_temp.uuid(1);
create function pg_temp.survey(live uuid,type text)returns uuid language plpgsql as $$declare s uuid:=extensions.gen_random_uuid();q uuid:=extensions.gen_random_uuid();good uuid:=extensions.gen_random_uuid();bad uuid:=extensions.gen_random_uuid();begin
 insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)select live,coalesce((select max(revision)+1 from public.live_reward_setting_revisions where live_event_id=live),1),a.policy_version,'published',1,1,0,extensions.gen_random_uuid(),now()from public.reward_policy_activation a where singleton;
 insert into public.live_surveys(id,live_event_id,version,mission_type,legacy_contract,attendance_requirement,visible_from,visible_until)values(s,live,1,type,false,'not_required',now()-interval'1 day',now()+interval'1 day');
 insert into public.live_survey_localizations(survey_id,locale,title,description)values(s,'ko','실제 설문','검증용'),(s,'en','Survey','Test');
 insert into public.live_survey_questions(id,survey_id,question_type,position)values(q,s,'single_choice',1);
 insert into public.live_survey_question_localizations(question_id,locale,question_text)values(q,'ko','선택하세요'),(q,'en','Choose');
 insert into public.live_survey_options(id,question_id,position)values(good,q,1),(bad,q,2);
 insert into public.live_survey_option_localizations(option_id,locale,label)values(good,'ko','A'),(good,'en','A'),(bad,'ko','B'),(bad,'en','B');
 if type='quiz'then update public.live_survey_questions set correct_option_id=good where id=q;end if;
 update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=now(),ever_published_at=now()where id=s;
 return s;end $$;
create function pg_temp.closed_sources(n integer)returns void language plpgsql as $$declare l uuid;c uuid;m uuid;stamp uuid;source uuid;r jsonb;i integer;begin
 for i in 1..2 loop
 l:=pg_temp.live(n+i,now()+interval'1 hour',now()+interval'2 hours');m:=pg_temp.mission(l,'reserve','reservation');
 if i=1 then update public.live_participation_missions set public=false,enabled=false where id=m;else update public.live_participation_missions set closes_at=now()-interval'1 second'where id=m;end if;
 stamp:=extensions.gen_random_uuid();r:=public.reserve_owned_live_event(pg_temp.uuid(110),l,extensions.gen_random_uuid(),stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('a',64));
 select id into source from public.live_reservations where app_user_id=pg_temp.uuid(110)and live_event_id=l;
 perform pg_temp.assert(source is not null and exists(select 1 from public.stamps where id=stamp),'closed linked configuration rolled back native reservation/stamp');
 perform pg_temp.assert(not exists(select 1 from public.live_participation_receipts where source_id=source)and not exists(select 1 from public.fan_ticket_ledger where source_id=source)and not exists(select 1 from public.mobile_fan_economy_activity_receipts where source_id=source),'closed source earned legacy/general/broadcast reward');
 c:=pg_temp.cert('closed-'||n||'-'||i);m:=pg_temp.mission(l,'story','text',c);
 if i=1 then update public.live_participation_missions set public=false,enabled=false where id=m;else update public.live_participation_missions set closes_at=now()-interval'1 second'where id=m;end if;
 source:=pg_temp.review(pg_temp.uuid(110),c,extensions.gen_random_uuid());
 perform pg_temp.assert((select status='approved'from public.certification_submissions where id=source)and(select sum(points)=3 from public.fan_score_ledger where manual_submission_id=source),'closed configuration rolled back native review or score');
 perform pg_temp.assert(not exists(select 1 from public.live_participation_receipts where source_id=source)and not exists(select 1 from public.fan_ticket_ledger where source_id=source)and not exists(select 1 from public.mobile_fan_economy_activity_receipts where source_id=source),'closed native review earned a replacement reward');
 end loop;end $$;
