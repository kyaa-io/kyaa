-- Admin event participants: first inbound source and totals per source (migration 20261230040000).
-- Run with psql -v ON_ERROR_STOP=1 against a disposable clean-replay database. Fixtures are rolled back.
begin;
set local session_replication_role = replica;
insert into public.app_users(id,privy_user_id,verified_email,status,created_at) values
  ('ad000000-0000-4000-8000-000000000001','did:privy:src-admin','src-admin@byus.test','active','2020-01-01'),
  ('ad000000-0000-4000-8000-000000000002','did:privy:src-u2','src-u2@byus.test','active','2020-01-02'),
  ('ad000000-0000-4000-8000-000000000003','did:privy:src-u3','src-u3@byus.test','active','2020-01-03'),
  ('ad000000-0000-4000-8000-000000000004','did:privy:src-u4','src-u4@byus.test','active','2020-01-04'),
  ('ad000000-0000-4000-8000-000000000005','did:privy:src-u5','src-u5@byus.test','active','2020-01-05'),
  ('ad000000-0000-4000-8000-000000000006','did:privy:src-u6','src-u6@byus.test','active','2020-01-06'),
  ('ad000000-0000-4000-8000-000000000007','did:privy:src-u7','src-u7@byus.test','active','2020-01-07'),
  ('ad000000-0000-4000-8000-000000000008','did:privy:src-u8','src-u8@byus.test','active','2020-01-08'),
  ('ad000000-0000-4000-8000-000000000009','did:privy:src-u9','src-u9@byus.test','active','2020-01-09');
insert into public.admin_allowlist(id,email,role,active) values ('ad000000-0000-4000-8000-000000000100','src-admin@byus.test','viewer',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('ad100000-0000-4000-8000-000000000001','ep-src','published','/s.webp',now(),'{artist}','idol');
-- participants: likes on ep-src inside the window [2020-02-01, 2020-02-11)
insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at) values
  ('ad200000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000003','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','2020-02-03 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000004','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000002','2020-02-05 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000005','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000003','2020-02-06 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-000000000006','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000004','2020-02-07 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000007','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000005','2020-02-08 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000006','ad000000-0000-4000-8000-000000000008','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000006','2020-02-09 00:00:00+00'),
  ('ad200000-0000-4000-8000-000000000007','ad000000-0000-4000-8000-000000000009','ad100000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000007','2020-02-10 00:00:00+00');
