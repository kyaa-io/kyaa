-- Synthetic-only assertions for 20261219050000: the cross-creator schedule list leaves out schedules of a creator whose fan page is
-- unlisted; a listed creator and a creator without a page still show; that creator's own list (slug) and the schedule's own read keep it.
-- The window is a future month with no other rows. All changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare
 c_listed uuid:=extensions.gen_random_uuid();c_unlisted uuid:=extensions.gen_random_uuid();c_nopage uuid:=extensions.gen_random_uuid();
 s_listed uuid:=extensions.gen_random_uuid();s_unlisted uuid:=extensions.gen_random_uuid();s_nopage uuid:=extensions.gen_random_uuid();
 from_at constant timestamptz:='2031-03-01T00:00:00+09:00';to_at constant timestamptz:='2031-04-01T00:00:00+09:00';
 r jsonb;ids text[];
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
  (c_listed,'sched-listed-shown','published','/fixture.webp',now(),'{creator}','creator'),
  (c_unlisted,'sched-listed-unlisted','published','/fixture.webp',now(),'{creator}','creator'),
  (c_nopage,'sched-listed-nopage','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
  (c_listed,'ko','일정 노출 검증','요약','대체'),(c_unlisted,'ko','일정 미노출 검증','요약','대체'),(c_nopage,'ko','일정 페이지 없음 검증','요약','대체');
 insert into public.group_pages(kind,celebrity_id,name)values('fan',c_listed,'일정 노출 팬 페이지');
 insert into public.group_pages(kind,celebrity_id,name,listed)values('fan',c_unlisted,'[시험] 일정 미노출 팬 페이지',false);
 insert into public.celebrity_schedules(id,celebrity_id,kind,title_ko,title_en,starts_at,ends_at,time_zone,status,official_source_url,idempotency_key,request_hash)values
  (s_unlisted,c_unlisted,'event','[시험] 일정','[Test] schedule',from_at+interval '1 day',from_at+interval '1 day 1 hour','Asia/Seoul','published','https://example.test/s1',extensions.gen_random_uuid(),repeat('a',64)),
  (s_listed,c_listed,'event','노출 일정','Listed schedule',from_at+interval '2 days',from_at+interval '2 days 1 hour','Asia/Seoul','published','https://example.test/s2',extensions.gen_random_uuid(),repeat('b',64)),
  (s_nopage,c_nopage,'concert','페이지 없는 일정','No page schedule',from_at+interval '3 days',from_at+interval '3 days 1 hour','Asia/Seoul','cancelled','https://example.test/s3',extensions.gen_random_uuid(),repeat('c',64));

 -- Cross-creator list (/live/calendar).
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,null,null,null,100);
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if ids<>array[s_listed::text,s_nopage::text] then raise exception 'cross-creator schedules wrong: %',r;end if;
 -- The unlisted creator's own calendar and the schedule's own read keep it.
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,'sched-listed-unlisted',null,null,100);
 if jsonb_array_length(r->'items')<>1 or r#>>'{items,0,id}'<>s_unlisted::text then raise exception 'own-creator schedules wrong: %',r;end if;
 if public.fan_web_get_schedule(null,s_unlisted,'ko') is null then raise exception 'unlisted schedule detail lost';end if;
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,'sched-listed-shown',null,null,100);
 if jsonb_array_length(r->'items')<>1 or r#>>'{items,0,id}'<>s_listed::text then raise exception 'listed own-creator schedules wrong: %',r;end if;
 -- Paging still counts only shown rows.
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,null,null,null,1);
 if jsonb_array_length(r->'items')<>1 or r#>>'{items,0,id}'<>s_listed::text or r->'nextCursor' is null then raise exception 'cross-creator paging wrong: %',r;end if;
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,null,(r#>>'{nextCursor,at}')::timestamptz,(r#>>'{nextCursor,id}')::uuid,1);
 if jsonb_array_length(r->'items')<>1 or r#>>'{items,0,id}'<>s_nopage::text or r->'nextCursor'<>'null'::jsonb then raise exception 'cross-creator second page wrong: %',r;end if;

 -- Listing the page again brings its schedules back (the flag, not the data, decides).
 update public.group_pages set listed=true where celebrity_id=c_unlisted;
 r:=public.fan_web_list_schedules(null,'ko',from_at,to_at,null,null,null,100);
 if not exists(select 1 from jsonb_array_elements(r->'items') x where x->>'id'=s_unlisted::text) then raise exception 'relisted schedules missing: %',r;end if;
end $$;
rollback;
