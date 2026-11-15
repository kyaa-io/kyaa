-- Admin event participant list regression.
-- Run with psql -v ON_ERROR_STOP=1 against a disposable clean-replay database. Fixtures are rolled back.
begin;
set local session_replication_role = replica; -- fixtures skip the mint/blockchain-job links the list does not read
insert into public.app_users(id,privy_user_id,verified_email,status,created_at) values
  ('ae000000-0000-4000-8000-000000000001','did:privy:ep-admin','ep-admin@byus.test','active','2020-01-01 00:00:00+00'),
  ('ae000000-0000-4000-8000-000000000002','did:privy:ep-viewer','ep-viewer@byus.test','active','2020-01-01 00:00:00+00'),
  ('ae000000-0000-4000-8000-000000000003','did:privy:ep-one','ep-one@byus.test','active','2020-01-02 00:00:00+00'),
  ('ae000000-0000-4000-8000-000000000004','did:privy:ep-two','ep-two@byus.test','active','2020-01-03 00:00:00+00'),
  ('ae000000-0000-4000-8000-000000000005','did:privy:ep-off','ep-off@byus.test','disabled','2020-01-04 00:00:00+00'),
  ('ae000000-0000-4000-8000-000000000006','did:privy:ep-plain','ep-plain@byus.test','active','2020-01-05 00:00:00+00');
insert into public.admin_allowlist(id,email,role,active) values
  ('ae000000-0000-4000-8000-000000000010','ep-admin@byus.test','viewer',true);
insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values
  ('ae000000-0000-4000-8000-000000000003','EventOne','eventone'),
  ('ae000000-0000-4000-8000-000000000004','이벤트둘','이벤트둘'),
  ('ae000000-0000-4000-8000-000000000005','Disabled','disabled');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
  ('ae100000-0000-4000-8000-000000000001','x-mission-1113','published','/x.webp',now(),'{artist}','idol'),
  ('ae100000-0000-4000-8000-000000000002','ep-other','published','/o.webp',now(),'{artist}','idol');
insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at) values
  ('ae200000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000003','ae100000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000001','2020-02-01 00:00:00+00'),
  ('ae200000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000004','ae100000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000002','2020-02-02 00:00:00+00'),
  ('ae200000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-000000000005','ae100000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000003','2020-02-03 00:00:00+00'),
  ('ae200000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000006','ae100000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000004','2020-02-04 00:00:00+00'),
  -- page-like window on ep-other is [2020-02-01, 2020-02-11): one before, one exactly at the end, one disabled member
  ('ae200000-0000-4000-8000-000000000005','ae000000-0000-4000-8000-000000000003','ae100000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000005','2020-02-10 23:59:59+00'),
  ('ae200000-0000-4000-8000-000000000006','ae000000-0000-4000-8000-000000000004','ae100000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000006','2020-01-20 00:00:00+00'),
  ('ae200000-0000-4000-8000-000000000007','ae000000-0000-4000-8000-000000000002','ae100000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000007','2020-02-11 00:00:00+00'),
  ('ae200000-0000-4000-8000-000000000008','ae000000-0000-4000-8000-000000000005','ae100000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000008','2020-02-05 00:00:00+00');
-- passport-issued window on ep-other is [2020-03-31, 2020-04-02)
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at) values
  ('ae500000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000003','ae100000-0000-4000-8000-000000000002','ae600000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000011','2020-04-01 00:00:00+00'),
  ('ae500000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000004','ae100000-0000-4000-8000-000000000001','ae600000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000012','2020-04-01 01:00:00+00'),
  ('ae500000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-000000000006','ae100000-0000-4000-8000-000000000002','ae600000-0000-4000-8000-000000000003','ae300000-0000-4000-8000-000000000013','2020-03-20 00:00:00+00'),
  ('ae500000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000005','ae100000-0000-4000-8000-000000000002','ae600000-0000-4000-8000-000000000004','ae300000-0000-4000-8000-000000000014','2020-04-01 02:00:00+00');
insert into public.signup_raffle_entries(id,app_user_id,entered_at) values
  ('ae400000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000003','2020-03-01 00:00:00+00'),
  ('ae400000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000006','2020-03-02 00:00:00+00'),
  ('ae400000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-000000000005','2020-03-03 00:00:00+00');
reset session_replication_role;

do $$
declare x jsonb; r jsonb; p1 jsonb; p2 jsonb; p3 jsonb; denied boolean := false; invalid boolean := false;
  a constant uuid := 'ae000000-0000-4000-8000-000000000001'; l constant uuid := 'ae000000-0000-4000-8000-000000000010';
