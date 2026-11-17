-- PROOF-RESUBMIT-IDEMP-1117: a stored resubmit whose answer was lost is answered again from its record. Disposable clean-chain DB only; everything rolls back.
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
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p3-'||n,'p3-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xdddddddddddddddddddddddddddddddddddd'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p3-pass-'||p,1,jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0001','celebritySlug','p3','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

-- upload row owned by u for mission m (path unique per id)
create function pg_temp.mkupload(id uuid, u uuid, c uuid, m uuid, expires timestamptz default now() + interval '1 hour') returns uuid language plpgsql as $$
begin
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,expires_at)
    values(id,u,c,m,u||'/'||m||'/'||id||'.webp','image/webp',100,10,10,repeat('a',64),expires);
  return id;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f3400000-0000-4000-8000-000000000001';
  adm uuid := 'f3400000-0000-4000-8000-000000000010'; adm_al uuid := 'f3400000-0000-4000-8000-000000000011';
  ua uuid := 'f3400000-0000-4000-8000-000000000021'; ub uuid := 'f3400000-0000-4000-8000-000000000022';
  m1 uuid := 'f3400000-0000-4000-8000-0000000000a1'; rr1 uuid := 'f3400000-0000-4000-8000-0000000000b1';
  k1 uuid := 'f3400000-0000-4000-8000-0000000000d1'; k2 uuid := 'f3400000-0000-4000-8000-0000000000d2'; k3 uuid := 'f3400000-0000-4000-8000-0000000000d3';
  up1 uuid := 'f3400000-0000-4000-8000-0000000000c1'; up2 uuid := 'f3400000-0000-4000-8000-0000000000c2'; up3 uuid := 'f3400000-0000-4000-8000-0000000000c3';
  up4 uuid := 'f3400000-0000-4000-8000-0000000000c4'; up5 uuid := 'f3400000-0000-4000-8000-0000000000c5';
  h1 text := repeat('1',64); h2 text := repeat('2',64); ph text[] := array['0123456789abcdef','fedcba9876543210'];
  r jsonb; r2 jsonb; sid uuid; rev bigint; k integer := 0; ledger integer; uploads_used integer;
