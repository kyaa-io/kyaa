-- Synthetic-only assertions for 20261219051000: in the cross-creator schedule list, a viewer keeps the schedules of an unlisted creator
-- that they subscribed to or suggested (approved); another viewer's, and a guest's list, still leave them out. All changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare
 me uuid:=extensions.gen_random_uuid();other uuid:=extensions.gen_random_uuid();
 c_unlisted uuid:=extensions.gen_random_uuid();c_listed uuid:=extensions.gen_random_uuid();
 s_subscribed uuid:=extensions.gen_random_uuid();s_suggested uuid:=extensions.gen_random_uuid();s_others uuid:=extensions.gen_random_uuid();s_none uuid:=extensions.gen_random_uuid();s_listed uuid:=extensions.gen_random_uuid();
 from_at constant timestamptz:='2031-05-01T00:00:00+09:00';to_at constant timestamptz:='2031-06-01T00:00:00+09:00';
 s_pending uuid:=extensions.gen_random_uuid();
 r jsonb;ids text[];
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(me,'did:privy:keep-mine-'||me,me||'@example.test'),(other,'did:privy:keep-mine-'||other,other||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
  (c_unlisted,'sched-mine-unlisted','published','/fixture.webp',now(),'{creator}','creator'),
  (c_listed,'sched-mine-listed','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
  (c_unlisted,'ko','내 일정 미노출 검증','요약','대체'),(c_listed,'ko','내 일정 노출 검증','요약','대체');
 insert into public.group_pages(kind,celebrity_id,name,listed)values('fan',c_unlisted,'[시험] 내 일정 미노출 팬 페이지',false);
 insert into public.group_pages(kind,celebrity_id,name)values('fan',c_listed,'내 일정 노출 팬 페이지');
 insert into public.celebrity_schedules(id,celebrity_id,kind,title_ko,title_en,starts_at,ends_at,time_zone,status,official_source_url,idempotency_key,request_hash)values
  (s_subscribed,c_unlisted,'event','[시험] 구독한 일정','Subscribed',from_at+interval '1 day',from_at+interval '1 day 1 hour','Asia/Seoul','published','https://example.test/m1',extensions.gen_random_uuid(),repeat('a',64)),
  (s_suggested,c_unlisted,'event','[시험] 신청한 일정','Suggested',from_at+interval '2 days',from_at+interval '2 days 1 hour','Asia/Seoul','published','https://example.test/m2',extensions.gen_random_uuid(),repeat('b',64)),
  (s_others,c_unlisted,'event','[시험] 남이 구독한 일정','Others',from_at+interval '3 days',from_at+interval '3 days 1 hour','Asia/Seoul','published','https://example.test/m3',extensions.gen_random_uuid(),repeat('c',64)),
  (s_none,c_unlisted,'event','[시험] 아무도 안 본 일정','None',from_at+interval '4 days',from_at+interval '4 days 1 hour','Asia/Seoul','published','https://example.test/m4',extensions.gen_random_uuid(),repeat('d',64)),
  (s_listed,c_listed,'event','노출 일정','Listed',from_at+interval '5 days',from_at+interval '5 days 1 hour','Asia/Seoul','published','https://example.test/m5',extensions.gen_random_uuid(),repeat('e',64));
 insert into public.celebrity_schedules(id,celebrity_id,kind,title_ko,title_en,starts_at,ends_at,time_zone,status,official_source_url,idempotency_key,request_hash)values
  (s_pending,c_unlisted,'event','[시험] 신청만 한 비슷한 일정','Pending lookalike',from_at+interval '6 days',from_at+interval '6 days 1 hour','Asia/Seoul','published','https://example.test/m6',extensions.gen_random_uuid(),repeat('9',64));
 insert into public.schedule_subscriptions(schedule_id,app_user_id)values(s_subscribed,me),(s_others,other);
 insert into public.schedule_suggestions(app_user_id,celebrity_id,kind,title,starts_at,source_url,locale,status,schedule_id,reviewed_at,idempotency_key,request_hash)values
  (me,c_unlisted,'event','[시험] 신청한 일정',from_at+interval '2 days','https://example.test/sg','ko','approved',s_suggested,now(),extensions.gen_random_uuid(),repeat('f',64));
 -- A pending suggestion has no schedule yet, so the lookalike schedule above is not mine.
 insert into public.schedule_suggestions(app_user_id,celebrity_id,kind,title,starts_at,source_url,locale,status,idempotency_key,request_hash)values
  (me,c_unlisted,'event','[시험] 신청만 한 비슷한 일정',from_at+interval '6 days','https://example.test/sg2','ko','pending',extensions.gen_random_uuid(),repeat('8',64));

 -- Me: my subscribed and my approved suggestion stay; another viewer's subscription and the untouched one do not.
 r:=public.fan_web_list_schedules(me,'ko',from_at,to_at,null,null,null,100);
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if ids<>array[s_subscribed::text,s_suggested::text,s_listed::text] then raise exception 'my cross-creator schedules wrong: %',r;end if;
 -- The other viewer keeps only theirs.
 r:=public.fan_web_list_schedules(other,'ko',from_at,to_at,null,null,null,100);
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if ids<>array[s_others::text,s_listed::text] then raise exception 'other viewer schedules wrong: %',r;end if;
 -- Guest: as 20261219050000.
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,null,null,null,100);
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if ids<>array[s_listed::text] then raise exception 'guest schedules wrong: %',r;end if;
 -- The creator's own list still shows all of its schedules to anyone.
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,'sched-mine-unlisted',null,null,100);
 if jsonb_array_length(r->'items')<>5 then raise exception 'own-creator schedules wrong: %',r;end if;
 -- Paging counts only what the viewer sees.
 r:=public.fan_web_list_schedules(me,'ko',from_at,to_at,null,null,null,2);
 if jsonb_array_length(r->'items')<>2 or r#>>'{nextCursor,id}'<>s_suggested::text then raise exception 'my paging wrong: %',r;end if;
end $$;
rollback;