-- touches. u3: telegram/cgaa before the like, then a later x/late (first stays). u4: kol/kol1 two minutes after the like (credited).
-- u5: telegram/cgaa ten minutes after the like (too late). u6: no touch. u7: touch of another campaign. u8: telegram/cgaa.
-- u9: only a touch with a source outside the allowed values. An anonymous member-less touch is not a row of any member.
insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000003','fan_event_source.identified','tag-001-key','2020-02-02 00:00:00+00','{"source":"telegram","campaign":"elina-onboarding-1117","content":"cgaa"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000003','fan_event_source.identified','tag-002-key','2020-02-04 00:00:00+00','{"source":"x","campaign":"elina-onboarding-1117","content":"late"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000004','fan_event_source.identified','tag-003-key','2020-02-05 00:02:00+00','{"source":"kol","campaign":"elina-onboarding-1117","content":"kol1"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000005','fan_event_source.identified','tag-004-key','2020-02-06 00:10:00+00','{"source":"telegram","campaign":"elina-onboarding-1117","content":"cgaa"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000007','fan_event_source.identified','tag-005-key','2020-02-08 00:00:00+00','{"source":"telegram","campaign":"other-campaign","content":"cgaa"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000008','fan_event_source.identified','tag-006-key','2020-02-09 00:00:00+00','{"source":"telegram","campaign":"elina-onboarding-1117","content":"cgaa"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000009','fan_event_source.identified','tag-007-key','2020-02-10 00:00:00+00','{"source":"evil","campaign":"elina-onboarding-1117","content":"cgaa"}'),
  (1,'creator_page_view','ad000000-0000-4000-8000-000000000002','fan_event_source.identified','tag-008-key','2020-02-02 00:00:00+00','{"source":"kol","campaign":"elina-onboarding-1117","content":"admin1"}');
reset session_replication_role;

do $$
declare x jsonb; p1 jsonb; p2 jsonb; denied boolean := false; invalid boolean := false;
  a constant uuid := 'ad000000-0000-4000-8000-000000000001'; l constant uuid := 'ad000000-0000-4000-8000-000000000100';
  w_from constant timestamptz := '2020-02-01 00:00:00+00'; w_to constant timestamptz := '2020-02-11 00:00:00+00';
begin
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,100,'ep-src',w_from,w_to,'elina-onboarding-1117');
  if (x->>'total')::int<>7 or jsonb_array_length(x->'rows')<>7 then raise exception 'participants wrong: %',x; end if;
  if x->'sourceTotals' <> '[{"source":"telegram","content":"cgaa","count":2},{"source":"kol","content":"kol1","count":1}]'::jsonb then
    raise exception 'source totals wrong: %',x->'sourceTotals'; end if;
  if (select x->'rows' @> jsonb_build_array(jsonb_build_object('nickname','','sourceTag',jsonb_build_object('source','telegram','content','cgaa')))) is not true then
    raise exception 'first touch of the earliest link not credited: %',x->'rows'; end if;
  -- per row: u3 telegram/cgaa (the later x link never moves it), u4 kol/kol1 (within five minutes), u8 telegram/cgaa; the rest untagged
  if (select count(*) from jsonb_array_elements(x->'rows') r where r->'sourceTag' <> 'null'::jsonb)<>3 then raise exception 'tagged row count wrong: %',x->'rows'; end if;
  if exists(select 1 from jsonb_array_elements(x->'rows') r where r->>'id' in ('ad200000-0000-4000-8000-000000000003','ad200000-0000-4000-8000-000000000004','ad200000-0000-4000-8000-000000000005','ad200000-0000-4000-8000-000000000007') and r->'sourceTag' <> 'null'::jsonb) then
    raise exception 'a late, other-campaign, missing or invalid touch was credited: %',x->'rows'; end if;
  if exists(select 1 from jsonb_array_elements(x->'rows') row where (select array_agg(k order by k) from jsonb_object_keys(row) k)<>array['id','nickname','participatedAt','signedUpAt','sourceTag','status']) then
    raise exception 'row exposes more than the agreed columns: %',x; end if;
  if x::text ~* 'byus\.test|did:privy|0x|tag-0' then raise exception 'identity or event key leaked: %',x; end if;

  -- paging keeps one set of totals and the tags of each page
  p1 := public.list_admin_event_participants(a,l,'page-like',null,null,null,3,'ep-src',w_from,w_to,'elina-onboarding-1117');
  p2 := public.list_admin_event_participants(a,l,'page-like',(p1->>'asOf')::timestamptz,(p1->'next'->>'at')::timestamptz,(p1->'next'->>'id')::uuid,3,'ep-src',w_from,w_to,'elina-onboarding-1117');
  if p1->'sourceTotals' <> x->'sourceTotals' or p2->'sourceTotals' <> x->'sourceTotals' or jsonb_array_length(p1->'rows')<>3 or jsonb_array_length(p2->'rows')<>3 then
    raise exception 'paging changed totals or rows: % %',p1,p2; end if;

  -- another campaign key sees none of these touches; no campaign keeps the old shape exactly
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,100,'ep-src',w_from,w_to,'changha-onboarding-1118');
  if x->'sourceTotals'<>'[]'::jsonb or (select count(*) from jsonb_array_elements(x->'rows') r where r->'sourceTag'<>'null'::jsonb)<>0 then raise exception 'another campaign saw the tags: %',x; end if;
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,100,'ep-src',w_from,w_to);
  if x ? 'sourceTotals' or exists(select 1 from jsonb_array_elements(x->'rows') row where row ? 'sourceTag') then raise exception 'no campaign must keep the previous shape: %',x; end if;

  -- a campaign only goes with a windowed event, and must be a plain key
  begin perform public.list_admin_event_participants(a,l,'x-mission',null,null,null,10,null,null,null,'elina-onboarding-1117');
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'a fixed event accepted a campaign'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'page-like',null,null,null,10,'ep-src',w_from,w_to,'Bad Key');
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'a malformed campaign was accepted'; end if;
  begin perform public.list_admin_event_participants('ad000000-0000-4000-8000-000000000002',l,'page-like',null,null,null,10,'ep-src',w_from,w_to,'elina-onboarding-1117');
  exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'a non-admin member read the source totals'; end if;

  if has_function_privilege('anon','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text)','execute')
     or has_function_privilege('authenticated','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text)','execute')
     or not has_function_privilege('service_role','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text)','execute') then
    raise exception 'only service_role may execute the list'; end if;
end $$;
rollback;
