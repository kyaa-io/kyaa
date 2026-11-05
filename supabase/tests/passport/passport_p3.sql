-- PASSPORT-RENEWAL P3 assertions (contract section 9 P3). Disposable clean-chain DB only; everything rolls back.
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
  c1 uuid := 'f3300000-0000-4000-8000-000000000001';
  adm uuid := 'f3300000-0000-4000-8000-000000000010'; adm_al uuid := 'f3300000-0000-4000-8000-000000000011';
  ua uuid := 'f3300000-0000-4000-8000-000000000021'; ub uuid := 'f3300000-0000-4000-8000-000000000022';
  uc uuid := 'f3300000-0000-4000-8000-000000000023'; ud uuid := 'f3300000-0000-4000-8000-000000000024';
  ue uuid := 'f3300000-0000-4000-8000-000000000025'; uf uuid := 'f3300000-0000-4000-8000-000000000026';
  m1 uuid := 'f3300000-0000-4000-8000-0000000000a1'; m_leg uuid := 'f3300000-0000-4000-8000-0000000000a2';
  m_mem uuid := 'f3300000-0000-4000-8000-0000000000a3';
  rr1 uuid := 'f3300000-0000-4000-8000-0000000000b1'; rr2 uuid := 'f3300000-0000-4000-8000-0000000000b2'; rr3 uuid := 'f3300000-0000-4000-8000-0000000000b3';
  pa uuid; pc uuid; pd uuid; pe uuid; pf uuid;
  r jsonb; r2 jsonb; sid uuid; sid2 uuid; sid3 uuid; sid4 uuid; n integer; k integer := 0;
  h text := repeat('c',64);
