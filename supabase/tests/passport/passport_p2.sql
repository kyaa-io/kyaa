-- PASSPORT-RENEWAL P2 assertions (contract section 9 P2 tests 1-8 + room entry). Disposable clean-chain DB only; everything rolls back.
-- No migration activates Tier policy v3: this test activates it inside the transaction.
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
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p2-'||n,'p2-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p2-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','p2','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text, at timestamptz) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'p2-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,at,j);
  set local session_replication_role = origin;
  return s;
end $$;

-- fill n slots of a page with fixture stamps (slots 1..n)
create function pg_temp.fill(u uuid, c uuid, pass uuid, pg integer, n integer) returns void language plpgsql as $$
declare i integer; s uuid;
begin
  for i in 1..n loop
    s := pg_temp.mkstamp(u, c, 'quiz', 'fill-'||pg||'-'||i||'-'||pass, now() - interval '3 days');
    insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pass,pg,i,s,now());
  end loop;
end $$;

create function pg_temp.hearts(u uuid, c uuid, n integer) returns void language plpgsql as $$
declare i integer;
begin
  for i in 1..n loop
    insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id) values(c,u,1,'passport_page_claim',extensions.gen_random_uuid());
  end loop;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f2200000-0000-4000-8000-000000000001'; c2 uuid := 'f2200000-0000-4000-8000-000000000002';
  adm uuid := 'f2200000-0000-4000-8000-000000000010';
  ua uuid := 'f2200000-0000-4000-8000-000000000011'; ub uuid := 'f2200000-0000-4000-8000-000000000012';
  uc uuid := 'f2200000-0000-4000-8000-000000000013'; ud uuid := 'f2200000-0000-4000-8000-000000000014';
  ue uuid := 'f2200000-0000-4000-8000-000000000015'; stranger uuid := 'f2200000-0000-4000-8000-000000000016';
  ut uuid := 'f2200000-0000-4000-8000-000000000017'; us3 uuid := 'f2200000-0000-4000-8000-000000000018';
  us6 uuid := 'f2200000-0000-4000-8000-000000000019'; ug uuid := 'f2200000-0000-4000-8000-00000000001a';
  uh uuid := 'f2200000-0000-4000-8000-00000000001b'; unon uuid := 'f2200000-0000-4000-8000-00000000001c';
  v0 uuid := 'f2200000-0000-4000-8000-000000000020'; v8 uuid := 'f2200000-0000-4000-8000-000000000021';
  v9 uuid := 'f2200000-0000-4000-8000-000000000022'; v17 uuid := 'f2200000-0000-4000-8000-000000000023';
  v18 uuid := 'f2200000-0000-4000-8000-000000000024';
  pa uuid; pb uuid; pc uuid; pd uuid; pe uuid; pt uuid; p3 uuid; p6 uuid; pg_ uuid; ph uuid;
  vs uuid[]; vn integer[] := array[0,8,9,17,18]; vexp integer[] := array[0,0,1,1,2]; vrem integer[] := array[0,8,0,8,0];
  i integer; j integer; n integer; r jsonb; r2 jsonb; s1 uuid; s2 uuid; s3 uuid; bal bigint; hs integer[] := array[0,1,7,8,10,11,13,14,27,28];
  keys text[] := array['bronze-1','gold-1','gold-1','gold-2','gold-2','gold-3','gold-3','platinum-1','platinum-4','diamond-1'];
  tiers text[] := array['Bronze','Gold','Gold','Gold','Gold','Gold','Gold','Platinum','Platinum','Diamond'];
  have integer := 0; stamp_hash text; stamp_cnt integer; hash2 text; page uuid := 'f2200000-0000-4000-8000-0000000000a1';
  ugain uuid := 'f2200000-0000-4000-8000-000000000030'; uspent uuid := 'f2200000-0000-4000-8000-000000000031'; uearn uuid := 'f2200000-0000-4000-8000-000000000032';
  unopass uuid := 'f2200000-0000-4000-8000-000000000033'; uvoid uuid := 'f2200000-0000-4000-8000-000000000034';
  pvoid uuid; pearn uuid; lid uuid; sq1 bigint; sq2 bigint; cnt integer; seqn bigint; tot numeric;
  room_g uuid := 'f2200000-0000-4000-8000-0000000000b1'; room_s2 uuid := 'f2200000-0000-4000-8000-0000000000b2'; room_m uuid := 'f2200000-0000-4000-8000-0000000000b3';