begin
  x := public.list_admin_event_participants(a,l,'x-mission',null,null,null,100);
  if (x->>'total')::int<>2 or jsonb_array_length(x->'rows')<>2 or x->'next'<>'null'::jsonb then raise exception 'x mission counts only completed active members of the event creator: %',x; end if;
  if x->'rows'->0->>'nickname'<>'이벤트둘' or x->'rows'->0->>'status'<>'completed'
     or x->'rows'->0->>'signedUpAt' not like '2020-01-03%' or x->'rows'->0->>'participatedAt' not like '2020-02-02%' then
    raise exception 'x mission newest row wrong: %',x->'rows'->0; end if;
  if exists(select 1 from jsonb_array_elements(x->'rows') row where (select array_agg(k order by k) from jsonb_object_keys(row) k)<>array['id','nickname','participatedAt','signedUpAt','status']) then
    raise exception 'row exposes more than the five columns: %',x; end if;
  if x::text ~* 'byus\.test|did:privy|0x' then raise exception 'identity leaked into payload: %',x; end if;

  -- page-like: only likes completed inside [from, to) on the given page, active members only; same five columns
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,100,'ep-other','2020-02-01 00:00:00+00','2020-02-11 00:00:00+00');
  if (x->>'total')::int<>2 or jsonb_array_length(x->'rows')<>2
     or x->'rows'->0->>'id'<>'ae200000-0000-4000-8000-000000000005' or x->'rows'->1->>'id'<>'ae200000-0000-4000-8000-000000000004'
     or x->'rows'->0->>'nickname'<>'EventOne' or x->'rows'->0->>'status'<>'completed' then
    raise exception 'page-like window wrong (before, at-end or disabled like leaked): %',x; end if;
  if exists(select 1 from jsonb_array_elements(x->'rows') row where (select array_agg(k order by k) from jsonb_object_keys(row) k)<>array['id','nickname','participatedAt','signedUpAt','status']) then
    raise exception 'page-like row exposes more than the five columns: %',x; end if;
  if x::text ~* 'byus\.test|did:privy|0x' then raise exception 'identity leaked into page-like payload: %',x; end if;
  -- the X mission page through page-like reads its own likes only
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,100,'x-mission-1113','2020-01-01 00:00:00+00','2021-01-01 00:00:00+00');
  if (x->>'total')::int<>2 then raise exception 'page-like on the X mission page wrong: %',x; end if;
  -- paging inside a window
  p1 := public.list_admin_event_participants(a,l,'page-like',null,null,null,1,'ep-other','2020-02-01 00:00:00+00','2020-02-11 00:00:00+00');
  p2 := public.list_admin_event_participants(a,l,'page-like',(p1->>'asOf')::timestamptz,(p1->'next'->>'at')::timestamptz,(p1->'next'->>'id')::uuid,1,'ep-other','2020-02-01 00:00:00+00','2020-02-11 00:00:00+00');
  if (p2->>'total')::int<>2 or p2->'rows'->0->>'id'<>'ae200000-0000-4000-8000-000000000004' or p2->'next'<>'null'::jsonb then raise exception 'page-like second page wrong: %',p2; end if;
  -- unknown page and an empty window are valid, empty snapshots
  x := public.list_admin_event_participants(a,l,'page-like',null,null,null,10,'no-such-page','2020-01-01 00:00:00+00','2021-01-01 00:00:00+00');
  if (x->>'total')::int<>0 or x->'rows'<>'[]'::jsonb or x->'next'<>'null'::jsonb then raise exception 'unknown page wrong: %',x; end if;

  -- passport-issued: Passports of the given creator issued inside [from, to), active members only
  x := public.list_admin_event_participants(a,l,'passport-issued',null,null,null,100,'ep-other','2020-03-31 00:00:00+00','2020-04-02 00:00:00+00');
  if (x->>'total')::int<>1 or x->'rows'->0->>'id'<>'ae500000-0000-4000-8000-000000000001' or x->'rows'->0->>'status'<>'issued'
     or x->'rows'->0->>'participatedAt' not like '2020-04-01%' or x->'rows'->0->>'signedUpAt' not like '2020-01-02%' then
    raise exception 'passport-issued window wrong: %',x; end if;
  if x::text ~* 'byus\.test|did:privy|0x' then raise exception 'identity leaked into passport payload: %',x; end if;

  -- a read with no participants in range (reactions are append-only, so the instant is moved before them) is a valid, empty snapshot
  x := public.list_admin_event_participants(a,l,'x-mission','2019-01-01 00:00:00+00',null,null,10);
  if (x->>'total')::int<>0 or x->'rows'<>'[]'::jsonb or x->'next'<>'null'::jsonb or x->>'asOf' is null then raise exception 'empty event wrong: %',x; end if;

  -- keyset paging at one fixed instant; a participation added between pages must not shift, repeat or drop a row
  p1 := public.list_admin_event_participants(a,l,'signup-raffle',null,null,null,1);
  if (p1->>'total')::int<>2 or jsonb_array_length(p1->'rows')<>1 or p1->'rows'->0->>'nickname'<>'' or p1->'next' is null or p1->'next'='null'::jsonb then raise exception 'first page wrong: %',p1; end if;
  insert into public.signup_raffle_entries(id,app_user_id) values ('ae400000-0000-4000-8000-000000000009','ae000000-0000-4000-8000-000000000004');
  p2 := public.list_admin_event_participants(a,l,'signup-raffle',(p1->>'asOf')::timestamptz,(p1->'next'->>'at')::timestamptz,(p1->'next'->>'id')::uuid,1);
  if (p2->>'total')::int<>2 or jsonb_array_length(p2->'rows')<>1 or p2->'rows'->0->>'nickname'<>'EventOne' or p2->'next'<>'null'::jsonb then raise exception 'second page wrong (late entry leaked or shifted): %',p2; end if;
  if p1->'rows'->0->>'id'=p2->'rows'->0->>'id' then raise exception 'row repeated across pages'; end if;
  p3 := public.list_admin_event_participants(a,l,'signup-raffle',null,null,null,100);
  if (p3->>'total')::int<>3 or jsonb_array_length(p3->'rows')<>3 or p3->'rows'->0->>'id'<>'ae400000-0000-4000-8000-000000000009' then raise exception 'a fresh read must include the late entry first: %',p3; end if;
  r := public.list_admin_event_participants(a,l,'signup-raffle',(p1->>'asOf')::timestamptz,null,null,100);
  if (r->>'total')::int<>2 or jsonb_array_length(r->'rows')<>2 then raise exception 'fixed as-of read changed after a new entry: %',r; end if;

  begin perform public.list_admin_event_participants('ae000000-0000-4000-8000-000000000002',l,'x-mission',null,null,null,10);
  exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'a non-admin member read the list'; end if;
  denied := false;
  begin perform public.list_admin_event_participants(a,'ae000000-0000-4000-8000-000000000099','x-mission',null,null,null,10);
  exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'a wrong allowlist id read the list'; end if;

  begin perform public.list_admin_event_participants(a,l,'other',null,null,null,10);
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'unknown event accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'x-mission',null,null,null,1001);
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'oversized page accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'x-mission',null,now(),null,10);
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'half a cursor accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'page-like',null,null,null,10);
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'page-like without page and window accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'passport-issued',null,null,null,10,'ep-other','2020-04-02 00:00:00+00','2020-04-02 00:00:00+00');
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'empty or reversed window accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'page-like',null,null,null,10,'EP Other','2020-01-01 00:00:00+00','2021-01-01 00:00:00+00');
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'malformed page slug accepted'; end if;
  invalid := false;
  begin perform public.list_admin_event_participants(a,l,'x-mission',null,null,null,10,'ep-other',null,null);
  exception when sqlstate '22023' then invalid := true; end;
  if not invalid then raise exception 'fixed event accepted a page'; end if;
  denied := false;
  begin perform public.list_admin_event_participants('ae000000-0000-4000-8000-000000000002',l,'page-like',null,null,null,10,'ep-other','2020-01-01 00:00:00+00','2021-01-01 00:00:00+00');
  exception when sqlstate '42501' then denied := true; end;
  if not denied then raise exception 'a non-admin member read a page-like list'; end if;

  if has_function_privilege('anon','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz)','execute')
     or has_function_privilege('authenticated','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz)','execute')
     or not has_function_privilege('service_role','public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz)','execute') then
    raise exception 'only service_role may execute the list'; end if;
  if to_regprocedure('public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer)') is not null then
    raise exception 'the seven-argument list is still a separate function'; end if;
  if not exists(select 1 from pg_proc where oid='public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz)'::regprocedure
      and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'list must be security definer with an empty search_path'; end if;
end $$;
rollback;