begin
  -- ===== fixtures: one member with a passport, a receipt mission, a submission the review sent back =====
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'p3-r1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','R','R','R'),(c1,'en','R','R','R');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'p3-10@byus.test','admin',true);
  perform pg_temp.mkpass(ua,c1); perform pg_temp.mkpass(ub,c1);
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'p3-r-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt');
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid());
  perform pg_temp.mkupload(up1,ua,c1,m1);
  r := public.submit_certification_proof(ua,c1,'receipt',up1,false,null,array['0123456789abcdef'],extensions.gen_random_uuid(),repeat('7',64));
  sid := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sid,(r->>'revision')::bigint,'changes_requested','다시 올려 주세요.');
  rev := (r->>'revision')::bigint;
  perform pg_temp.mkupload(up2,ua,c1,m1); perform pg_temp.mkupload(up3,ua,c1,m1);
  select count(*) into ledger from public.dukjil_action_log where app_user_id = ua;

  -- ===== 1. first call: the resubmit is stored once, revision +1, both photos consumed =====
  r := public.resubmit_certification_proof_keyed(ua,sid,k1,rev,array[up2,up3],ph,h1);
  if r->>'status' <> 'pending' or (r->>'replayed')::boolean or (r->>'revision')::bigint <> rev + 1 or (r->>'id')::uuid <> sid then raise exception 'first keyed resubmit wrong %', r; end if;
  select count(*) into uploads_used from public.certification_uploads where id in (up2,up3) and consumed_submission_id = sid;
  if uploads_used <> 2 then raise exception 'both photos must be consumed, got %', uploads_used; end if;
  k := k + 1;

  -- ===== 2. the answer is lost, the screen sends the same key and body again: first result, no second revision =====
  r2 := public.resubmit_certification_proof_keyed(ua,sid,k1,rev,array[up2,up3],ph,h1);
  if not (r2->>'replayed')::boolean or r2->>'status' <> 'pending' or (r2->>'id')::uuid <> sid or (r2->>'revision')::bigint <> rev + 1 then raise exception 'replay wrong %', r2; end if;
  if (select review_revision from public.certification_submissions where id = sid) <> rev + 1 then raise exception 'replay raised the revision again'; end if;
  if (select count(*) from public.certification_proof_resubmit_requests where app_user_id = ua) <> 1 then raise exception 'replay stored a second record'; end if;
  if (select count(*) from public.certification_uploads where consumed_submission_id = sid) <> 3 then raise exception 'replay consumed uploads again'; end if;
  k := k + 1;

  -- ===== 3. the same key with another body is refused; the record is not overwritten =====
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L)',ua,sid,k1,rev,array[up2,up3],ph,h2),'IDEMPOTENCY_MISMATCH');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L)',ua,extensions.gen_random_uuid(),k1,rev,array[up2,up3],ph,h1),'IDEMPOTENCY_MISMATCH');
  k := k + 1;
  if (select request_hash from public.certification_proof_resubmit_requests where app_user_id = ua and request_key = k1) <> h1 then raise exception 'record overwritten'; end if;

  -- ===== 4. another member never reads this record: same key and hash only reach the ownership check =====
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L)',ub,sid,k1,rev,array[up2,up3],ph,h1),'PROOF_NOT_FOUND');
  k := k + 1;

  -- ===== 5. the review moved on; the same key still answers the first result and changes nothing =====
  r := public.review_certification_proof(adm,sid,rev + 1,'in_review');
  r2 := public.resubmit_certification_proof_keyed(ua,sid,k1,rev,array[up2,up3],ph,h1);
  if not (r2->>'replayed')::boolean or (r2->>'revision')::bigint <> rev + 1 or r2->>'status' <> 'pending' then raise exception 'late replay wrong %', r2; end if;
  if (select status::text||(review_revision)::text from public.certification_submissions where id = sid) <> 'in_review'||(rev + 2)::text then raise exception 'late replay touched the submission'; end if;
  k := k + 1;

  -- ===== 6. a new key still goes through the optimistic revision check, and a failed call leaves no record =====
  r := public.review_certification_proof(adm,sid,rev + 2,'changes_requested','한 번 더 고쳐 주세요.');
  perform pg_temp.mkupload(up4,ua,c1,m1); perform pg_temp.mkupload(up5,ua,c1,m1);
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L)',ua,sid,k2,rev,array[up4],array[ph[1]],h2),'REVISION_CONFLICT');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L,true)',ua,sid,k2,(r->>'revision')::bigint,array[up4],array[ph[1]],h2),'PROOF_PII_DETECTED');
  k := k + 1;
  if exists (select 1 from public.certification_proof_resubmit_requests where request_key = k2) then raise exception 'a failed resubmit left a record'; end if;
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof_keyed(%L,%L,%L,%L,%L,%L,%L)',ua,sid,k2,(r->>'revision')::bigint,array[up4],ph,h2),'PROOF_INVALID');
  k := k + 1;
  r2 := public.resubmit_certification_proof_keyed(ua,sid,k2,(r->>'revision')::bigint,array[up4,up5],ph,h2);
  if (r2->>'replayed')::boolean or (r2->>'revision')::bigint <> (r->>'revision')::bigint + 1 then raise exception 'second resubmit wrong %', r2; end if;
  k := k + 1;

  -- ===== 7. no payout from a resubmit or its replay =====
  if (select count(*) from public.dukjil_action_log where app_user_id = ua) <> ledger then raise exception 'resubmit wrote to the action ledger'; end if;
  k := k + 1;

  -- ===== 8. the record holds no photo, path or token; nobody but the function reads it =====
  if (select array_agg(attname::text order by attname::text) from pg_attribute where attrelid = 'public.certification_proof_resubmit_requests'::regclass and attnum > 0 and not attisdropped)
     <> array['app_user_id','created_at','request_hash','request_key','result_revision','submission_id'] then raise exception 'record columns changed'; end if;
  if has_table_privilege('anon','public.certification_proof_resubmit_requests','SELECT') or has_table_privilege('authenticated','public.certification_proof_resubmit_requests','SELECT')
     or has_table_privilege('service_role','public.certification_proof_resubmit_requests','SELECT')
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.certification_proof_resubmit_requests'::regclass) then raise exception 'record table is readable'; end if;
  if has_function_privilege('anon','public.resubmit_certification_proof_keyed(uuid,uuid,uuid,bigint,uuid[],text[],text,boolean,text)','EXECUTE')
     or has_function_privilege('authenticated','public.resubmit_certification_proof_keyed(uuid,uuid,uuid,bigint,uuid[],text[],text,boolean,text)','EXECUTE')
     or not has_function_privilege('service_role','public.resubmit_certification_proof_keyed(uuid,uuid,uuid,bigint,uuid[],text[],text,boolean,text)','EXECUTE') then raise exception 'keyed function grants wrong'; end if;
  k := k + 1;

  raise notice 'proof resubmit request key: % assertion groups passed', k;
end $$;

select 'proof resubmit request key verification passed' as result;
rollback;
