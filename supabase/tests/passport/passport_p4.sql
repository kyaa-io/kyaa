-- PASSPORT-RENEWAL P4 assertions (rankings, 100-jjinfan challenge). Disposable clean-chain DB only; everything rolls back.
-- Reference time: Wednesday 2026-11-04 12:00 KST. Week starts Monday 2026-11-02 00:00 KST = 2026-11-01 15:00:00 UTC. Month starts 2026-11-01 00:00 KST = 2026-10-31 15:00:00 UTC.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected error was not raised: %', expected; end if;
end $$;

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p4-'||n,'p4-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p4-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','p4','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text, at timestamptz) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'p4-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,at,j);
  set local session_replication_role = origin;
  return s;
end $$;

create function pg_temp.heart(u uuid, c uuid, at timestamptz) returns void language plpgsql as $$
begin
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
    values(c,u,1,'passport_page_claim',extensions.gen_random_uuid(),at);
end $$;

create function pg_temp.mkceleb(c uuid, slug text, ko_name text) returns void language plpgsql as $$
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,slug,'draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko',ko_name,'P4','P4'),(c,'en',ko_name||' en','P4','P4');
  update public.celebrities set status='published' where id=c;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

do $$
declare
  now_ts timestamptz := '2026-11-04 03:00:00+00';
  c1 uuid := 'f4400000-0000-4000-8000-000000000001'; c2 uuid := 'f4400000-0000-4000-8000-000000000002';
  c3 uuid := 'f4400000-0000-4000-8000-000000000003'; c4 uuid := 'f4400000-0000-4000-8000-000000000004';
  -- ub sorts BEFORE ua by id, so a tie decided by id (instead of the earlier achievement) gives the wrong order
  ua uuid := 'f4400000-0000-4000-8000-0000000000bb'; ub uuid := 'f4400000-0000-4000-8000-0000000000aa';
  uc uuid := 'f4400000-0000-4000-8000-0000000000cc'; ud uuid := 'f4400000-0000-4000-8000-0000000000dd';
  uz uuid := 'f4400000-0000-4000-8000-0000000000ee';
  r jsonb; r2 jsonb; i integer; n bigint; pass uuid; s_void uuid; fans uuid[] := '{}'; f uuid; cnt_before integer;
  fn text;