begin
  -- ===== fixtures =====
  for i in 1..2 loop
    insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
      values((array[c1,c2])[i],'p2-'||i,'draft','/d.webp',null,'{artist}','idol');
    insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
      ((array[c1,c2])[i],'ko','P2'||i,'P2','P2'),((array[c1,c2])[i],'en','P2 '||i,'P2','P2');
    update public.celebrities set status='published' where id=(array[c1,c2])[i];
  end loop;
  perform pg_temp.mkuser(adm,10);
  perform pg_temp.mkuser(ua,11); perform pg_temp.mkuser(ub,12); perform pg_temp.mkuser(uc,13); perform pg_temp.mkuser(ud,14);
  perform pg_temp.mkuser(ue,15); perform pg_temp.mkuser(stranger,16); perform pg_temp.mkuser(ut,17); perform pg_temp.mkuser(us3,18);
  perform pg_temp.mkuser(us6,19); perform pg_temp.mkuser(ug,26); perform pg_temp.mkuser(uh,27); perform pg_temp.mkuser(unon,28);
  pa := pg_temp.mkpass(ua,c1); pb := pg_temp.mkpass(ub,c1); pc := pg_temp.mkpass(uc,c1); pd := pg_temp.mkpass(ud,c1); pe := pg_temp.mkpass(ue,c1);
  pt := pg_temp.mkpass(ut,c1); p3 := pg_temp.mkpass(us3,c1); p6 := pg_temp.mkpass(us6,c1); pg_ := pg_temp.mkpass(ug,c1); ph := pg_temp.mkpass(uh,c1);
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- ===== slots: assign, replay, overflow =====
  r := public.assign_passport_stamp(ua,c1,'quiz','p2-quiz-1');
  if (r->>'pageNo')::int <> 1 or (r->>'slotNo')::int <> 1 or (r->>'replayed')::boolean then raise exception 'quiz slot wrong %', r; end if;
  r2 := public.assign_passport_stamp(ua,c1,'quiz','p2-quiz-1');
  if not (r2->>'replayed')::boolean or r2->>'stampId' <> r->>'stampId' then raise exception 'assign replay wrong %', r2; end if;
  r := public.assign_passport_stamp(ua,c1,'post','p2-post-1');
  if (r->>'slotNo')::int <> 3 then raise exception 'post slot wrong %', r; end if;
  r := public.assign_passport_stamp(ua,c1,'quiz','p2-quiz-2');  -- same kind, same day, daily limit reached: no overflow
  if r->>'pageNo' is not null or (r->>'overflow')::boolean then raise exception 'second stamp of the day must not overflow %', r; end if;
  perform pg_temp.expect_error(format('select public.assign_passport_stamp(%L,%L,%L,%L)',stranger,c1,'quiz','p2-quiz-x'),'PASSPORT_REQUIRED');

  s1 := pg_temp.mkstamp(ub,c1,'quiz','p2-old-quiz',now() - interval '2 days');
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pb,1,1,s1,now());
  r := public.assign_passport_stamp(ub,c1,'quiz','p2-quiz-today');
  if (r->>'pageNo')::int <> 2 or (r->>'slotNo')::int <> 1 or not (r->>'overflow')::boolean then raise exception 'overflow wrong %', r; end if;

  -- ===== claim: incomplete, jjinfan lock, replay, one heart =====
  perform pg_temp.fill(uc,c1,pc,1,8);
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,1,%L)',uc,c1,'claim-uc-0'),'PASSPORT_PAGE_NOT_COMPLETE');
  perform pg_temp.fill(ud,c1,pd,2,9);
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,2,%L)',ud,c1,'claim-ud-2'),'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN');
  s1 := pg_temp.mkstamp(uc,c1,'proof','p2-proof-uc',now() - interval '3 days');
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pc,1,9,s1,now());
  r := public.claim_passport_page(uc,c1,1,'claim-uc-1');
  if (r->>'hearts')::int <> 1 or not (r->>'jjinfanConfirmed')::boolean or (r->>'replayed')::boolean then raise exception 'claim wrong %', r; end if;
  r2 := public.claim_passport_page(uc,c1,1,'claim-uc-1');
  if not (r2->>'replayed')::boolean then raise exception 'claim replay wrong %', r2; end if;
  select count(*) into n from public.creator_heart_ledger where app_user_id=uc and celebrity_id=c1;
  if n <> 1 then raise exception 'replay minted % hearts', n; end if;
  if not exists(select 1 from public.jjinfan_titles where app_user_id=uc and celebrity_id=c1 and revoked_at is null) then raise exception 'jjinfan title missing'; end if;
  if public.passport_hearts(uc,c1) <> 1 then raise exception 'passport_hearts wrong'; end if;
  perform pg_temp.expect_error('update public.creator_heart_ledger set amount = 1','PASSPORT_TABLE_IMMUTABLE');
  perform pg_temp.expect_error('delete from public.passport_page_claims','PASSPORT_TABLE_IMMUTABLE');
  -- page 2 after the title exists: needs 9 slots on page 2
  perform pg_temp.fill(uc,c1,pc,2,9);
  r := public.claim_passport_page(uc,c1,2,'claim-uc-2');
  if public.passport_hearts(uc,c1) <> 2 then raise exception 'second page heart missing'; end if;

  -- ===== void: refill, correction, rights_spent, sanction, authority =====
  s1 := pg_temp.mkstamp(ue,c1,'quiz','p2-void-1',now());
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pe,1,1,s1,now());
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,false,%L)',stranger,s1,'x','void-key-0'),'ADMIN_REQUIRED');
  r := public.void_passport_stamp(ue,s1,'owner void',false,'void-key-1');
  if r->>'pointCorrection' <> 'none' or (r->>'replayed')::boolean then raise exception 'void wrong %', r; end if;
  if exists(select 1 from public.passport_page_slots where passport_id=pe and stamp_id=s1) or not exists(select 1 from public.community_stamps where id=s1 and revoked_at is not null) then
    raise exception 'void did not clear the slot'; end if;
  r2 := public.void_passport_stamp(ue,s1,'owner void',false,'void-key-1');
  if not (r2->>'replayed')::boolean then raise exception 'void replay wrong %', r2; end if;
  r := public.assign_passport_stamp(ue,c1,'quiz','p2-refill');
  if (r->>'pageNo')::int <> 1 or (r->>'slotNo')::int <> 1 then raise exception 'refill must reuse the cleared slot %', r; end if;
  -- point correction: corrected when the points are still there, review/rights_spent when spent
  perform public.group_wallet_post(ue,'fan_point',100::bigint,'dukjil_action',extensions.gen_random_uuid());
  s2 := pg_temp.mkstamp(ue,c1,'post','p2-void-2',now());
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,policy_version,kst_date)
    values(ue,c1,'post','p2-void-2',extensions.gen_random_uuid(),20,s2,1,public.dukjil_kst_date());
  bal := public.group_wallet_balance(ue,'fan_point');
  r := public.void_passport_stamp(ue,s2,'correct',false,'void-key-2');
  if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(ue,'fan_point') <> bal - 20 then raise exception 'correction wrong % bal %', r, public.group_wallet_balance(ue,'fan_point'); end if;
  s3 := pg_temp.mkstamp(ue,c1,'comment','p2-void-3',now());
  insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,policy_version,kst_date)
    values(ue,c1,'comment','p2-void-3',extensions.gen_random_uuid(),100000,s3,1,public.dukjil_kst_date());
  r := public.void_passport_stamp(ue,s3,'spent',false,'void-key-3');
  if r->>'pointCorrection' <> 'review' or not exists(select 1 from public.passport_stamp_voids where stamp_id=s3 and review_reason='rights_spent') then raise exception 'rights_spent wrong %', r; end if;
  s1 := pg_temp.mkstamp(uc,c1,'comment','p2-void-sanction',now());
  -- M3: the owner cannot sanction (title revocation is admin only); the owner's plain void stays allowed (checked above)
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',uc,s1,'sanction','void-key-4a'),'ADMIN_REQUIRED');
  if exists(select 1 from public.passport_stamp_voids where stamp_id=s1) or not exists(select 1 from public.jjinfan_titles where app_user_id=uc and celebrity_id=c1 and revoked_at is null) then
    raise exception 'a refused sanction changed something'; end if;
  insert into public.admin_allowlist(email,role,active) values('p2-10@byus.test','operator',true);
  r := public.void_passport_stamp(adm,s1,'sanction',true,'void-key-4');
  if not (r->>'jjinfanRevoked')::boolean or exists(select 1 from public.jjinfan_titles where app_user_id=uc and celebrity_id=c1 and revoked_at is null) then raise exception 'sanction did not revoke the title %', r; end if;

  -- ===== M4: a deduction row after the grant blocks the clawback, even when other points cover the balance =====
  perform pg_temp.mkuser(uspent,47); perform pg_temp.mkuser(ugain,48); perform pg_temp.mkuser(uvoid,49);
  for i in 1..2 loop
    lid := public.group_wallet_post((array[uspent,ugain])[i],'fan_point',20::bigint,'dukjil_action',extensions.gen_random_uuid());
    s1 := pg_temp.mkstamp((array[uspent,ugain])[i],c1,'post','p2-m4-'||i,now());
    insert into public.dukjil_action_log(app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,policy_version,kst_date,ledger_id)
      values((array[uspent,ugain])[i],c1,'post','p2-m4-'||i,extensions.gen_random_uuid(),20,s1,1,public.dukjil_kst_date(),lid);
    if i = 1 then
      perform public.group_wallet_post(uspent,'fan_point',-5::bigint,'group_exchange',extensions.gen_random_uuid());   -- deduction after the grant
    end if;
    perform public.group_wallet_post((array[uspent,ugain])[i],'fan_point',500::bigint,'dukjil_action',extensions.gen_random_uuid());   -- other points: balance would cover the 20
  end loop;
  select s.id into s1 from public.community_stamps s where s.app_user_id=uspent and s.source_key='p2-m4-1';
  bal := public.group_wallet_balance(uspent,'fan_point');
  r := public.void_passport_stamp(uspent,s1,'m4 spent',false,'void-key-m4-1');
  if r->>'pointCorrection' <> 'review' or not exists(select 1 from public.passport_stamp_voids where stamp_id=s1 and review_reason='rights_spent')
     or public.group_wallet_balance(uspent,'fan_point') <> bal then raise exception 'M4 deduction present must not claw back %', r; end if;
  select s.id into s2 from public.community_stamps s where s.app_user_id=ugain and s.source_key='p2-m4-2';
  bal := public.group_wallet_balance(ugain,'fan_point');
  r := public.void_passport_stamp(ugain,s2,'m4 free',false,'void-key-m4-2');
  if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(ugain,'fan_point') <> bal - 20 then raise exception 'M4 no deduction must claw back %', r; end if;
  select coalesce(sum(amount),0), max(owner_sequence), count(*) into tot, seqn, cnt from public.mobile_fan_economy_ledger where app_user_id=ugain and celebrity_id is null and asset='fan_point';
  if tot <> public.group_wallet_balance(ugain,'fan_point') or seqn <> cnt then raise exception 'M4 ledger total % / sequence % / rows % inconsistent', tot, seqn, cnt; end if;

  -- ===== PR-P2-DB-4: earn RPCs place the stamp in the same transaction =====
  perform pg_temp.mkuser(uearn,50); perform pg_temp.mkuser(unopass,51);
  pearn := pg_temp.mkpass(uearn,c1);
  r := public.attend_creator(uearn,c1,extensions.gen_random_uuid());
  select slot_no into n from public.passport_page_slots where passport_id=pearn and page_no=1 and stamp_id is not null;
  if n is distinct from 2 then raise exception 'attend must fill slot 2, got %', n; end if;
  -- replay of the same attendance (same day) must not add a second slot
  begin perform public.attend_creator(uearn,c1,extensions.gen_random_uuid()); exception when others then null; end;
  select count(*) into n from public.passport_page_slots where passport_id=pearn and stamp_id is not null;
  if n <> 1 then raise exception 'attend replay changed slots: %', n; end if;
  r := public.record_dukjil_action(uearn,c1,'share','p2-earn-share',extensions.gen_random_uuid(),'{}'::jsonb);
  r := public.record_dukjil_action(uearn,c1,'comment','p2-earn-comment','f2200000-0000-4000-8000-0000000000c1'::uuid,'{"chars":12}'::jsonb);
  select string_agg(slot_no::text, ',' order by slot_no) into stamp_hash from public.passport_page_slots where passport_id=pearn and stamp_id is not null;
  if stamp_hash <> '2,4,5' then raise exception 'earn chain slots wrong: %', stamp_hash; end if;
  -- same source_key again: no second stamp, no second slot
  r := public.record_dukjil_action(uearn,c1,'comment','p2-earn-comment','f2200000-0000-4000-8000-0000000000c1'::uuid,'{"chars":12}'::jsonb);
  select count(*) into n from public.passport_page_slots where passport_id=pearn and stamp_id is not null;
  if n <> 3 then raise exception 'same source_key must not add a slot: %', n; end if;
  -- a second comment the same day: stamp kept, no slot, no error (daily limit)
  r := public.record_dukjil_action(uearn,c1,'comment','p2-earn-comment-2',extensions.gen_random_uuid(),'{"chars":12}'::jsonb);
  select count(*) into n from public.passport_page_slots where passport_id=pearn and stamp_id is not null;
  if n <> 3 then raise exception 'second same-day comment must not take a slot: %', n; end if;
  -- fill the remaining page-1 slots by fixture (1,3,6,7,8,9) and claim
  foreach i in array array[1,3,6,7,8,9] loop
    s1 := pg_temp.mkstamp(uearn,c1,'quiz','p2-earn-fill-'||i,now() - interval '3 days');
    insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pearn,1,i,s1,now());
  end loop;
  r := public.claim_passport_page(uearn,c1,1,'claim-uearn-1');
  if (r->>'hearts')::int <> 1 or public.passport_hearts(uearn,c1) <> 1 then raise exception 'earn chain claim wrong %', r; end if;
  -- a user without a passport: the earn RPC refuses (P1 rule) and leaves no stamp and no slot
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L::jsonb)',unopass,c1,'share','p2-nopass-share',extensions.gen_random_uuid(),'{}'),'PASSPORT_REQUIRED');
  if exists(select 1 from public.community_stamps where app_user_id=unopass and source_key='p2-nopass-share') then raise exception 'no-passport earn left a stamp'; end if;
  -- the roadmap reports the title flag
  r := public.read_passport_roadmap(uearn,c1);
  if not (r ? 'jjinfan') then raise exception 'roadmap must carry jjinfan %', r; end if;

  -- ===== PR-P2-DB-6 (review 3): steady_checkin is issued by the real attendance flow, once, into slot 8 =====
  declare
    usteady uuid := 'f2200000-0000-4000-8000-000000000060'; ushort uuid := 'f2200000-0000-4000-8000-000000000061';
    uatt uuid := 'f2200000-0000-4000-8000-000000000062'; uatt2 uuid := 'f2200000-0000-4000-8000-000000000063';
    usanc uuid := 'f2200000-0000-4000-8000-000000000064';
    pst uuid; psh uuid; pat uuid; pat2 uuid; psc uuid; d date := public.dukjil_kst_date(); sid uuid; ck uuid; pts integer; b0 bigint; b1 bigint;
    s_a uuid; s_b uuid; need integer;
  begin
    select nullif(x ->> 'days','')::integer into need from public.dukjil_policy_versions v, jsonb_array_elements(v.mission_book #> '{pages,0,slots}') x
     where v.version = (select version from public.passport_policy_row()) and x ->> 'action' = 'steady_checkin';
    if need is distinct from 3 then raise exception 'plan value for steady_checkin must stay 3, got %', need; end if;
    perform pg_temp.mkuser(usteady,60); perform pg_temp.mkuser(ushort,61);
    pst := pg_temp.mkpass(usteady,c1); psh := pg_temp.mkpass(ushort,c1);
    -- two earlier, NON consecutive attendance days (fixtures: the KST date helper cannot be moved; update/delete are blocked)
    foreach i in array array[3,5] loop
      sid := pg_temp.mkstamp(usteady,c1,'daily_checkin','daily-checkin:'||c1::text||':'||(d - i)::text, now() - (i||' days')::interval);
      insert into public.group_creator_attendance(app_user_id,celebrity_id,attendance_date,streak,points,stamp_id,request_key,policy_version)
        values(usteady,c1,d - i,1,10,sid,extensions.gen_random_uuid(),1);
    end loop;
    sid := pg_temp.mkstamp(ushort,c1,'daily_checkin','daily-checkin:'||c1::text||':'||(d - 4)::text, now() - interval '4 days');
    insert into public.group_creator_attendance(app_user_id,celebrity_id,attendance_date,streak,points,stamp_id,request_key,policy_version)
      values(ushort,c1,d - 4,1,10,sid,extensions.gen_random_uuid(),1);
    -- below the plan value: 1 earlier day + today = 2 days, no steady stamp
    r := public.attend_creator(ushort,c1,extensions.gen_random_uuid());
    if exists(select 1 from public.community_stamps where app_user_id=ushort and kind='steady_checkin') then raise exception 'steady stamp issued at 2 days'; end if;
    -- 3rd cumulative day through the real RPC
    r := public.attend_creator(usteady,c1,extensions.gen_random_uuid());
    select count(*) into n from public.community_stamps where app_user_id=usteady and kind='steady_checkin';
    if n <> 1 then raise exception 'steady stamp count after the 3rd day: %', n; end if;
    select st.id into sid from public.community_stamps st where st.app_user_id=usteady and st.kind='steady_checkin';
    select slot_no into n from public.passport_page_slots where passport_id=pst and page_no=1 and stamp_id=sid;
    if n is distinct from 8 then raise exception 'steady stamp must sit in slot 8, got %', n; end if;
    -- replays and a new request the same day add nothing
    r2 := public.attend_creator(usteady,c1,extensions.gen_random_uuid());
    if not (r2->>'replayed')::boolean then raise exception 'same-day attend must replay %', r2; end if;
    if public.passport_issue_steady_checkin(usteady,c1) is distinct from sid then raise exception 'steady issuer is not idempotent'; end if;
    select count(*) into n from public.community_stamps where app_user_id=usteady and kind='steady_checkin';
    if n <> 1 then raise exception 'duplicate steady stamp: %', n; end if;
    -- actions through their own RPCs, remaining slots by the same fixture path the earn chain uses, then page 1 claims 9/9 with its heart
    r := public.record_dukjil_action(usteady,c1,'share','p2-steady-share',extensions.gen_random_uuid(),'{}'::jsonb);
    r := public.record_dukjil_action(usteady,c1,'comment','p2-steady-comment',extensions.gen_random_uuid(),'{"chars":12}'::jsonb);
    foreach i in array array[1,3,6,7,9] loop
      sid := pg_temp.mkstamp(usteady,c1,'quiz','p2-steady-fill-'||i,now() - interval '3 days');
      insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pst,1,i,sid,now());
    end loop;
    select count(*) into n from public.passport_page_slots where passport_id=pst and page_no=1 and stamp_id is not null;
    if n <> 9 then raise exception 'page 1 must be 9/9 through attend+actions, got %', n; end if;
    r := public.claim_passport_page(usteady,c1,1,'claim-steady-1');
    if (r->>'hearts')::int <> 1 or public.passport_hearts(usteady,c1) <> 1 then raise exception 'steady page claim wrong %', r; end if;

    -- ===== review 4: voiding a check-in stamp takes the attendance grant back (3.5 rule) or leaves a review record =====
    perform pg_temp.mkuser(uatt,62); perform pg_temp.mkuser(uatt2,63); pat := pg_temp.mkpass(uatt,c1); pat2 := pg_temp.mkpass(uatt2,c1);
    r := public.attend_creator(uatt,c1,extensions.gen_random_uuid());
    sid := (r->>'stampId')::uuid; pts := (r->>'points')::int;
    b0 := public.group_wallet_balance(uatt,'fan_point');
    r := public.void_passport_stamp(uatt,sid,'attendance void',false,'void-key-att-1');
    if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(uatt,'fan_point') <> b0 - pts then raise exception 'attendance grant not taken back %', r; end if;
    r2 := public.void_passport_stamp(uatt,sid,'attendance void',false,'void-key-att-1');
    if not (r2->>'replayed')::boolean or public.group_wallet_balance(uatt,'fan_point') <> b0 - pts then raise exception 'attendance void replay clawed back twice %', r2; end if;
    r := public.attend_creator(uatt2,c1,extensions.gen_random_uuid());
    sid := (r->>'stampId')::uuid;
    perform public.group_wallet_post(uatt2,'fan_point',-1::bigint,'group_exchange',extensions.gen_random_uuid());   -- a deduction after the grant
    b0 := public.group_wallet_balance(uatt2,'fan_point');
    r := public.void_passport_stamp(uatt2,sid,'attendance spent',false,'void-key-att-2');
    if r->>'pointCorrection' <> 'review' or public.group_wallet_balance(uatt2,'fan_point') <> b0
       or not exists(select 1 from public.passport_stamp_voids where stamp_id=sid and point_correction='review' and review_reason='rights_spent') then
      raise exception 'spent attendance grant must stay as a review record %', r; end if;

    -- ===== review 5: an admin void works on an inactive (and sanctioned) target; ordinary wallet writes keep the active check =====
    perform pg_temp.mkuser(usanc,64); psc := pg_temp.mkpass(usanc,c1);
    r := public.attend_creator(usanc,c1,extensions.gen_random_uuid());
    s_a := (r->>'stampId')::uuid; pts := (r->>'points')::int;
    s_b := pg_temp.mkstamp(usanc,c1,'quiz','p2-sanc-b',now());
    insert into public.jjinfan_titles(app_user_id,celebrity_id) values(usanc,c1);
    update public.app_users set status='disabled' where id=usanc;
    perform pg_temp.expect_error(format('select public.group_wallet_post(%L,%L,%L::bigint,%L,%L)',usanc,'fan_point',5,'group_exchange',extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
    perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,false,%L)',usanc,s_b,'owner on disabled','void-key-sanc-0'),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
    -- wallet feature off: the whole void is refused with the release code, nothing is written
    update public.group_wallet_release set enabled = false;
    perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',adm,s_a,'wallet off','void-key-sanc-off'),'GROUP_WALLET_UNAVAILABLE');
    update public.group_wallet_release set enabled = true;
    if exists(select 1 from public.passport_stamp_voids where stamp_id=s_a) or exists(select 1 from public.community_stamps where id=s_a and revoked_at is not null) then
      raise exception 'a refused void changed something'; end if;
    b0 := public.group_wallet_balance(usanc,'fan_point');
    r := public.void_passport_stamp(adm,s_a,'sanction inactive',true,'void-key-sanc-1');
    if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(usanc,'fan_point') <> b0 - pts then raise exception 'inactive target clawback wrong %', r; end if;
    if not (r->>'jjinfanRevoked')::boolean or exists(select 1 from public.jjinfan_titles where app_user_id=usanc and celebrity_id=c1 and revoked_at is null) then
      raise exception 'inactive target title not revoked %', r; end if;
    if not exists(select 1 from public.community_stamps where id=s_a and revoked_at is not null) then raise exception 'inactive target stamp not voided'; end if;
    perform pg_temp.expect_error(format('select public.group_wallet_post(%L,%L,%L::bigint,%L,%L)',usanc,'fan_point',5,'group_exchange',extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');

    -- ===== PR-P2-DB-7: same admin void on an account restricted by moderation (status stays active) =====
    declare
      umod uuid := 'f2200000-0000-4000-8000-000000000065'; pmod uuid; m_a uuid; m_b uuid; mpts integer; mb0 bigint; adm_row uuid; rep uuid;
    begin
      perform pg_temp.mkuser(umod,65); pmod := pg_temp.mkpass(umod,c1);
      r := public.attend_creator(umod,c1,extensions.gen_random_uuid());
      m_a := (r->>'stampId')::uuid; mpts := (r->>'points')::int;
      m_b := pg_temp.mkstamp(umod,c1,'quiz','p2-mod-b',now());
      insert into public.jjinfan_titles(app_user_id,celebrity_id) values(umod,c1);
      select id into adm_row from public.admin_allowlist where email='p2-10@byus.test';
      insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
        values(adm,c1,'fan_post',extensions.gen_random_uuid(),1,umod,'p2 moderation fixture',extensions.gen_random_uuid()) returning id into rep;
      insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)
        values(umod,rep,'p2 moderation restriction fixture',adm_row);
      if (select status from public.app_users where id=umod) <> 'active' then raise exception 'moderation fixture must keep the account active'; end if;
      perform pg_temp.expect_error(format('select public.group_wallet_post(%L,%L,%L::bigint,%L,%L)',umod,'fan_point',5,'group_exchange',extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
      perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,false,%L)',umod,m_b,'owner on restricted','void-key-mod-0'),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
      update public.group_wallet_release set enabled = false;
      perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',adm,m_a,'wallet off','void-key-mod-off'),'GROUP_WALLET_UNAVAILABLE');
      update public.group_wallet_release set enabled = true;
      if exists(select 1 from public.passport_stamp_voids where stamp_id=m_a) or exists(select 1 from public.community_stamps where id=m_a and revoked_at is not null) then
        raise exception 'a refused void changed something (moderation)'; end if;
      mb0 := public.group_wallet_balance(umod,'fan_point');
      r := public.void_passport_stamp(adm,m_a,'sanction restricted',true,'void-key-mod-1');
      if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(umod,'fan_point') <> mb0 - mpts then raise exception 'restricted target clawback wrong %', r; end if;
      if not (r->>'jjinfanRevoked')::boolean or exists(select 1 from public.jjinfan_titles where app_user_id=umod and celebrity_id=c1 and revoked_at is null) then
        raise exception 'restricted target title not revoked %', r; end if;
      if not exists(select 1 from public.community_stamps where id=m_a and revoked_at is not null) then raise exception 'restricted target stamp not voided'; end if;
      perform pg_temp.expect_error(format('select public.group_wallet_post(%L,%L,%L::bigint,%L,%L)',umod,'fan_point',5,'group_exchange',extensions.gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
    end;

    -- ===== PR-P2-DB-8: void results are recorded in dukjil_point_corrections and traced from the ledger =====
    declare
      cr public.dukjil_point_corrections; le public.mobile_fan_economy_ledger; stm uuid; n integer; arr jsonb; uidm uuid;
    begin
      -- check-in, corrected: attendance link, no action log, ledger row source_id = corrections row id
      select a.stamp_id into stm from public.group_creator_attendance a where a.app_user_id=uatt;
      select * into cr from public.dukjil_point_corrections where stamp_id=stm;
      if cr.id is null or cr.status <> 'corrected' or cr.action_log_id is not null or cr.attendance_id is null or cr.ledger_id is null
         or cr.void_reason <> 'attendance void' or cr.reason <> 'stamp_void' then raise exception 'attendance correction row wrong %', to_jsonb(cr); end if;
      select * into le from public.mobile_fan_economy_ledger where id=cr.ledger_id;
      if le.source_type <> 'dukjil_correction' or le.source_id <> cr.id or le.amount <> -cr.amount or le.app_user_id <> uatt then
        raise exception 'deduction row does not trace to the correction %', to_jsonb(le); end if;
      -- no double processing: a second void with another key replays, one correction row and one deduction row
      r := public.void_passport_stamp(uatt,stm,'again',false,'void-key-att-1b');
      select count(*) into n from public.dukjil_point_corrections where stamp_id=stm;
      if not (r->>'replayed')::boolean or n <> 1 or (select count(*) from public.mobile_fan_economy_ledger where app_user_id=uatt and source_type='dukjil_correction') <> 1 then
        raise exception 'void processed twice % rows %', r, n; end if;
      -- check-in, rights spent: review row, no ledger row, no deduction
      select a.stamp_id into stm from public.group_creator_attendance a where a.app_user_id=uatt2;
      select * into cr from public.dukjil_point_corrections where stamp_id=stm;
      if cr.status <> 'review' or cr.reason <> 'rights_spent' or cr.ledger_id is not null or cr.attendance_id is null or cr.void_reason <> 'attendance spent' then
        raise exception 'attendance review row wrong %', to_jsonb(cr); end if;
      if exists(select 1 from public.mobile_fan_economy_ledger where app_user_id=uatt2 and source_type='dukjil_correction') then raise exception 'review must not deduct'; end if;
      -- ordinary action, corrected and rights spent (stamps from the M4 cases above)
      select * into cr from public.dukjil_point_corrections c where c.stamp_id=(select id from public.community_stamps where source_key='p2-m4-2');
      select * into le from public.mobile_fan_economy_ledger where id=cr.ledger_id;
      if cr.status <> 'corrected' or cr.action_log_id is null or cr.attendance_id is not null or le.source_id <> cr.id or le.source_type <> 'dukjil_correction' or le.amount <> -cr.amount then
        raise exception 'action correction row wrong %', to_jsonb(cr); end if;
      select * into cr from public.dukjil_point_corrections c where c.stamp_id=(select id from public.community_stamps where source_key='p2-m4-1');
      if cr.status <> 'review' or cr.reason <> 'rights_spent' or cr.ledger_id is not null or cr.action_log_id is null then raise exception 'action review row wrong %', to_jsonb(cr); end if;
      -- table rules: one source, append-only
      perform pg_temp.expect_error(format('update public.dukjil_point_corrections set reason=%L where id=%L','x',cr.id),'append-only');
      perform pg_temp.expect_error(format('insert into public.dukjil_point_corrections(app_user_id,amount,reason,status) values(%L,1,%L,%L)',uatt,'x','review'),'dukjil_point_corrections_source');
      -- admin read: only the open reviews, service_role only, admin only
      perform pg_temp.expect_error(format('select public.read_passport_point_reviews(%L)',uatt),'ADMIN_REQUIRED');
      arr := public.read_passport_point_reviews(adm);
      if jsonb_array_length(arr) <> (select count(*) from public.dukjil_point_corrections where status='review') or jsonb_array_length(arr) < 2
         or exists(select 1 from jsonb_array_elements(arr) x where x->>'reason' <> 'rights_spent')
         or not exists(select 1 from jsonb_array_elements(arr) x where x->>'source'='attendance' and (x->>'appUserId')::uuid=uatt2)
         or not exists(select 1 from jsonb_array_elements(arr) x where x->>'source'='action') then raise exception 'review read wrong %', arr; end if;
      if jsonb_array_length(public.read_passport_point_reviews(adm,1)) <> 1 then raise exception 'review read limit'; end if;
      if has_function_privilege('authenticated','public.read_passport_point_reviews(uuid,integer,timestamptz)','execute')
         or not has_function_privilege('service_role','public.read_passport_point_reviews(uuid,integer,timestamptz)','execute') then raise exception 'review read rights'; end if;
    end;
  end;

  -- ===== heart exchange removed, ticket exchange kept =====
  if position('support_voucher' in pg_get_functiondef('public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure)) > 0 then
    raise exception 'heart exchange branch remains'; end if;
  perform pg_temp.expect_error(format('select public.exchange_owned_group_wallet(%L,%L,%L,%L,1)',ua,extensions.gen_random_uuid(),'v1','heart'),'GROUP_WALLET_INVALID');
  if position('''ticket''' in pg_get_functiondef('public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure)) = 0 then
    raise exception 'ticket exchange lost'; end if;

  -- ===== v1/v2 untouched =====
  if (select policy_version from public.reward_policy_activation where singleton) <> 2 then raise exception 'P2 must not activate v3'; end if;
  if public.fan_level_for_score(0,2) <> 'Bronze' or public.fan_level_for_score(15,2) <> 'Silver' or public.fan_level_for_score(50,2) <> 'Gold'
     or public.fan_level_for_score(120,2) <> 'Platinum' or public.fan_level_for_score(250,2) <> 'Diamond' then raise exception 'v2 boundaries changed'; end if;
  select count(*) into n from public.reward_policy_tier_stages where policy_version = 2;
  if n <> 11 then raise exception 'v2 stage rows changed: %', n; end if;
  select count(*) into n from public.reward_policy_tier_stages where policy_version = 3;
  if n <> 11 then raise exception 'v3 stage rows missing: %', n; end if;

  -- ===== activate v3 (inside this transaction only) =====
  perform public.activate_reward_policy(3, now() - interval '1 second', adm, 'p2 test activation');
  if (select policy_version from public.reward_policy_activation where singleton) <> 3 then raise exception 'v3 not active'; end if;
  if public.fan_level_for_score(15,2) <> 'Silver' then raise exception 'v2 lookup changed after v3'; end if;
  if (public.get_fan_stage_progress(1,'Gold')::jsonb ->> 'policyVersion')::int <> 3 then raise exception 'stage progress policy %', public.get_fan_stage_progress(1,'Gold'); end if;

  -- ===== boundaries: H 0/1/7/8/10/11/13/14/27/28, no non-fan cap (no jjinfan title for ut) =====
  for i in 1..array_length(hs,1) loop
    perform pg_temp.hearts(ut,c1,hs[i]-have); have := hs[i];
    r := public.get_fan_passport_stage(ut,c1);
    if r->>'stageKey' <> keys[i] or r->>'tier' <> tiers[i] then raise exception 'H=% stage % tier %, wanted % %', hs[i], r->>'stageKey', r->>'tier', keys[i], tiers[i]; end if;
    if public.get_fan_effective_tier(ut,c1) <> tiers[i] then raise exception 'H=% effective tier %', hs[i], public.get_fan_effective_tier(ut,c1); end if;
    if (public.get_fan_score_and_effective_tier(ut,c1)->>'effectiveTier') <> tiers[i] then raise exception 'H=% score tier', hs[i]; end if;
  end loop;
  if exists(select 1 from public.jjinfan_titles where app_user_id=ut) then raise exception 'tier path must not create titles'; end if;
  -- H = 0 with a passport: Bronze, Silver from 3 filled slots, silver-2 from 6
  if public.get_fan_effective_tier(ua,c1) <> 'Bronze' and public.get_fan_effective_tier(ua,c1) <> 'Silver' then raise exception 'H=0 tier wrong'; end if;
  perform pg_temp.fill(us3,c1,p3,1,3);
  if public.get_fan_effective_tier(us3,c1) <> 'Silver' or public.get_fan_passport_stage(us3,c1)->>'stageKey' <> 'silver-1' then raise exception 'silver-1 wrong %', public.get_fan_passport_stage(us3,c1); end if;
  perform pg_temp.fill(us6,c1,p6,1,6);
  if public.get_fan_passport_stage(us6,c1)->>'stageKey' <> 'silver-2' then raise exception 'silver-2 wrong %', public.get_fan_passport_stage(us6,c1); end if;

  -- ===== conversion: 0/8/9/17/18 stamps -> 0/0/1/1/2 hearts, remainder 0/8/0/8/0 =====
  vs := array[v0,v8,v9,v17,v18];
  for i in 1..5 loop
    perform pg_temp.mkuser(vs[i], 40+i);
    perform pg_temp.mkpass(vs[i], c2);
    for j in 1..vn[i] loop perform pg_temp.mkstamp(vs[i], c2, 'daily_checkin', 'conv-'||i||'-'||j, now() - interval '5 days' + (j || ' minutes')::interval); end loop;
  end loop;
  select count(*)::int, md5(string_agg(id::text||source_key||issued_at::text, ',' order by id)) into stamp_cnt, stamp_hash from public.community_stamps;
  select count(*) into n from public.creator_heart_ledger; have := n;
  if exists(select 1 from public.heart_conversion_dry_run(now()) where app_user_id = any(vs) and already_converted) then raise exception 'dry run saw a conversion'; end if;
  if (select count(*) from public.fan_heart_conversions) <> 0 then raise exception 'dry run wrote rows'; end if;
  r := public.heart_conversion_apply(now());
  for i in 2..5 loop
    if not exists(select 1 from public.fan_heart_conversions where app_user_id=vs[i] and celebrity_id=c2 and stamps_counted=vn[i] and hearts=vexp[i] and remainder=vrem[i]) then
      raise exception 'conversion wrong for % stamps', vn[i]; end if;
  end loop;
  if exists(select 1 from public.fan_heart_conversions where app_user_id=v0) then raise exception 'zero-stamp user must have no row (no valid stamps)'; end if;
  n := (select count(*) from public.fan_heart_conversions);
  r2 := public.heart_conversion_apply(now());
  if (r2->>'inserted')::int <> 0 or (select count(*) from public.fan_heart_conversions) <> n then raise exception 'rerun changed rows %', r2; end if;
  select count(*)::int, md5(string_agg(id::text||source_key||issued_at::text, ',' order by id)) into stamp_cnt, hash2 from public.community_stamps;
  if hash2 <> stamp_hash then raise exception 'stamps changed by conversion'; end if;
  if (select count(*) from public.creator_heart_ledger) <> have then raise exception 'conversion entered the ranking ledger'; end if;
  if exists(select 1 from public.jjinfan_titles where app_user_id = any(vs)) then raise exception 'conversion created jjinfan titles'; end if;
  if public.passport_hearts(v17,c2) <> 1 or public.get_fan_passport_stage(v17,c2)->>'stageKey' <> 'gold-1' then raise exception '17 stamps must reach gold-1 %', public.get_fan_passport_stage(v17,c2); end if;
  perform pg_temp.expect_error('update public.fan_heart_conversions set hearts = 9','PASSPORT_TABLE_IMMUTABLE');

  -- ===== non-downgrade: a v3-era level event keeps the level =====
  perform pg_temp.hearts(ug,c1,14);
  if public.get_fan_effective_tier(ug,c1) <> 'Platinum' then raise exception 'platinum expected'; end if;
  if public.get_fan_effective_tier(unon,c1) <> 'Bronze' then raise exception 'no-passport user must be Bronze'; end if;
  -- DB-2 item 2: v3-era fan_level_events are a floor; hearts or slots never pull the level below the highest event
  set local session_replication_role = replica;
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id)
    values ('f2200000-0000-4000-8000-0000000000e1',unon,c1,'knowledge','p2-level-event','f2200000-0000-4000-8000-0000000000e1'),
           ('f2200000-0000-4000-8000-0000000000e2',ug,c1,'knowledge','p2-level-event','f2200000-0000-4000-8000-0000000000e2');
  insert into public.fan_score_ledger(id,activity_id,app_user_id,celebrity_id,points)
    values ('f2200000-0000-4000-8000-0000000000f1','f2200000-0000-4000-8000-0000000000e1',unon,c1,1),
           ('f2200000-0000-4000-8000-0000000000f2','f2200000-0000-4000-8000-0000000000e2',ug,c1,1);
  insert into public.fan_level_events(source_ledger_id,app_user_id,celebrity_id,previous_score,current_score,previous_level,current_level,occurred_at,policy_version)
    values ('f2200000-0000-4000-8000-0000000000f1',unon,c1,0,1,'Bronze','Gold',now(),3),
           ('f2200000-0000-4000-8000-0000000000f2',ug,c1,0,1,'Bronze','Gold',now(),3);
  set local session_replication_role = origin;
  if public.get_fan_effective_tier(unon,c1) <> 'Gold' then raise exception 'v3 level event must hold Gold at 0 hearts, got %', public.get_fan_effective_tier(unon,c1); end if;
  if public.get_fan_effective_tier(ug,c1) <> 'Platinum' then raise exception 'a lower Gold event must not downgrade Platinum, got %', public.get_fan_effective_tier(ug,c1); end if;
  perform pg_temp.expect_error(format('insert into public.fan_level_events(source_ledger_id,app_user_id,celebrity_id,previous_score,current_score,previous_level,current_level,policy_version) values (%L,%L,%L,1,0,%L,%L,3)','f2200000-0000-4000-8000-0000000000f1',unon,c1,'Gold','Silver'),'fan_level_events_upgrade_only');

  -- ===== room entry =====
  insert into public.group_pages(id,kind,celebrity_id,name) values(page,'fan',c1,'P2 fan room page');
  insert into public.group_memberships(page_id,app_user_id,role) values(page,uh,'member'),(page,us3,'member'),(page,us6,'member'),(page,stranger,'member');
  insert into public.group_rooms(id,page_id,name,minimum_tier,minimum_stage_key) values(room_g,page,'gold room','Gold','gold-1'),(room_s2,page,'silver2 room','Silver','silver-2');
  insert into public.group_rooms(id,page_id,name,minimum_tier,minimum_stage_key) values(room_m,page,'member room','Member',null);
  perform pg_temp.hearts(uh,c1,2);
  r := public.group_room_entry(uh,room_g);
  if (r->>'canEnter')::boolean or r->>'reason' <> 'jjinfan_required' then raise exception 'gold without title wrong %', r; end if;
  insert into public.jjinfan_titles(app_user_id,celebrity_id) values(uh,c1);
  r := public.group_room_entry(uh,room_g);
  if not (r->>'canEnter')::boolean then raise exception 'gold with title wrong %', r; end if;
  r := public.group_room_entry(us6,room_s2);
  if not (r->>'canEnter')::boolean then raise exception 'silver-2 needs no title %', r; end if;
  r := public.group_room_entry(us3,room_s2);
  if (r->>'canEnter')::boolean or r->>'reason' <> 'stage_low' then raise exception 'silver-1 in silver-2 room wrong %', r; end if;
  r := public.group_room_entry(stranger,room_m);
  if not (r->>'canEnter')::boolean then raise exception 'member room needs membership only %', r; end if;
  r := public.group_room_entry(unon,room_m);
  if r->>'reason' <> 'not_member' then raise exception 'non member wrong %', r; end if;
  if not public.group_room_allowed(uh,page,'Gold') or public.group_room_allowed(us3,page,'Gold') then raise exception 'group_room_allowed wrong'; end if;
  -- DB-4: list items carry canEnter/reason, entry refusals carry GROUPS_FORBIDDEN:<reason>
  r := public.groups_dispatch('rooms',us3,page);
  if not exists(select 1 from jsonb_array_elements(r->'items') it where it->>'id'=room_s2::text and not (it->>'canEnter')::boolean and it->>'reason'='stage_low')
     or not exists(select 1 from jsonb_array_elements(r->'items') it where it->>'id'=room_m::text and (it->>'canEnter')::boolean and it->>'reason'='ok') then
    raise exception 'room list canEnter/reason wrong %', r; end if;
  perform pg_temp.expect_error(format('select public.groups_dispatch(%L,%L,%L,%L)','messages',us3,page,room_s2),'GROUPS_FORBIDDEN:stage_low');
  perform pg_temp.expect_error(format('select public.groups_dispatch(%L,%L,%L,%L)','messages',stranger,page,room_g),'GROUPS_FORBIDDEN:stage_low');
  -- trigger keeps tier and stage consistent for tier-only inserts
  insert into public.group_rooms(page_id,name,minimum_tier) values(page,'tier only silver','Silver'),(page,'tier only gold','Gold'),(page,'tier null','Member');
  if (select minimum_stage_key from public.group_rooms where page_id=page and name='tier only silver') <> 'silver-1'
     or (select minimum_stage_key from public.group_rooms where page_id=page and name='tier only gold') <> 'gold-1'
     or (select minimum_stage_key from public.group_rooms where page_id=page and name='tier null') is not null then raise exception 'room stage trigger wrong'; end if;
  if to_regproc('public.send_owned_group_wallet_support') is not null then raise exception 'heart transfer RPC still exists'; end if;
  if (select column_default from information_schema.columns where table_name='group_rooms' and column_name='minimum_stage_key') is null then raise exception 'default stage missing'; end if;

  -- ===== no execute for the API roles =====
  if has_function_privilege('authenticated','public.claim_passport_page(uuid,uuid,integer,text)','EXECUTE')
     or has_function_privilege('anon','public.assign_passport_stamp(uuid,uuid,public.community_stamp_kind,text)','EXECUTE')
     or has_function_privilege('authenticated','public.heart_conversion_apply(timestamptz)','EXECUTE')
     or not has_function_privilege('service_role','public.claim_passport_page(uuid,uuid,integer,text)','EXECUTE') then raise exception 'P2 function rights wrong'; end if;
end $$;

rollback;