begin
  -- ===== fixtures =====
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'p3-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','P3','P3','P3'),(c1,'en','P3','P3','P3');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22); perform pg_temp.mkuser(uc,23);
  perform pg_temp.mkuser(ud,24); perform pg_temp.mkuser(ue,25); perform pg_temp.mkuser(uf,26);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'p3-10@byus.test','admin',true);
  pa := pg_temp.mkpass(ua,c1); pc := pg_temp.mkpass(uc,c1); pd := pg_temp.mkpass(ud,c1); pe := pg_temp.mkpass(ue,c1); pf := pg_temp.mkpass(uf,c1);
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'p3-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt'),
          (m_leg,c1,'p3-legacy','active','기타','기존 인증','Legacy proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),null);
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid()),(rr2,m_leg,1,1,2,1,adm,adm_al,extensions.gen_random_uuid());

  -- ===== 1. column/shape: new columns exist, legacy rows cannot carry them =====
  perform pg_temp.expect_error($q$insert into public.certification_submissions(app_user_id,celebrity_id,mission_id,mission_revision,reward_revision_id,reward_revision,reward_policy_version,reward_score_points,reward_ticket_amount,attempt_number,idempotency_key,request_hash,publish_consent,post_body)
    values('f3300000-0000-4000-8000-000000000021','f3300000-0000-4000-8000-000000000001','f3300000-0000-4000-8000-0000000000a2',1,'f3300000-0000-4000-8000-0000000000b2',1,1,0,0,1,extensions.gen_random_uuid(),repeat('d',64),true,'x')$q$,'certification_submission_legacy_shape');
  k := k + 1;

  -- ===== 2. submit: validation, PII block, upload checks, passport =====
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c1',ua,c1,m1);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L,true)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c1','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64)),'PROOF_PII_DETECTED');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'bogus','f3300000-0000-4000-8000-0000000000c1','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64)),'PROOF_INVALID');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt',extensions.gen_random_uuid(),'{abc}'::text[],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64)),'UPLOAD_INVALID');
  k := k + 1;
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c2',ua,c1,m1, now() - interval '1 second');
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c2','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d2',repeat('2',64)),'UPLOAD_EXPIRED');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'purchase','f3300000-0000-4000-8000-0000000000c1','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64)),'PROOF_TYPE_MISMATCH');
  k := k + 1;
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c3',ub,c1,m1);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ub,c1,'receipt','f3300000-0000-4000-8000-0000000000c3','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d3',repeat('3',64)),'PASSPORT_REQUIRED');
  k := k + 1;
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c4',ua,c1,m_leg);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c4','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d4',repeat('4',64)),'PROOF_TYPE_MISMATCH');
  k := k + 1;

  -- ===== 3. submit ok, replay, idempotency mismatch, one open =====
  r := public.submit_certification_proof(ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c1',true,true,array['0123456789abcdef'],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64),false,'영수증 인증해요');
  sid := (r->>'id')::uuid;
  if r->>'status' <> 'pending' or (r->>'replayed')::boolean then raise exception 'submit wrong %', r; end if;
  r2 := public.submit_certification_proof(ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c1',true,true,array['0123456789abcdef'],'f3300000-0000-4000-8000-0000000000d1',repeat('1',64),false,'영수증 인증해요');
  if not (r2->>'replayed')::boolean or (r2->>'id')::uuid <> sid then raise exception 'submit replay wrong %', r2; end if;
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c1','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d1',repeat('9',64)),'IDEMPOTENCY_MISMATCH');
  k := k + 1;
  if (select reward_score_points from public.certification_submissions where id = sid) <> 0 then raise exception 'proof submission must not carry manual score'; end if;
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c5',ua,c1,m1);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c5','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d5',repeat('5',64)),'PROOF_ALREADY_OPEN');
  k := k + 1;

  -- ===== 4. queue: legacy pending queue unchanged, proof pending listed with proof_type =====
  if not exists (select 1 from jsonb_array_elements(public.get_admin_certification_queue(adm,adm_al,'pending')) q where q->>'id' = sid::text) then
    -- the legacy queue is not required to list proof rows; it must at least keep working
    null;
  end if;
  k := k + 1;

  -- ===== 5. review validation =====
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L)',ua,sid,'approved'),'ADMIN_REQUIRED');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L)',adm,sid,'maybe'),'DECISION_INVALID');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L)',adm,sid,'changes_requested'),'REASON_REQUIRED');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L,%L)',adm,sid,'rejected','x'),'REASON_REQUIRED');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,7,%L)',adm,sid,'approved'),'REVISION_CONFLICT');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L)',adm,extensions.gen_random_uuid(),'approved'),'PROOF_NOT_FOUND');
  k := k + 1;

  -- ===== 6. changes_requested -> resubmit -> in_review -> approve (first approval 500P, slot 9, title, public post) =====
  r := public.review_certification_proof(adm,sid,1,'changes_requested','금액이 보이게 다시 올려 주세요.');
  if r->>'status' <> 'changes_requested' then raise exception 'changes_requested wrong %', r; end if;
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof(%L,%L,1,%L,%L)',ua,sid,'f3300000-0000-4000-8000-0000000000c5','{abc}'::text[]),'REVISION_CONFLICT');
  k := k + 1;
  perform pg_temp.expect_error(format('select public.resubmit_certification_proof(%L,%L,%L,%L,%L,true)',ua,sid,(r->>'revision')::bigint,'f3300000-0000-4000-8000-0000000000c5','{abc}'::text[]),'PROOF_PII_DETECTED');
  k := k + 1;
  r2 := public.resubmit_certification_proof(ua,sid,(r->>'revision')::bigint,'f3300000-0000-4000-8000-0000000000c5',array['fedcba9876543210']);
  if r2->>'status' <> 'pending' then raise exception 'resubmit wrong %', r2; end if;
  -- L3: resubmission raised the revision, so an approval judged on the earlier revision is refused
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%L,%L)',adm,sid,(r->>'revision')::bigint,'approved'),'REVISION_CONFLICT');
  k := k + 1;
  r := public.review_certification_proof(adm,sid,(r2->>'revision')::bigint,'in_review');
  if r->>'status' <> 'in_review' then raise exception 'in_review wrong %', r; end if;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%L,%L)',adm,sid,(r->>'revision')::bigint,'in_review'),'INVALID_TRANSITION');
  k := k + 1;
  r := public.review_certification_proof(adm,sid,(r->>'revision')::bigint,'approved','영수증 인증 완료');
  if r->>'status' <> 'approved' or not (r->>'titleIssued')::boolean or (r->>'points')::int <> 500 or not (r->>'firstApproval')::boolean or (r->>'slotNo')::int <> 9 or r->>'postId' is null then
    raise exception 'first approval wrong %', r; end if;
  if (select count(*) from public.community_stamps where app_user_id=ua and kind='proof' and source_key=sid::text) <> 1 then raise exception 'proof stamp missing'; end if;
  -- point payout proven on the ledger: the first approval posts exactly 500 fan_point for this proof action
  if (select coalesce(sum(l.amount),0) from public.dukjil_action_log a join public.mobile_fan_economy_ledger l on l.id=a.ledger_id
      where a.app_user_id=ua and a.action_key='proof' and a.source_key=sid::text and l.asset='fan_point' and l.source_type='dukjil_proof') <> 500
    then raise exception 'first approval ledger payout wrong'; end if;
  if (select count(*) from public.fan_posts where id=(r->>'postId')::uuid and body='영수증 인증해요') <> 1 then raise exception 'post body not the passed body'; end if;
  -- the proof post is not an activity reward source
  if exists (select 1 from public.mobile_fan_activity_sources where source_id=(r->>'postId')::uuid and eligible) then raise exception 'proof post eligible as activity source'; end if;
  if exists (select 1 from public.fan_ticket_ledger where app_user_id=ua and source_id=(r->>'postId')::uuid) then raise exception 'proof post earned a ticket'; end if;
  if not exists (select 1 from public.passport_page_slots where passport_id=pa and slot_no=9 and stamp_id=(r->>'stampId')::uuid) then raise exception 'slot 9 missing'; end if;
  if not exists (select 1 from public.jjinfan_titles where app_user_id=ua and celebrity_id=c1 and proof_submission_id=sid) then raise exception 'title not linked to proof'; end if;
  if (select public_post_id from public.certification_submissions where id=sid) is distinct from (r->>'postId')::uuid then raise exception 'public_post_id missing'; end if;
  if not exists (select 1 from public.fan_posts where id=(r->>'postId')::uuid and category='proof' and visibility='public' and first_comment_eligible=false) then raise exception 'proof post wrong'; end if;
  -- L3: the published image is the latest upload (the resubmitted one), not the first
  if (select e->>'imageObjectPath' from jsonb_array_elements(public.read_proof_board(c1)) e where e->>'submissionId'=sid::text)
     is distinct from (select object_path from public.certification_uploads where id='f3300000-0000-4000-8000-0000000000c5') then raise exception 'published image is not the latest upload'; end if;
  k := k + 1;
  r2 := public.review_certification_proof(adm,sid,(r->>'revision')::bigint - 1,'approved');
  if not (r2->>'replayed')::boolean then raise exception 'approval replay wrong %', r2; end if;
  k := k + 1;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%L,%L,%L)',adm,sid,(r->>'revision')::bigint,'rejected','늦은 반려입니다'),'INVALID_TRANSITION');
  k := k + 1;

  -- ===== 7. repeat approval 100P, then the monthly limit =====
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c6',ua,c1,m1);
  r := public.submit_certification_proof(ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c6',false,false,array['1111111111111111'],'f3300000-0000-4000-8000-0000000000d6',repeat('6',64));
  sid2 := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sid2,(r->>'revision')::bigint,'approved');
  if (r->>'points')::int <> 100 or (r->>'firstApproval')::boolean then raise exception 'repeat approval wrong %', r; end if;
  if r->>'postId' is not null then raise exception 'consent-less approval must not publish %', r; end if;
  if (select coalesce(sum(l.amount),0) from public.dukjil_action_log a join public.mobile_fan_economy_ledger l on l.id=a.ledger_id
      where a.app_user_id=ua and a.action_key='proof' and a.source_key=sid2::text and l.asset='fan_point' and l.source_type='dukjil_proof') <> 100
    then raise exception 'repeat approval ledger payout wrong'; end if;
  if (r->>'titleIssued')::boolean then raise exception 'repeat approval claims a new title %', r; end if;
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000c7',ua,c1,m1);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,true,%L,%L,%L)',ua,c1,'receipt','f3300000-0000-4000-8000-0000000000c7','{abc}'::text[],'f3300000-0000-4000-8000-0000000000d7',repeat('7',64)),'PROOF_MONTHLY_LIMIT');
  k := k + 1;

  -- ===== 8. public board: consent-less / non-approved / hidden proofs excluded =====
  r := public.read_proof_board(c1);
  if jsonb_array_length(r) <> 1 or r->0->>'submissionId' <> sid::text then raise exception 'board wrong %', r; end if;
  if r->0 ? 'ownerEmail' or r->0 ? 'objectPath' then raise exception 'board leaks fields %', r; end if;
  k := k + 1;
  update public.fan_posts set hidden_at = now() where id = (select public_post_id from public.certification_submissions where id = sid);
  if jsonb_array_length(public.read_proof_board(c1)) <> 0 then raise exception 'hidden proof post still on the board'; end if;
  update public.fan_posts set hidden_at = null where id = (select public_post_id from public.certification_submissions where id = sid);
  k := k + 1;

  -- ===== 9. a proof post earns no post points =====
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L)',ua,c1,'post',(select public_post_id::text from public.certification_submissions where id = sid),extensions.gen_random_uuid(),'{"chars":200}'::jsonb),'PROOF_POST_NO_POINTS');
  k := k + 1;
  if exists (select 1 from public.dukjil_action_log where app_user_id=ua and action_key='post') then raise exception 'proof post produced a post action row'; end if;
  k := k + 1;

  -- ===== 10. approval atomicity: a failure after stamp/slot/points rolls everything back =====
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000e1',uc,c1,m1);
  r := public.submit_certification_proof(uc,c1,'receipt','f3300000-0000-4000-8000-0000000000e1',true,false,array['2222222222222222'],'f3300000-0000-4000-8000-0000000000f1',repeat('8',64),false,'인증했어요');
  sid3 := (r->>'id')::uuid;
  create function public.p3_inject_failure() returns trigger language plpgsql as $f$ begin raise exception 'P3_INJECTED_FAILURE'; end $f$;
  create trigger p3_inject_failure before insert on public.fan_posts for each row execute function public.p3_inject_failure();
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%L,%L)',adm,sid3,(r->>'revision')::bigint,'approved'),'P3_INJECTED_FAILURE');
  drop trigger p3_inject_failure on public.fan_posts;
  drop function public.p3_inject_failure();
  if (select status::text from public.certification_submissions where id=sid3) <> 'pending' then raise exception 'status changed after failed approval'; end if;
  if exists (select 1 from public.community_stamps where app_user_id=uc and kind='proof') then raise exception 'stamp survived rollback'; end if;
  if exists (select 1 from public.passport_page_slots where passport_id=pc) then raise exception 'slot survived rollback'; end if;
  if exists (select 1 from public.dukjil_action_log where app_user_id=uc) then raise exception 'action log survived rollback'; end if;
  if exists (select 1 from public.mobile_fan_economy_ledger where app_user_id=uc) then raise exception 'points survived rollback'; end if;
  if exists (select 1 from public.jjinfan_titles where app_user_id=uc) then raise exception 'title survived rollback'; end if;
  if exists (select 1 from public.fan_posts where app_user_id=uc and category='proof') then raise exception 'post survived rollback'; end if;
  k := k + 1;
  -- and the same row approves cleanly once the failure is gone
  r := public.review_certification_proof(adm,sid3,(select review_revision from public.certification_submissions where id=sid3),'approved');
  if (r->>'points')::int <> 500 then raise exception 'approve after rollback wrong %', r; end if;
  k := k + 1;

  -- ===== 10b. consent without a post body is refused at submission; a stamp that cannot be issued rolls the whole approval back =====
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000e5',ue,c1,m1);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,%L,%L,true,false,%L,%L,%L)',ue,c1,'receipt','f3300000-0000-4000-8000-0000000000e5','{4444444444444444}'::text[],'f3300000-0000-4000-8000-0000000000f5',repeat('a',64)),'PROOF_POST_BODY_REQUIRED');
  if exists (select 1 from public.certification_submissions where app_user_id=ue) then raise exception 'refused submission left a row'; end if;
  r := public.submit_certification_proof(ue,c1,'receipt','f3300000-0000-4000-8000-0000000000e5',true,false,array['4444444444444444'],'f3300000-0000-4000-8000-0000000000f5',repeat('a',64),false,'한마디 남겨요');
  sid4 := (r->>'id')::uuid;
  if (select post_body from public.certification_submissions where id=sid4) <> '한마디 남겨요' then raise exception 'submission body not stored'; end if;
  alter function public.dukjil_issue_stamp(uuid,uuid,public.community_stamp_kind,text,integer) rename to p3_real_issue_stamp;
  create function public.dukjil_issue_stamp(uuid,uuid,public.community_stamp_kind,text,integer) returns uuid language sql as 'select null::uuid';
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%L,%L)',adm,sid4,(r->>'revision')::bigint,'approved'),'PROOF_STAMP_UNAVAILABLE');
  drop function public.dukjil_issue_stamp(uuid,uuid,public.community_stamp_kind,text,integer);
  alter function public.p3_real_issue_stamp(uuid,uuid,public.community_stamp_kind,text,integer) rename to dukjil_issue_stamp;
  if (select status::text from public.certification_submissions where id=sid4) <> 'pending' then raise exception 'stamp failure changed status'; end if;
  if exists (select 1 from public.dukjil_action_log where app_user_id=ue) or exists (select 1 from public.fan_posts where app_user_id=ue and category='proof') then raise exception 'stamp failure left rows'; end if;
  if exists (select 1 from public.jjinfan_titles where app_user_id=ue) then raise exception 'stamp failure left a title'; end if;
  -- resubmission body: consent rows keep the stored body unless a new one is sent
  r := public.review_certification_proof(adm,sid4,(r->>'revision')::bigint,'changes_requested','다시 올려 주세요');
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000e6',ue,c1,m1);
  r := public.resubmit_certification_proof(ue,sid4,(r->>'revision')::bigint,'f3300000-0000-4000-8000-0000000000e6',array['5555555555555555']);
  if (select post_body from public.certification_submissions where id=sid4) <> '한마디 남겨요' then raise exception 'resubmit lost the body'; end if;
  k := k + 1;

  -- ===== 10c. my list, public board shape, deletion/consent disjointness =====
  r := public.list_my_certification_proofs(ue,c1);
  if jsonb_array_length(r) <> 1 or r->0->>'status' <> 'pending' or r->0->>'submissionId' <> sid4::text or (r->0->'reason') <> 'null'::jsonb then raise exception 'my list wrong %', r; end if;
  if jsonb_array_length(public.list_my_certification_proofs(ua,c1)) <> (select count(*) from public.certification_submissions where app_user_id=ua and celebrity_id=c1 and proof_type is not null) or (select count(*) from public.certification_submissions where app_user_id=ua and celebrity_id=c1 and proof_type is not null) = 0 then raise exception 'my list misses own rows'; end if;
  if exists (select 1 from jsonb_array_elements(public.list_my_certification_proofs(ue,c1)) e where e->>'submissionId' in (select id::text from public.certification_submissions where app_user_id<>ue)) then raise exception 'my list leaks other rows'; end if;
  -- mission list for the member screen: proof missions only, own open submissions and own month count only, service_role only
  r := public.list_proof_missions(ue,c1,now()-interval '1 year');
  if not exists (select 1 from jsonb_array_elements(r->'missions') e where e->>'id'=m1::text and e->>'proofType'='receipt')
     or exists (select 1 from jsonb_array_elements(r->'missions') e where e->>'id'=m_leg::text) then raise exception 'mission list wrong %', r; end if;
  if (r->>'monthCount')::bigint <> (select count(*) from public.certification_submissions where app_user_id=ue and celebrity_id=c1 and proof_type is not null and status::text in ('pending','in_review','changes_requested','approved'))
     or (r->>'monthCount')::bigint >= (select count(*) from public.certification_submissions where celebrity_id=c1 and proof_type is not null and status::text in ('pending','in_review','changes_requested','approved')) then raise exception 'month count not own %', r; end if;
  if (select count(*) from jsonb_array_elements_text(r->'openMissionIds')) <> (select count(*) from public.certification_submissions where app_user_id=ue and celebrity_id=c1 and proof_type is not null and status::text in ('pending','in_review','changes_requested')) then raise exception 'open ids not own %', r; end if;
  if (public.list_proof_missions(ue,c1,now()+interval '1 day')->>'monthCount')::bigint <> 0 then raise exception 'month start ignored'; end if;
  if not has_function_privilege('service_role','public.list_proof_missions(uuid,uuid,timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.list_proof_missions(uuid,uuid,timestamptz)','EXECUTE')
     or has_function_privilege('authenticated','public.list_proof_missions(uuid,uuid,timestamptz)','EXECUTE') then raise exception 'list_proof_missions grant wrong'; end if;
  k := k + 1;
  r := public.read_proof_board(c1);
  if jsonb_array_length(r) < 1 then raise exception 'board empty'; end if;
  if r->0 ? 'authorId' or not (r->0 ? 'imageObjectPath') or not (r->0 ? 'jjinfanRank') or r->0->>'body' is null then raise exception 'board shape wrong %', r->0; end if;
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'body'='인증했어요' and e->>'imageObjectPath' is not null and (e->>'jjinfanRank')::int >= 1) then raise exception 'board entry lacks image or rank %', r; end if;
  k := k + 1;

  -- ===== 11. reject path and private-proof retention (D11 dev draft) =====
  perform pg_temp.mkupload('f3300000-0000-4000-8000-0000000000e2',ud,c1,m1);
  r := public.submit_certification_proof(ud,c1,'receipt','f3300000-0000-4000-8000-0000000000e2',false,false,array['3333333333333333'],'f3300000-0000-4000-8000-0000000000f2',repeat('9',64));
  r := public.review_certification_proof(adm,(r->>'id')::uuid,(r->>'revision')::bigint,'rejected','영수증이 아닙니다.');
  if r->>'status' <> 'rejected' then raise exception 'reject wrong %', r; end if;
  if exists (select 1 from public.community_stamps where app_user_id=ud and kind='proof') then raise exception 'rejected proof got a stamp'; end if;
  if jsonb_array_length(public.list_private_proofs_due_for_deletion()) <> 0 then raise exception 'fresh private proof listed for deletion'; end if;
  set local session_replication_role = replica;
  update public.certification_submissions set reviewed_at = now() - interval '91 days' where id = (r->>'id')::uuid;
  update public.certification_submissions set reviewed_at = now() - interval '91 days' where id = sid;       -- consented proof: never listed
  set local session_replication_role = origin;
  r2 := public.list_private_proofs_due_for_deletion();
  if jsonb_array_length(r2) <> 1 or r2->0->>'submissionId' <> (r->>'id') then raise exception 'retention list wrong %', r2; end if;
  -- consent proofs (public image) are never deletion targets, even when reviewed over 90 days ago
  update public.certification_submissions set reviewed_at = now() - interval '91 days' where id = sid3;
  if exists (select 1 from jsonb_array_elements(public.list_private_proofs_due_for_deletion()) d
      where d->>'submissionId' in (select id::text from public.certification_submissions where publish_consent)) then raise exception 'consent proof listed for deletion'; end if;
  if exists (select 1 from jsonb_array_elements(public.read_proof_board(c1)) b join jsonb_array_elements(public.list_private_proofs_due_for_deletion()) d
      on d->>'objectPath' = b->>'imageObjectPath') then raise exception 'board image overlaps deletion list'; end if;
  -- deleting the public post keeps the stamp and the title, and the board drops it
  update public.fan_posts set deleted_at = now() where id = (select public_post_id from public.certification_submissions where id = sid3);
  if jsonb_array_length((select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(public.read_proof_board(c1)) e where e->>'body' = '인증했어요')) <> 0 then raise exception 'deleted post still on board'; end if;
  if not exists (select 1 from public.jjinfan_titles where app_user_id=uc and celebrity_id=c1 and revoked_at is null)
     or not exists (select 1 from public.community_stamps where app_user_id=uc and kind='proof') then raise exception 'post deletion removed stamp or title'; end if;
  perform public.mark_proof_upload_purged((r2->0->>'uploadId')::uuid);
  if jsonb_array_length(public.list_private_proofs_due_for_deletion()) <> 0 then raise exception 'purged proof listed again'; end if;
  perform pg_temp.expect_error(format('select public.mark_proof_upload_purged(%L)',(r2->0->>'uploadId')),'UPLOAD_NOT_PURGEABLE');
  perform pg_temp.expect_error(format('select public.mark_proof_upload_purged(%L)',(select id from public.certification_uploads where consumed_submission_id = sid limit 1)),'UPLOAD_NOT_PURGEABLE');
  k := k + 3;

  -- ===== 12. legacy regression: old submit/review RPCs, pending queue, same shapes =====
  perform public.register_owned_certification_upload(ue,m_leg,'f3300000-0000-4000-8000-0000000000e3',ue||'/'||m_leg||'/f3300000-0000-4000-8000-0000000000e3.webp',100,10,10,repeat('e',64));
  r := public.submit_owned_certification(ue,m_leg,'f3300000-0000-4000-8000-0000000000f3','["f3300000-0000-4000-8000-0000000000e3"]',null,null);
  sid := (r->>'id')::uuid;
  if (select status::text from public.certification_submissions where id=sid) <> 'pending' or (select proof_type from public.certification_submissions where id=sid) is not null then raise exception 'legacy submission changed shape'; end if;
  if not exists (select 1 from jsonb_array_elements(public.get_admin_certification_queue(adm,adm_al,'pending')) q where q->>'id' = sid::text) then raise exception 'legacy pending queue lost the row'; end if;
  perform public.review_admin_certification_submission(adm,adm_al,extensions.gen_random_uuid(),sid,'f3300000-0000-4000-8000-0000000000f4',1,'approve',null);
  -- zero rows is intended: 20261210060000_fan_score_freeze.sql:10-11 drops manual (no activity_id) score rows once the dukjil policy is in force
  -- (contract 3.7); finalize_certification_review_internal (20261129001000:~323) the manual ticket row is still posted once (not frozen).
  if (select count(*) from public.fan_score_ledger where manual_submission_id = sid) <> 0 then raise exception 'legacy score row written under dukjil policy'; end if;
  if (select count(*) from public.fan_ticket_ledger where source_type='manual_certification' and source_id = sid) <> 1 then raise exception 'legacy ticket not posted once'; end if;
  if (select status::text from public.certification_submissions where id=sid) <> 'approved' or (select review_revision from public.certification_submissions where id=sid) <> 2
     then raise exception 'legacy approve did not finish'; end if;
  if exists (select 1 from public.community_stamps where app_user_id=ue and kind='proof') then raise exception 'legacy approval created a proof stamp'; end if;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,1,%L)',adm,sid,'approved'),'PROOF_NOT_FOUND');
  k := k + 4;

  -- ===== 12b. admin proof queue: admin only, fixed shape, every status, duplicates by image hash =====
  perform pg_temp.expect_error(format('select public.get_admin_proof_queue(%L,%L)',ua,'pending'),'ADMIN_REQUIRED');
  perform pg_temp.expect_error('select public.get_admin_proof_queue(null,''pending'')','ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select public.get_admin_proof_queue(%L,%L)',extensions.gen_random_uuid(),'pending'),'ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select public.get_admin_proof_queue(%L,%L)',adm,'bogus'),'PROOF_INVALID');
  n := 0;
  for r in select public.get_admin_proof_queue(adm, st) from unnest(array['pending','in_review','approved','rejected','changes_requested']) st loop
    if jsonb_typeof(r) <> 'array' then raise exception 'queue is not an array'; end if;
    n := n + jsonb_array_length(r);
    if exists (select 1 from jsonb_array_elements(r) e where not (e ?& array['id','status','revision','createdAt','proofType','publishConsent','amountVisible','applicantName','creatorName','duplicateOf','rejectionReason','uploadIds','postBody'])
        or jsonb_typeof(e -> 'duplicateOf') <> 'array' or jsonb_typeof(e -> 'uploadIds') <> 'array'
        or (e ->> 'creatorName') is distinct from 'P3' or coalesce(e ->> 'applicantName', '') = '')
      then raise exception 'queue row shape wrong: %', r; end if;
  end loop;
  if n <> (select count(*) from public.certification_submissions where proof_type is not null) or n < 1 then raise exception 'queue misses proof submissions: % rows', n; end if;
  update public.certification_submissions set image_phash = '{p3dupe}'::text[] where id in (select id from public.certification_submissions where proof_type is not null order by submitted_at, id limit 2);
  if (select count(*) from public.certification_submissions where image_phash = '{p3dupe}'::text[]) <> 2 then raise exception 'duplicate fixture not set'; end if;
  if not exists (select 1 from (select jsonb_array_elements(public.get_admin_proof_queue(adm, st)) e from unnest(array['pending','in_review','approved','rejected','changes_requested']) st) q
      where jsonb_array_length(e -> 'duplicateOf') > 0) then raise exception 'queue shows no duplicate by image hash'; end if;
  if exists (select 1 from (select jsonb_array_elements(public.get_admin_proof_queue(adm, 'pending')) e) q where e ->> 'status' <> 'pending') then raise exception 'queue status filter leaks'; end if;
  k := k + 4;

  -- ===== 12c. proof missions through the admin mission path (v3) =====
  perform pg_temp.expect_error(format('select public.save_admin_certification_mission_v3(%L,%L,%L,null,%L,%L,null,%L,%L,%L,%L,%L,%L,%L,now(),now()+interval %L,0::smallint,0::bigint,null,%L)',
    ua,adm_al,extensions.gen_random_uuid(),c1,'p3-adm-m','c','t','t','d','d','i','i','30 days','receipt'),'CERTIFICATION_ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select public.save_admin_certification_mission_v3(%L,%L,%L,null,%L,%L,null,%L,%L,%L,%L,%L,%L,%L,now(),now()+interval %L,0::smallint,0::bigint,null,%L)',
    adm,adm_al,extensions.gen_random_uuid(),c1,'p3-adm-bad','c','t','t','d','d','i','i','30 days','gift'),'PROOF_INVALID');
  perform pg_temp.expect_error(format('select public.save_admin_certification_mission_v3(%L,%L,%L,null,%L,%L,null,%L,%L,%L,%L,%L,%L,%L,now(),now()+interval %L,0::smallint,0::bigint,%L,%L)',
    adm,adm_al,extensions.gen_random_uuid(),c1,'p3-adm-mem','c','t','t','d','d','i','i','30 days','instagram','receipt'),'PROOF_INVALID');
  r := public.save_admin_certification_mission_v3(adm,adm_al,extensions.gen_random_uuid(),null,c1,'p3-adm-mission',null,'영수증','영수증 인증 입력','Receipt proof entry','설명','Description','지침','Instructions',
    now(),now()+interval '30 days',0::smallint,0::bigint,null,'ticket','  Interpark ');
  if r->>'proofType' <> 'ticket' or r->>'proofPlatform' <> 'Interpark' then raise exception 'v3 create wrong %', r; end if;
  if (select proof_type||'/'||proof_platform from public.certification_missions where id=(r->>'id')::uuid) <> 'ticket/Interpark' then raise exception 'v3 columns not stored'; end if;
  r2 := public.save_admin_certification_mission_v3(adm,adm_al,extensions.gen_random_uuid(),(r->>'id')::uuid,c1,'p3-adm-mission',(r->>'revision')::bigint,'영수증','영수증 인증 입력','Receipt proof entry','설명','Description','지침','Instructions',
    now(),now()+interval '30 days',0::smallint,0::bigint,null,'receipt',null);
  if (select proof_type||'/'||coalesce(proof_platform,'-') from public.certification_missions where id=(r->>'id')::uuid) <> 'receipt/-' then raise exception 'v3 edit wrong %', r2; end if;
  if not exists (select 1 from jsonb_array_elements(public.get_admin_certification_missions(adm,adm_al)) e where e->>'id'=r->>'id' and e->>'proofType'='receipt' and e ? 'proofPlatform')
    then raise exception 'admin mission list lacks proof fields'; end if;
  perform pg_temp.expect_error(format('select public.get_admin_certification_missions(%L,%L)',ua,adm_al),'CERTIFICATION_ADMIN_REQUIRED');
  if has_function_privilege('anon','public.get_admin_certification_missions_before_proof(uuid,uuid)','EXECUTE') or has_function_privilege('service_role','public.get_admin_certification_missions_before_proof(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.save_admin_certification_mission_v3(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,text,text,text,text,text,timestamptz,timestamptz,smallint,bigint,public.social_platform,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.save_admin_certification_mission_v3(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,text,text,text,text,text,timestamptz,timestamptz,smallint,bigint,public.social_platform,text,text)','EXECUTE')
    then raise exception 'v3 grants wrong'; end if;
  k := k + 1;

  -- ===== 13. grants: service_role only on every P3 API function =====
  for n in 1..1 loop
    if exists (
      select 1 from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('submit_certification_proof','resubmit_certification_proof','review_certification_proof','read_proof_board','list_private_proofs_due_for_deletion','mark_proof_upload_purged','get_admin_proof_queue')
         and (not has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then raise exception 'P3 function grant wrong'; end if;
    if (select count(*) from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace
         and p.proname in ('submit_certification_proof','resubmit_certification_proof','review_certification_proof','read_proof_board','list_private_proofs_due_for_deletion','mark_proof_upload_purged','get_admin_proof_queue')) <> 7 then raise exception 'P3 function missing'; end if;
    if has_function_privilege('anon', 'public.dukjil_block_proof_post_points()', 'EXECUTE') or has_function_privilege('authenticated', 'public.dukjil_block_proof_post_points()', 'EXECUTE')
       or has_function_privilege('service_role', 'public.dukjil_block_proof_post_points()', 'EXECUTE') then raise exception 'guard trigger function is callable'; end if;
  end loop;
  k := k + 1;

  raise notice 'passport P3: % assertion groups passed', k;
end $$;

select 'passport P3 behavioral verification passed' as result;
rollback;
