-- PASSPORT-RENEWAL read RPC assertions (contract §15, §10.2). Disposable clean-chain DB only; everything rolls back.
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

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'd1200000-0000-4000-8000-000000000001'; c2 uuid := 'd1200000-0000-4000-8000-000000000002';
  c3 uuid := 'd1200000-0000-4000-8000-000000000003';
  u1 uuid := 'd1200000-0000-4000-8000-000000000011'; u2 uuid := 'd1200000-0000-4000-8000-000000000012';
  u3 uuid := 'd1200000-0000-4000-8000-000000000013'; u4 uuid := 'd1200000-0000-4000-8000-000000000014';
  u5 uuid := 'd1200000-0000-4000-8000-000000000015'; nopass uuid := 'd1200000-0000-4000-8000-000000000016';
  cs uuid[] := array[c1,c2,c3]; us uuid[] := array[u1,u2,u3,u4,u5,nopass];
  i integer; t integer; r jsonb; a jsonb; n integer; today date := public.dukjil_kst_date();
  ids uuid[];
begin
  for i in 1..3 loop
    insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
      values(cs[i],'dukjil-rd-'||i,'draft','/d.webp',null,'{artist}','idol');
    insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
      (cs[i],'ko','덕질'||i,'덕질','덕질'),(cs[i],'en','Dukjil'||i,'Dukjil','Dukjil');
    update public.celebrities set status='published' where id=cs[i];
  end loop;
  for i in 1..6 loop
    insert into public.app_users(id,privy_user_id,verified_email,status)
      values(us[i],'did:privy:dukjil-rd-'||i,'dukjil-rd-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values(us[i],91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00'||lpad(i::text,2,'0'),'privy','embedded');
  end loop;
  set local session_replication_role = replica;
  for i in 1..5 loop
    for t in 1..3 loop
      insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values
        (('d1200000-0000-4000-8000-0000000'||lpad((100+i*10+t)::text,5,'0'))::uuid,'passport',
         ('d1200000-0000-4000-8000-0000000'||lpad((200+i*10+t)::text,5,'0'))::uuid,'dukjil-read-fixture-'||i||'-'||t,1,
         jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00'||lpad(i::text,2,'0'),'celebritySlug','dukjil-rd-'||t,'passportId','0x'||repeat('1',64)));
      insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values
        (('d1200000-0000-4000-8000-0000000'||lpad((200+i*10+t)::text,5,'0'))::uuid,us[i],cs[t],extensions.gen_random_uuid(),
         ('d1200000-0000-4000-8000-0000000'||lpad((100+i*10+t)::text,5,'0'))::uuid);
    end loop;
  end loop;
  set local session_replication_role = origin;

  -- ===== permissions and signature =====
  if to_regprocedure('public.read_dukjil_today(uuid)') is not null then raise exception 'old 1-arg read_dukjil_today must be gone'; end if;
  if to_regprocedure('public.read_dukjil_today(uuid,uuid)') is null or to_regprocedure('public.read_dukjil_attendance(uuid,uuid[])') is null then
    raise exception 'new read RPCs missing'; end if;
  if has_function_privilege('anon','public.read_dukjil_today(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.read_dukjil_today(uuid,uuid)','execute')
     or has_function_privilege('anon','public.read_dukjil_attendance(uuid,uuid[])','execute')
     or has_function_privilege('authenticated','public.read_dukjil_attendance(uuid,uuid[])','execute')
     or not has_function_privilege('service_role','public.read_dukjil_today(uuid,uuid)','execute')
     or not has_function_privilege('service_role','public.read_dukjil_attendance(uuid,uuid[])','execute') then
    raise exception 'read RPC grants wrong'; end if;

  -- ===== no active policy: minimal shape =====
  r := public.read_dukjil_today(u1, c1);
  if r <> jsonb_build_object('kstDate', today, 'policyActive', false) then raise exception 'inactive today shape %', r; end if;
  r := public.read_dukjil_attendance(u1, array[c1,c2]);
  if r <> jsonb_build_object('kstDate', today, 'items', '[]'::jsonb) then raise exception 'inactive attendance shape %', r; end if;

  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- ===== params =====
  select array_agg(extensions.gen_random_uuid()) into ids from generate_series(1,51);
  perform pg_temp.expect_error(format('select public.read_dukjil_attendance(%L,%L)',u1,ids),'DUKJIL_PARAMS_INVALID');
  select array_agg(extensions.gen_random_uuid()) into ids from generate_series(1,50);
  r := public.read_dukjil_attendance(u1, ids);
  if jsonb_array_length(r->'items') <> 50 then raise exception '50 items expected'; end if;
  if (r->'items'->0->>'hasPassport')::boolean then raise exception 'unknown creator must have no passport'; end if;
  perform pg_temp.expect_error(format('select public.read_dukjil_attendance(%L,%L)',u1,null::uuid[]),'DUKJIL_PARAMS_INVALID');
  perform pg_temp.expect_error(format('select public.read_dukjil_attendance(%L,%L)',u1,array[c1,null]::uuid[]),'DUKJIL_PARAMS_INVALID');
  r := public.read_dukjil_attendance(u1, '{}'::uuid[]);
  if jsonb_array_length(r->'items') <> 0 then raise exception 'empty input empty items'; end if;

  -- ===== fresh user: shape =====
  r := public.read_dukjil_today(u1, c1);
  if not (r->>'policyActive')::boolean or (r->>'totalPoints')::int <> 0 or (r->>'kstDate')::date <> today then raise exception 'fresh today %', r; end if;
  if r->'attendance' <> '{"attendedToday":false,"streak":0,"nextBonusIn":7}'::jsonb then raise exception 'fresh attendance %', r->'attendance'; end if;
  if not (r->>'hasPassport')::boolean then raise exception 'passport expected'; end if;
  if (r->'actions'->'share'->>'remaining')::int <> 3 or (r->'actions'->'share'->>'count')::int <> 0
     or (r->'actions'->'share'->>'stamped')::boolean then raise exception 'fresh share %', r->'actions'->'share'; end if;
  if (r->'actions'->'comment'->>'remaining')::int <> 10 or (r->'actions'->'reaction'->>'remaining')::int <> 5
     or (r->'actions'->'post'->>'remaining')::int <> 3 or (r->'actions'->'checkin'->>'remaining')::int <> 1 then
    raise exception 'fresh remaining %', r->'actions'; end if;
  if (r->'actions'->'quiz') ? 'remaining' and r->'actions'->'quiz'->'remaining' <> 'null'::jsonb then raise exception 'uncapped remaining must be null'; end if;
  r := public.read_dukjil_today(u1);
  if r->'attendance' <> 'null'::jsonb or r->'hasPassport' <> 'null'::jsonb then raise exception 'no-creator shape %', r; end if;
  r := public.read_dukjil_today(nopass, c1);
  if (r->>'hasPassport')::boolean then raise exception 'nopass must have no passport'; end if;

  -- ===== attendance: attendedToday, streak, creator separation =====
  perform public.attend_creator(u1, c1, extensions.gen_random_uuid());
  r := public.read_dukjil_today(u1, c1);
  if r->'attendance' <> '{"attendedToday":true,"streak":1,"nextBonusIn":6}'::jsonb then raise exception 'after attend %', r->'attendance'; end if;
  if (r->>'totalPoints')::int <> 2 or (r->'actions'->'checkin'->>'count')::int <> 1 or (r->'actions'->'checkin'->>'remaining')::int <> 0
     or not (r->'actions'->'checkin'->>'stamped')::boolean then raise exception 'checkin action %', r->'actions'->'checkin'; end if;
  r := public.read_dukjil_today(u1, c2);
  if r->'attendance' <> '{"attendedToday":false,"streak":0,"nextBonusIn":7}'::jsonb then raise exception 'creator separation %', r->'attendance'; end if;
  if (r->'actions'->'checkin'->>'remaining')::int <> 1 or (r->'actions'->'checkin'->>'stamped')::boolean then raise exception 'c2 checkin %', r->'actions'->'checkin'; end if;
  a := public.read_dukjil_attendance(u1, array[c1,c2,c3]);
  if a->'items'->0->>'celebrityId' <> c1::text or (a->'items'->0->>'attendedToday')::boolean is not true
     or (a->'items'->1->>'attendedToday')::boolean or a->'items'->2->>'celebrityId' <> c3::text then
    raise exception 'attendance batch %', a; end if;

  -- yesterday present: running streak, not attended today (KST day boundary)
  insert into public.group_creator_attendance(app_user_id,celebrity_id,attendance_date,streak,points,request_key,policy_version)
    values (u2,c1,today-1,6,2,extensions.gen_random_uuid(),1),(u2,c2,today-2,5,2,extensions.gen_random_uuid(),1);
  r := public.read_dukjil_today(u2, c1);
  if r->'attendance' <> '{"attendedToday":false,"streak":6,"nextBonusIn":1}'::jsonb then raise exception 'streak 6 %', r->'attendance'; end if;
  if (r->>'totalPoints')::int <> 0 then raise exception 'yesterday attendance must not count today'; end if;
  -- gap: attendance two days ago is broken -> 0
  r := public.read_dukjil_today(u2, c2);
  if r->'attendance' <> '{"attendedToday":false,"streak":0,"nextBonusIn":7}'::jsonb then raise exception 'broken streak %', r->'attendance'; end if;
  -- attending makes the bonus day: same streak value attend_creator returns
  a := public.attend_creator(u2, c1, extensions.gen_random_uuid());
  r := public.read_dukjil_today(u2, c1);
  if (a->>'streak')::int <> 7 or (a->>'bonusPoints')::int <> 10 then raise exception 'attend bonus %', a; end if;
  if r->'attendance' <> '{"attendedToday":true,"streak":7,"nextBonusIn":7}'::jsonb then raise exception 'streak 7 %', r->'attendance'; end if;
  if (r->>'totalPoints')::int <> 12 then raise exception 'bonus total %', r->>'totalPoints'; end if;
  -- attend_creator on a broken streak restarts at 1, as read says 0 before
  a := public.attend_creator(u2, c2, extensions.gen_random_uuid());
  if (a->>'streak')::int <> 1 then raise exception 'broken streak restart %', a; end if;

  -- ===== remaining equals the actual payout (user-wide share cap 3, creator separation) =====
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,policy_version,kst_date)
    values (u5,c1,'share','old-day',extensions.gen_random_uuid(),10,1,today-1);
  r := public.read_dukjil_today(u5, c1);
  if (r->'actions'->'share'->>'remaining')::int <> 3 or (r->'actions'->'share'->>'count')::int <> 0 then raise exception 'yesterday log leaked %', r->'actions'->'share'; end if;
  for i in 1..3 loop
    r := public.read_dukjil_today(u4, case when i=3 then c3 else c1 end);
    if (r->'actions'->'share'->>'remaining')::int <> 4 - i then raise exception 'share remaining before #% : %', i, r->'actions'->'share'; end if;
    a := public.record_dukjil_action(u4, case when i=3 then c3 else c1 end, 'share', 'rd-sh'||i, extensions.gen_random_uuid());
    if (a->>'points')::int <> 10 then raise exception 'remaining>0 must pay, #% %', i, a; end if;
  end loop;
  r := public.read_dukjil_today(u4, c2);
  if (r->'actions'->'share'->>'remaining')::int <> 0 or (r->'actions'->'share'->>'count')::int <> 3
     or (r->'actions'->'share'->>'points')::int <> 30 or (r->>'totalPoints')::int <> 30 then raise exception 'share spent %', r->'actions'->'share'; end if;
  if (r->'actions'->'share'->>'stamped')::boolean then raise exception 'c2 share stamp must be open'; end if;
  a := public.record_dukjil_action(u4, c2, 'share', 'rd-sh4', extensions.gen_random_uuid());
  if (a->>'points')::int <> 0 or not (a->>'capped')::boolean then raise exception 'remaining 0 must pay 0, %', a; end if;
  r := public.read_dukjil_today(u4, c2);
  if (r->'actions'->'share'->>'remaining')::int <> 0 or (r->>'totalPoints')::int <> 30 then raise exception 'capped payout changed totals %', r; end if;
  r := public.read_dukjil_today(u4, c1);
  if not (r->'actions'->'share'->>'stamped')::boolean then raise exception 'c1 share stamped expected'; end if;
  -- per-action independence: comment cap untouched by share cap
  r := public.read_dukjil_today(u4, c1);
  if (r->'actions'->'comment'->>'remaining')::int <> 10 then raise exception 'comment remaining %', r->'actions'->'comment'; end if;
  a := public.record_dukjil_action(u4, c1, 'comment', 'rd-cm1', extensions.gen_random_uuid(), '{"chars":12}');
  r := public.read_dukjil_today(u4, c1);
  if (a->>'points')::int <> 3 or (r->'actions'->'comment'->>'remaining')::int <> 9 or (r->>'totalPoints')::int <> 33 then
    raise exception 'comment after %', r->'actions'->'comment'; end if;
end $$;
rollback;