begin
  perform pg_temp.mkceleb(c1,'p4-1','경계 크리에이터');
  perform pg_temp.mkceleb(c2,'p4-2','동점 크리에이터');
  perform pg_temp.mkceleb(c3,'p4-3','백오 크리에이터');
  perform pg_temp.mkceleb(c4,'p4-4','빈 크리에이터');
  perform pg_temp.mkuser(ua,1); perform pg_temp.mkuser(ub,2); perform pg_temp.mkuser(uc,3); perform pg_temp.mkuser(ud,4); perform pg_temp.mkuser(uz,5);
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(ua,'에이','에이'),(ub,'비','비');

  -- ===== 1. Monday 00:00 KST boundary (c1) =====
  perform pg_temp.heart(ua,c1,'2026-11-01 14:59:59+00');   -- Sunday 23:59:59 KST: last week, this month
  perform pg_temp.heart(ub,c1,'2026-11-01 15:00:00+00');   -- Monday 00:00:00 KST: this week
  perform pg_temp.heart(uc,c1,'2026-10-31 14:59:59+00');   -- Oct 31 23:59:59 KST: last month
  perform pg_temp.heart(ud,c1,'2026-11-04 03:00:00+00');
  r := public.refresh_ranking_snapshots(now_ts);
  r := public.read_page_ranking(c1,'fan_contribution','week',null,now_ts);
  if jsonb_array_length(r->'rows') <> 2 then raise exception 'week boundary: expected 2 fans, got %', r->'rows'; end if;
  if exists(select 1 from jsonb_array_elements(r->'rows') e where e->>'subjectId' = ua::text) then raise exception 'week boundary: Sunday 23:59:59 KST heart leaked into the week'; end if;
  if not exists(select 1 from jsonb_array_elements(r->'rows') e where e->>'subjectId' = ub::text) then raise exception 'week boundary: Monday 00:00:00 KST heart missing'; end if;
  r := public.read_page_ranking(c1,'fan_contribution','month',null,now_ts);
  if jsonb_array_length(r->'rows') <> 3 or exists(select 1 from jsonb_array_elements(r->'rows') e where e->>'subjectId' = uc::text) then raise exception 'month boundary wrong %', r->'rows'; end if;
  r := public.read_page_ranking(c1,'fan_contribution','all',null,now_ts);
  if jsonb_array_length(r->'rows') <> 4 then raise exception 'all period wrong %', r->'rows'; end if;
  if r->>'periodStart' <> '1970-01-01' then raise exception 'all period start %', r->>'periodStart'; end if;
  r := public.read_page_ranking(c1,'fan_contribution','week',null,now_ts);
  if r->>'periodStart' <> '2026-11-02' then raise exception 'week start % is not the KST Monday', r->>'periodStart'; end if;
  r := public.read_page_ranking(c1,'fan_contribution','month',null,now_ts);
  if r->>'periodStart' <> '2026-11-01' then raise exception 'month start %', r->>'periodStart'; end if;
  -- a read one second before the Monday boundary belongs to the previous week (no snapshot yet: empty, not this week's rows)
  r := public.read_page_ranking(c1,'fan_contribution','week',null,'2026-11-01 14:59:59+00');
  if r->>'periodStart' <> '2026-10-26' or jsonb_array_length(r->'rows') <> 0 then raise exception 'previous week read wrong %', r; end if;

  -- ===== 2. ties: the earlier achievement ranks higher (c2) =====
  perform pg_temp.heart(uc,c2,'2026-11-03 01:00:00+00'); perform pg_temp.heart(uc,c2,'2026-11-03 01:00:01+00');   -- score 2
  perform pg_temp.heart(ua,c2,'2026-11-03 02:00:00+00');   -- score 1, achieved first
  perform pg_temp.heart(ub,c2,'2026-11-03 05:00:00+00');   -- score 1, achieved later; smaller id
  perform public.refresh_ranking_snapshots(now_ts);
  r := public.read_page_ranking(c2,'fan_contribution','week',ub,now_ts);
  if r->'rows'->0->>'subjectId' <> uc::text or (r->'rows'->0->>'score')::int <> 2 then raise exception 'score order wrong %', r->'rows'; end if;
  if r->'rows'->1->>'subjectId' <> ua::text or r->'rows'->2->>'subjectId' <> ub::text then raise exception 'tie must go to the earlier achiever: %', r->'rows'; end if;
  if (r->'rows'->1->>'rank')::int <> 2 or (r->'rows'->2->>'rank')::int <> 3 then raise exception 'tie ranks must be consecutive %', r->'rows'; end if;
  if r->'me'->>'subjectId' <> ub::text or (r->'me'->>'rank')::int <> 3 or not (r->'me'->>'inTop')::boolean then raise exception 'my rank wrong %', r->'me'; end if;
  if r->'rows'->1->>'nickname' <> '에이' or r->'rows'->0->>'nickname' <> 'Fan' or r->'rows'->0->>'characterId' <> 'star-pink' then raise exception 'identity fallback wrong %', r->'rows'; end if;

  -- ===== 3. conversion hearts cannot reach the ledger =====
  perform pg_temp.expect_error(format('insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id) values(%L,%L,1,%L,%L)',
    c2, ud, 'fan_heart_conversion', extensions.gen_random_uuid()), 'check constraint');

  -- ===== 4. creator ranking: order, names, hearts of the viewer =====
  r := public.read_creator_ranking('week', ua, 'ko', now_ts);
  if r->'rows'->0->>'slug' <> 'p4-2' or (r->'rows'->0->>'score')::int <> 4 then raise exception 'creator order wrong %', r->'rows'; end if;
  if r->'rows'->1->>'slug' <> 'p4-1' or (r->'rows'->1->>'score')::int <> 2 then raise exception 'creator second wrong %', r->'rows'; end if;
  if r->'rows'->0->>'name' <> '동점 크리에이터' then raise exception 'creator name wrong'; end if;
  if (r->'rows'->0->>'myHearts')::int <> 1 or (r->'rows'->1->>'myHearts')::int <> 0 then raise exception 'myHearts wrong %', r->'rows'; end if;
  r2 := public.read_creator_ranking('week', null, 'en', now_ts);
  if r2->'rows'->0->>'name' <> '동점 크리에이터 en' or r2->'rows'->0->'myHearts' <> 'null'::jsonb then raise exception 'locale or anonymous viewer wrong %', r2->'rows'->0; end if;
  r2 := public.read_creator_ranking('week', null, 'ja', now_ts);
  if r2->'rows'->0->>'name' <> '동점 크리에이터' then raise exception 'locale fallback must use ko %', r2->'rows'->0; end if;

  -- ===== 5. dukjil: void leaves the score, boundary stamp stays out (c2) =====
  pass := pg_temp.mkpass(ua,c2);
  perform pg_temp.mkstamp(ua,c2,'quiz','p4-ua-1','2026-11-03 01:00:00+00');
  s_void := pg_temp.mkstamp(ua,c2,'quiz','p4-ua-2','2026-11-03 02:00:00+00');
  perform pg_temp.mkstamp(ua,c2,'quiz','p4-ua-3','2026-11-03 03:00:00+00');
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pass,1,1,s_void,now());
  perform pg_temp.mkstamp(ub,c2,'quiz','p4-ub-1','2026-11-03 00:10:00+00');
  perform pg_temp.mkstamp(ub,c2,'quiz','p4-ub-2','2026-11-03 00:20:00+00');
  perform pg_temp.mkstamp(ub,c2,'quiz','p4-ub-0','2026-11-01 14:59:59+00');   -- last week
  perform public.refresh_ranking_snapshots(now_ts);
  r := public.read_page_ranking(c2,'dukjil','week',null,now_ts);
  if r->'rows'->0->>'subjectId' <> ua::text or (r->'rows'->0->>'score')::int <> 3 or (r->'rows'->1->>'score')::int <> 2 then raise exception 'dukjil before void wrong %', r->'rows'; end if;
  perform public.void_passport_stamp(ua,s_void,'p4 void',false,'p4-void-key');
  perform public.refresh_ranking_snapshots(now_ts);
  r := public.read_page_ranking(c2,'dukjil','week',ua,now_ts);
  if (r->'rows'->1->>'score')::int <> 2 or (r->'rows'->0->>'score')::int <> 2 then raise exception 'void must leave the dukjil score %', r->'rows'; end if;
  if r->'rows'->0->>'subjectId' <> ub::text then raise exception 'after the void the tie goes to the earlier achiever (ub) %', r->'rows'; end if;
  if (r->'me'->>'rank')::int <> 2 then raise exception 'my dukjil rank after void %', r->'me'; end if;
  perform pg_temp.expect_error(format('select public.read_page_ranking(%L,%L,%L,null,%L)',c2,'dukjil','all',now_ts),'RANKING_PERIOD_INVALID');
  perform pg_temp.expect_error(format('select public.read_page_ranking(%L,%L,%L,null,%L)',c2,'creator_hearts','week',now_ts),'RANKING_PERIOD_INVALID');
  perform pg_temp.expect_error(format('select public.read_page_ranking(%L,%L,%L,null,%L)',extensions.gen_random_uuid(),'dukjil','week',now_ts),'CREATOR_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.read_creator_ranking(%L,null,%L,%L)','year','ko',now_ts),'RANKING_PERIOD_INVALID');

  -- ===== 6. 105 fans: top 100 only, my rank outside the top 100 (c3) =====
  for i in 1..105 loop
    f := extensions.gen_random_uuid(); fans := fans || f;
    perform pg_temp.mkuser(f, 1000 + i);
    perform pg_temp.heart(f, c3, '2026-11-03 00:00:00+00'::timestamptz + (i || ' seconds')::interval);
  end loop;
  perform public.refresh_ranking_snapshots(now_ts);
  r := public.read_page_ranking(c3,'fan_contribution','week',fans[105],now_ts);
  if jsonb_array_length(r->'rows') <> 100 then raise exception 'snapshot must hold exactly 100 rows, got %', jsonb_array_length(r->'rows'); end if;
  if (r->'rows'->99->>'rank')::int <> 100 or r->'rows'->99->>'subjectId' <> fans[100]::text then raise exception 'rank 100 wrong %', r->'rows'->99; end if;
  if (r->'me'->>'rank')::int <> 105 or (r->'me'->>'inTop')::boolean or (r->'me'->>'score')::int <> 1 then raise exception 'rank outside the top 100 wrong %', r->'me'; end if;
  r := public.read_page_ranking(c3,'fan_contribution','week',fans[101],now_ts);
  if (r->'me'->>'rank')::int <> 101 then raise exception 'rank 101 wrong %', r->'me'; end if;
  r := public.read_page_ranking(c3,'fan_contribution','week',fans[1],now_ts);
  if (r->'me'->>'rank')::int <> 1 or not (r->'me'->>'inTop')::boolean then raise exception 'rank 1 wrong %', r->'me'; end if;
  r := public.read_page_ranking(c3,'fan_contribution','week',uz,now_ts);
  if r->'me' <> 'null'::jsonb then raise exception 'a fan without hearts must have no rank %', r->'me'; end if;
  -- outside the top 100 and a tie on score with a later-achieving fan: counted rows ahead must equal the snapshot order
  if (select count(*) from public.ranking_snapshots where kind='fan_contribution' and scope_id=c3) <> 3 then raise exception 'expected week, month and all snapshots for c3'; end if;

  -- ===== 7. empty state and refresh idempotence =====
  r := public.read_page_ranking(c4,'fan_contribution','week',ua,now_ts);
  if r->'rows' <> '[]'::jsonb or r->'me' <> 'null'::jsonb or r->'computedAt' <> 'null'::jsonb then raise exception 'empty page ranking wrong %', r; end if;
  r := public.read_page_ranking(c4,'dukjil','month',null,now_ts);
  if r->'rows' <> '[]'::jsonb then raise exception 'empty dukjil ranking wrong %', r; end if;
  select count(*) into cnt_before from public.ranking_snapshots;
  perform public.refresh_ranking_snapshots(now_ts);
  if (select count(*) from public.ranking_snapshots) <> cnt_before then raise exception 'refresh must be idempotent'; end if;
  if exists(select 1 from public.ranking_snapshots where kind='dukjil' and period='all') then raise exception 'dukjil all must not exist'; end if;
  if exists(select 1 from public.ranking_snapshots where jsonb_array_length(rows) > 100) then raise exception 'more than 100 rows stored'; end if;
  -- a refresh in a later week keeps the earlier week and stores nothing for a week without scores
  r := public.refresh_ranking_snapshots('2026-11-10 03:00:00+00');
  if exists(select 1 from public.ranking_snapshots where kind='fan_contribution' and scope_id=c3 and period='week' and period_start='2026-11-09') then raise exception 'an empty new week must not store a snapshot'; end if;
  if not exists(select 1 from public.ranking_snapshots where kind='fan_contribution' and scope_id=c3 and period='week' and period_start='2026-11-02') then raise exception 'earlier week snapshot was removed'; end if;
  r := public.read_page_ranking(c3,'fan_contribution','week',null,'2026-11-10 03:00:00+00');
  if r->'rows' <> '[]'::jsonb then raise exception 'new week must start empty'; end if;

  -- ===== 8. 100 jjinfan challenge: live count of active titles =====
  r := public.read_jjinfan_challenge(c4);
  if (r->>'count')::int <> 0 or (r->>'target')::int <> 100 then raise exception 'empty challenge wrong %', r; end if;
  insert into public.jjinfan_titles(app_user_id,celebrity_id) values (ua,c2),(ub,c2),(uc,c2),(ua,c1);
  r := public.read_jjinfan_challenge(c2);
  if (r->>'count')::int <> 3 then raise exception 'challenge count wrong %', r; end if;
  update public.jjinfan_titles set revoked_at = now() where app_user_id = ub and celebrity_id = c2;
  r := public.read_jjinfan_challenge(c2);
  if (r->>'count')::int <> 2 then raise exception 'a revoked title must leave the challenge count %', r; end if;
  r := public.read_creator_ranking('week', null, 'ko', now_ts);
  if (select (e->>'jjinfanCount')::int from jsonb_array_elements(r->'rows') e where e->>'slug' = 'p4-2') <> 2 then raise exception 'creator ranking jjinfanCount wrong'; end if;
  -- a disabled account must not count toward the 100 (plan 9.1: active account + title)
  update public.app_users set status='disabled' where id = uc;
  r := public.read_jjinfan_challenge(c2);
  if (r->>'count')::int <> 1 then raise exception 'a disabled account must leave the challenge count %', r; end if;
  r := public.read_creator_ranking('week', null, 'ko', now_ts);
  if (select (e->>'jjinfanCount')::int from jsonb_array_elements(r->'rows') e where e->>'slug' = 'p4-2') <> 1 then raise exception 'creator ranking jjinfanCount must skip disabled accounts'; end if;
  update public.app_users set status='active' where id = uc;
  -- a creator unpublished after the snapshot must leave the creator ranking at read time (snapshot delay)
  update public.celebrities set status = 'draft' where id = c2;
  r := public.read_creator_ranking('week', null, 'ko', now_ts);
  if exists(select 1 from jsonb_array_elements(r->'rows') e where e->>'slug' = 'p4-2') then raise exception 'an unpublished creator must not be listed from a stale snapshot'; end if;
  update public.celebrities set status = 'published' where id = c2;
  perform pg_temp.expect_error(format('select public.read_jjinfan_challenge(%L)',extensions.gen_random_uuid()),'CREATOR_NOT_FOUND');

  -- ===== 9. permissions =====
  foreach fn in array array[
    'public.refresh_ranking_snapshots(timestamptz)', 'public.read_creator_ranking(text,uuid,text,timestamptz)',
    'public.read_page_ranking(uuid,text,text,uuid,timestamptz)', 'public.read_jjinfan_challenge(uuid)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then raise exception 'anon/authenticated can execute %', fn; end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then raise exception 'service_role cannot execute %', fn; end if;
  end loop;
  foreach fn in array array[
    'public.ranking_scores(text,uuid,timestamptz,timestamptz)', 'public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)',
    'public.ranking_period_window(text,timestamptz)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'internal helper is callable from outside: %', fn; end if;
  end loop;
  if has_table_privilege('anon','public.ranking_snapshots','SELECT') or has_table_privilege('authenticated','public.ranking_snapshots','SELECT')
     or has_table_privilege('service_role','public.ranking_snapshots','SELECT') then raise exception 'ranking_snapshots must not be directly readable'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ranking_snapshots'::regclass) then raise exception 'RLS off on ranking_snapshots'; end if;
  perform pg_temp.expect_error(format('insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows) values(%L,%L,%L,%L,now(),%L)',
    'dukjil', c2, 'all', '1970-01-01', '[]'), 'ranking_snapshots_dukjil_period');
  perform pg_temp.expect_error(format('insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows) values(%L,%L,%L,%L,now(),%L)',
    'creator_hearts', c2, 'week', '2026-11-02', '[]'), 'ranking_snapshots_creator_scope');
end $$;

rollback;
