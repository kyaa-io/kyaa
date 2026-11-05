-- PASSPORT-RENEWAL P3 isolation assertions (PR-P3-DB-5). Disposable clean-chain DB only; everything rolls back.
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
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p3i-'||n,'p3i-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p3i-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','p3i','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkupload(id uuid, u uuid, c uuid, m uuid, expires timestamptz default now() + interval '1 hour') returns uuid language plpgsql as $$
begin
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,expires_at)
    values(id,u,c,m,u||'/'||m||'/'||id||'.webp','image/webp',100,10,10,repeat('a',64),expires);
  return id;
end $$;

create function pg_temp.erase(u uuid, n integer) returns void language plpgsql as $$
begin
  perform public.begin_owned_account_deletion('did:privy:p3i-' || n);
  perform public.scrub_account_deletion(u);
end $$;

-- After deletion: the stored text copy and the public post body are gone, the board and the admin queue show no text, the uploaded
-- objects are registered for the API worker (this test does not delete storage objects).
create function pg_temp.assert_scrubbed(c uuid, adm uuid, u uuid, sid uuid, post uuid) returns void language plpgsql as $$
declare txt text; item jsonb;
begin
  if (select post_body from public.certification_submissions where id = sid) is not null
     or (select publish_consent from public.certification_submissions where id = sid) then raise exception 'submission text copy or consent survived deletion'; end if;
  if post is not null and ((select body from public.fan_posts where id = post) <> '' or (select deleted_at from public.fan_posts where id = post) is null) then
    raise exception 'proof post not blanked and deleted'; end if;
  txt := public.read_proof_board(c,50,null)::text;
  if position(sid::text in txt) > 0 or (post is not null and position(post::text in txt) > 0) then raise exception 'board still shows the deleted member proof'; end if;
  select e into item from jsonb_array_elements(public.get_admin_proof_queue(adm,(select status::text from public.certification_submissions where id = sid))) e where e->>'id' = sid::text;
  if item is not null and (item->>'postBody') is not null then raise exception 'admin queue still shows the post text'; end if;
  if not exists (select 1 from public.account_deletion_objects o where o.app_user_id = u and o.bucket = 'certification-proofs') then
    raise exception 'proof image objects not registered for deletion'; end if;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
update public.telegram_certification_review_settings set enabled = true, chat_id = '-1001234567890';

do $$
declare
  c1 uuid := 'f3500000-0000-4000-8000-000000000001';
  adm uuid := 'f3500000-0000-4000-8000-000000000010'; adm_al uuid := 'f3500000-0000-4000-8000-000000000011';
  ua uuid := 'f3500000-0000-4000-8000-000000000021'; ub uuid := 'f3500000-0000-4000-8000-000000000022';
  ue uuid := 'f3500000-0000-4000-8000-000000000025'; uf uuid := 'f3500000-0000-4000-8000-000000000026';
  m1 uuid := 'f3500000-0000-4000-8000-0000000000a1'; m_leg uuid := 'f3500000-0000-4000-8000-0000000000a2';
  rr1 uuid := 'f3500000-0000-4000-8000-0000000000b1'; rr2 uuid := 'f3500000-0000-4000-8000-0000000000b2';
  ug uuid := 'f3500000-0000-4000-8000-000000000027'; ur uuid := 'f3500000-0000-4000-8000-000000000028';
  pa uuid; pb uuid; pe uuid; pf uuid; pg uuid; pr uuid; post_g uuid; sid_g uuid; sid_r uuid; rep_id uuid; fr_post uuid;
  r jsonb; sid uuid; sid_b uuid; sid_f uuid; lid uuid; post uuid; post_b uuid; norm uuid := 'f3500000-0000-4000-8000-0000000000e1';
  stamp uuid; k integer := 0; txt text;
begin
  -- ===== fixtures =====
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'p3i-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','P3I','P3I','P3I'),(c1,'en','P3I','P3I','P3I');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22);
  perform pg_temp.mkuser(ue,25); perform pg_temp.mkuser(uf,26);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'p3i-10@byus.test','admin',true);
  perform pg_temp.mkuser(ug,27); perform pg_temp.mkuser(ur,28);
  pa := pg_temp.mkpass(ua,c1); pb := pg_temp.mkpass(ub,c1); pe := pg_temp.mkpass(ue,c1); pf := pg_temp.mkpass(uf,c1);
  pg := pg_temp.mkpass(ug,c1); pr := pg_temp.mkpass(ur,c1);
  insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at)
    values(ua,ub,c1,'accepted',extensions.gen_random_uuid(),repeat('9',64),now());
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'p3i-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt'),
          (m_leg,c1,'p3i-legacy','active','기타','기존 인증','Legacy proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),null);
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid()),(rr2,m_leg,1,1,2,1,adm,adm_al,extensions.gen_random_uuid());
  -- a normal (non-proof) post as positive control
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
    values(norm,c1,ub,'일반 글 positive control',extensions.gen_random_uuid(),repeat('7',64));

  -- ===== 1. Telegram on: proof submit creates no card, legacy submit does =====
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c1',ua,c1,m1);
  r := public.submit_certification_proof(ua,c1,'receipt','f3500000-0000-4000-8000-0000000000c1',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d1',repeat('1',64),false,'영수증 인증해요');
  sid := (r->>'id')::uuid;
  if exists (select 1 from public.telegram_certification_deliveries where submission_id = sid) then raise exception 'proof submission got a Telegram card'; end if;
  k := k + 1;
  perform public.register_owned_certification_upload(ue,m_leg,'f3500000-0000-4000-8000-0000000000c9',ue||'/'||m_leg||'/f3500000-0000-4000-8000-0000000000c9.webp',100,10,10,repeat('e',64));
  r := public.submit_owned_certification(ue,m_leg,'f3500000-0000-4000-8000-0000000000d9','["f3500000-0000-4000-8000-0000000000c9"]',null,null);
  lid := (r->>'id')::uuid;
  if not exists (select 1 from public.telegram_certification_deliveries where submission_id = lid) then raise exception 'legacy submission lost its Telegram card'; end if;
  k := k + 1;

  -- ===== 2. old queue omits proof rows, keeps legacy =====
  txt := public.get_admin_certification_queue(adm,adm_al,'pending')::text;
  if position(sid::text in txt) > 0 then raise exception 'old queue lists a proof row'; end if;
  if position(lid::text in txt) = 0 then raise exception 'old queue lost the legacy row'; end if;
  k := k + 1;

  -- ===== 3. old review paths refuse the proof row =====
  perform pg_temp.expect_error(format('select public.review_admin_certification_submission(%L,%L,extensions.gen_random_uuid(),%L,extensions.gen_random_uuid(),1,%L,null)',adm,adm_al,sid,'approve'),'PROOF_USE_PROOF_REVIEW');
  k := k + 1;
  perform pg_temp.expect_error(format('update public.certification_submissions set status=%L where id=%L','approved',sid),'PROOF_USE_PROOF_REVIEW');
  perform pg_temp.expect_error(format('update public.certification_submissions set status=%L where id=%L','rejected',sid),'PROOF_USE_PROOF_REVIEW');
  k := k + 1;
  -- Telegram approval: a proof row has no delivery, so no callback can approve it
  r := public.approve_telegram_certification('-1001234567890',repeat('0',32),9001,7001,'검토자','reviewer_1');
  if (r->>'outcome') is not distinct from 'approved' then raise exception 'telegram approved something with a bogus token %', r; end if;
  if (select status::text from public.certification_submissions where id = sid) <> 'pending' then raise exception 'proof row left pending'; end if;
  if exists (select 1 from public.community_stamps where app_user_id = ua and kind = 'proof') then raise exception 'stamp issued by old path'; end if;
  k := k + 1;

  -- ===== 4. legacy row still approves through the old RPC =====
  perform public.review_admin_certification_submission(adm,adm_al,extensions.gen_random_uuid(),lid,extensions.gen_random_uuid(),1,'approve',null);
  if (select status::text from public.certification_submissions where id = lid) <> 'approved' then raise exception 'legacy approval broke'; end if;
  if (select count(*) from public.fan_ticket_ledger where source_type='manual_certification' and source_id = lid) <> 1 then raise exception 'legacy ticket missing'; end if;
  k := k + 1;

  -- ===== 5. new review: in_review -> approved creates stamp, slot, points, title, post =====
  r := public.review_certification_proof(adm,sid,(select review_revision from public.certification_submissions where id = sid),'in_review',null);
  r := public.review_certification_proof(adm,sid,(r->>'revision')::integer,'approved',null);
  if r->>'status' <> 'approved' or (r->>'points')::integer <> 500 or (r->>'slotNo') is null then raise exception 'proof approval wrong %', r; end if;
  post := (r->>'postId')::uuid;
  select id into stamp from public.community_stamps where app_user_id = ua and kind = 'proof' and source_key = sid::text;
  if stamp is null then raise exception 'proof stamp missing'; end if;
  if not exists (select 1 from public.passport_page_slots where passport_id = pa and stamp_id = stamp) then raise exception 'slot missing'; end if;
  if (select coalesce(sum(l.amount),0) from public.dukjil_action_log a join public.mobile_fan_economy_ledger l on l.id = a.ledger_id
       where a.action_key='proof' and a.source_key = sid::text and l.asset='fan_point' and l.source_type='dukjil_proof') <> 500 then raise exception 'points wrong'; end if;
  if not exists (select 1 from public.jjinfan_titles where app_user_id = ua and celebrity_id = c1 and proof_submission_id = sid) then raise exception 'title missing'; end if;
  if not exists (select 1 from public.fan_posts where id = post and category = 'proof' and visibility = 'public') then raise exception 'proof post missing'; end if;
  k := k + 1;

  -- ===== 5b. friend-post notification: no intent for a proof post (positive control: a normal post by the same author notifies) =====
  if exists (select 1 from public.fan_web_notification_intents where target_id = post) then raise exception 'proof post created a notification intent'; end if;
  insert into public.fan_posts(celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
    values(c1,ua,'친구 글 positive control',extensions.gen_random_uuid(),repeat('6',64)) returning id into fr_post;
  if not exists (select 1 from public.fan_web_notification_intents where target_id = fr_post and recipient_app_user_id = ub) then
    raise exception 'friend notification positive control missing'; end if;
  k := k + 1;

  -- ===== 6. proof post is on the board but in no general read =====
  txt := public.read_proof_board(c1,20,null)::text;
  if position(post::text in txt) = 0 then raise exception 'proof board lost the post'; end if;
  k := k + 1;
  txt := public.read_fan_posts(null,'p3i-1',null,null,null,'latest',20,'ko')::text;
  if position(post::text in txt) > 0 then raise exception 'read_fan_posts leaks the proof post'; end if;
  if position(norm::text in txt) = 0 then raise exception 'read_fan_posts lost the normal post %', txt; end if;
  k := k + 1;
  txt := public.read_public_popular_posts_page(null,'ko',50,false)::text;
  if position(post::text in txt) > 0 then raise exception 'popular posts leak the proof post'; end if;
  k := k + 1;
  txt := public.read_public_home_feed(null,'ko')::text;
  if position(post::text in txt) > 0 then raise exception 'home feed leaks the proof post'; end if;
  txt := public.read_public_home_feed_page(null,'ko',50)::text;
  if position(post::text in txt) > 0 then raise exception 'home feed page leaks the proof post'; end if;
  k := k + 1;
  if public.fan_web_content_target(null,'fan_post',post,'ko') is not null then raise exception 'content target exposes the proof post'; end if;
  if public.fan_web_content_target(null,'fan_post',norm,'ko') is null then raise exception 'content target lost the normal post'; end if;
  k := k + 1;
  if exists (select 1 from public.mobile_fan_activity_sources where source_type='fan_posts' and source_id = post and eligible) then raise exception 'proof post is an eligible activity source'; end if;
  k := k + 1;

  -- ===== 6b. report / block work for a post that is on the board, and only then =====
  if public.fan_web_content_target(null,'fan_post',post,'ko') is not null then raise exception 'precondition: gate is closed'; end if;
  r := public.post_content_report(ub,'fan_post',post,'부적절한 인증 글',extensions.gen_random_uuid());
  if (r->>'status') <> 'open' or not exists (select 1 from public.content_reports where id = (r->>'id')::uuid and target_type='fan_post' and target_id = post and target_app_user_id = ua) then
    raise exception 'report on a board proof post failed %', r; end if;
  -- viewer block: visible before, hidden to the blocker after (direction is the feeds' fan_web_blocked helper); others and anonymous still see it
  if position(post::text in public.read_proof_board(c1,20,null,ue)::text) = 0 then raise exception 'precondition: viewer cannot see the post before the block'; end if;
  r := public.block_content_author(ue,'fan_post',post);
  if position(post::text in public.read_proof_board(c1,20,null,ue)::text) > 0 then raise exception 'blocked author post still on the board for the blocker'; end if;
  if not public.fan_web_blocked(ua,ue) or not public.fan_web_blocked(ue,ua) then raise exception 'block direction differs from the feeds helper'; end if;
  if position(post::text in public.read_proof_board(c1,20,null,ub)::text) = 0 then raise exception 'other viewer lost the post after an unrelated block'; end if;
  if position(post::text in public.read_proof_board(c1,20,null,null)::text) = 0 or position(post::text in public.read_proof_board(c1,20,null)::text) = 0 then raise exception 'anonymous board lost the post'; end if;
  if public.read_proof_board(c1,20,null,ue)::text like '%app_user_id%' or public.read_proof_board(c1,20,null,ue)::text like '%'||ua::text||'%' then raise exception 'board exposes an author identifier'; end if;
  if not exists (select 1 from public.user_blocks where app_user_id = ue and blocked_app_user_id = ua) then raise exception 'author block via proof post failed'; end if;
  if coalesce(current_setting('byus.proof_report',true),'') = 'on' then raise exception 'report flag leaked after the call'; end if;
  if public.fan_web_content_target(null,'fan_post',post,'ko') is not null then raise exception 'gate stayed open after report'; end if;
  perform pg_temp.expect_error(format('select public.set_fan_post_like(%L,%L,true)',ub,post),'FAN_WEB_NOT_FOUND');
  k := k + 1;
  -- withdrawn consent: no longer on the board, no longer reportable
  update public.certification_submissions set publish_consent = false where id = sid;
  perform pg_temp.expect_error(format('select public.post_content_report(%L,%L,%L,%L,extensions.gen_random_uuid())',uf,'fan_post',post,'동의 철회 글'),'FAN_WEB_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.block_content_author(%L,%L,%L)',uf,'fan_post',post),'FAN_WEB_NOT_FOUND');
  update public.certification_submissions set publish_consent = true where id = sid;
  k := k + 1;
  -- admin hide: report resolves with hide, post leaves the board, nobody can report it afterwards
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c5',ug,c1,m1);
  r := public.submit_certification_proof(ug,c1,'receipt','f3500000-0000-4000-8000-0000000000c5',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d5',repeat('4',64),false,'영수증 인증해요 넷');
  sid_g := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sid_g,(select review_revision from public.certification_submissions where id = sid_g),'in_review',null);
  r := public.review_certification_proof(adm,sid_g,(r->>'revision')::integer,'approved',null);
  post_g := (r->>'postId')::uuid;
  r := public.post_content_report(ue,'fan_post',post_g,'운영 숨김 대상 글',extensions.gen_random_uuid());
  rep_id := (r->>'id')::uuid;
  perform public.resolve_admin_content_report(adm,adm_al,extensions.gen_random_uuid(),rep_id,'resolved',true,'운영 정책 위반으로 숨깁니다',false);
  if (select hidden_at from public.fan_posts where id = post_g) is null then raise exception 'admin hide did not hide the proof post'; end if;
  if position(post_g::text in public.read_proof_board(c1,20,null)::text) > 0 then raise exception 'hidden proof post still on the board'; end if;
  perform pg_temp.expect_error(format('select public.post_content_report(%L,%L,%L,%L,extensions.gen_random_uuid())',ub,'fan_post',post_g,'숨김 뒤 신고'),'FAN_WEB_NOT_FOUND');
  k := k + 1;

  -- ===== 7. proof post body is read-only, author deletion still works =====
  perform pg_temp.expect_error(format('update public.fan_posts set body=%L where id=%L','바꾼 글',post),'PROOF_POST_READ_ONLY');
  perform pg_temp.expect_error(format('select public.save_fan_post(%L,%L,%L,%L,%L,null,1,extensions.gen_random_uuid())',ua,'p3i-1',post,'바꾼 글','public'),'PROOF_POST_READ_ONLY');
  k := k + 1;
  perform public.remove_fan_post(ua,post);
  if (select deleted_at from public.fan_posts where id = post) is null then raise exception 'author deletion broke'; end if;
  k := k + 1;

  -- ===== 8. voided proof stamp leaves the board and its image path (provisional) =====
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c2',ub,c1,m1);
  r := public.submit_certification_proof(ub,c1,'receipt','f3500000-0000-4000-8000-0000000000c2',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d2',repeat('2',64),false,'영수증 인증해요 둘');
  sid_b := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sid_b,(select review_revision from public.certification_submissions where id = sid_b),'in_review',null);
  r := public.review_certification_proof(adm,sid_b,(r->>'revision')::integer,'approved',null);
  post_b := (r->>'postId')::uuid;
  select id into stamp from public.community_stamps where app_user_id = ub and kind = 'proof' and source_key = sid_b::text;
  txt := public.read_proof_board(c1,20,null)::text;
  if position(sid_b::text in txt) = 0 then raise exception 'board missing the second proof before void'; end if;
  perform public.void_passport_stamp(adm, stamp, '부정 증빙', true, 'p3i-void-1');
  perform pg_temp.expect_error(format('select public.post_content_report(%L,%L,%L,%L,extensions.gen_random_uuid())',ue,'fan_post',post_b,'무효 도장 글'),'FAN_WEB_NOT_FOUND');
  txt := public.read_proof_board(c1,20,null)::text;
  if position(sid_b::text in txt) > 0 or position(post_b::text in txt) > 0 then raise exception 'voided proof still on the board'; end if;
  k := k + 1;

  -- ===== 9. sanctioned / inactive applicant =====
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c3',uf,c1,m1);
  r := public.submit_certification_proof(uf,c1,'receipt','f3500000-0000-4000-8000-0000000000c3',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d3',repeat('3',64),false,'영수증 인증해요 셋');
  sid_f := (r->>'id')::uuid;
  update public.app_users set status = 'disabled' where id = uf;
  r := public.review_certification_proof(adm,sid_f,(select review_revision from public.certification_submissions where id = sid_f),'in_review',null);
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%s,%L,null)',adm,sid_f,(r->>'revision'),'approved'),'PROOF_STAMP_UNAVAILABLE');
  if exists (select 1 from public.community_stamps where app_user_id = uf and kind = 'proof') then raise exception 'sanctioned applicant got a stamp'; end if;
  if exists (select 1 from public.dukjil_action_log where app_user_id = uf and action_key = 'proof') then raise exception 'sanctioned applicant got a reward'; end if;
  if (select status::text from public.certification_submissions where id = sid_f) <> 'in_review' then raise exception 'failed approval changed the row'; end if;
  k := k + 1;
  r := public.review_certification_proof(adm,sid_f,(select review_revision from public.certification_submissions where id = sid_f),'changes_requested','사진을 다시 올려 주세요');
  if r->>'status' <> 'changes_requested' then raise exception 'changes_requested failed for disabled applicant %', r; end if;
  k := k + 1;
  update public.app_users set status = 'active' where id = uf;
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c4',uf,c1,m1);
  r := public.resubmit_certification_proof(uf,sid_f,(select review_revision from public.certification_submissions where id = sid_f),'f3500000-0000-4000-8000-0000000000c4',array['0123456789abcdef']);
  update public.app_users set status = 'disabled' where id = uf;
  r := public.review_certification_proof(adm,sid_f,(select review_revision from public.certification_submissions where id = sid_f),'rejected','기준 미달');
  if r->>'status' <> 'rejected' then raise exception 'rejection failed for disabled applicant %', r; end if;
  k := k + 1;
  -- the general wallet-write active check is intact
  perform pg_temp.expect_error(format('select public.group_wallet_lock(%L,true)',uf),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  k := k + 1;

  -- ===== 10. moderation-restricted applicant (app_user_moderation_restrictions) =====
  r := public.post_content_report(ue,'fan_post',norm,'제재 근거 신고용 글',extensions.gen_random_uuid());
  insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id) values(ur,(r->>'id')::uuid,'제재 시험용 사유입니다',adm_al);
  update public.app_user_moderation_restrictions set revoked_at = now() where app_user_id = ur;
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c6',ur,c1,m1);
  r := public.submit_certification_proof(ur,c1,'receipt','f3500000-0000-4000-8000-0000000000c6',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d6',repeat('5',64),false,'영수증 인증해요 다섯');
  sid_r := (r->>'id')::uuid;
  update public.app_user_moderation_restrictions set revoked_at = null where app_user_id = ur;
  r := public.review_certification_proof(adm,sid_r,(select review_revision from public.certification_submissions where id = sid_r),'in_review',null);
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%s,%L,null)',adm,sid_r,(r->>'revision'),'approved'),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  if exists (select 1 from public.community_stamps where app_user_id = ur and kind = 'proof') or exists (select 1 from public.dukjil_action_log where app_user_id = ur and action_key = 'proof') then
    raise exception 'restricted applicant got a stamp or reward'; end if;
  if (select status::text from public.certification_submissions where id = sid_r) <> 'in_review' then raise exception 'failed approval changed the restricted row'; end if;
  k := k + 1;
  r := public.review_certification_proof(adm,sid_r,(select review_revision from public.certification_submissions where id = sid_r),'changes_requested','사진을 다시 올려 주세요');
  if r->>'status' <> 'changes_requested' then raise exception 'changes_requested failed for restricted applicant %', r; end if;
  update public.app_user_moderation_restrictions set revoked_at = now() where app_user_id = ur;
  perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c7',ur,c1,m1);
  r := public.resubmit_certification_proof(ur,sid_r,(select review_revision from public.certification_submissions where id = sid_r),'f3500000-0000-4000-8000-0000000000c7',array['0123456789abcdef']);
  update public.app_user_moderation_restrictions set revoked_at = null where app_user_id = ur;
  r := public.review_certification_proof(adm,sid_r,(select review_revision from public.certification_submissions where id = sid_r),'rejected','기준 미달');
  if r->>'status' <> 'rejected' then raise exception 'rejection failed for restricted applicant %', r; end if;
  k := k + 1;

  -- ===== 11. account deletion with proof posts (opus finding 2) =====
  declare
    ud uuid := 'f3500000-0000-4000-8000-000000000029'; uh uuid := 'f3500000-0000-4000-8000-00000000002a';
    sid_d uuid; post_d uuid; sid_h uuid; post_h uuid; pd uuid; ph uuid;
  begin
    perform pg_temp.mkuser(ud,29); perform pg_temp.mkuser(uh,30);
    pd := pg_temp.mkpass(ud,c1); ph := pg_temp.mkpass(uh,c1);
    -- ud: approved and public on the board
    perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000c8',ud,c1,m1);
    r := public.submit_certification_proof(ud,c1,'receipt','f3500000-0000-4000-8000-0000000000c8',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000d8',repeat('8',64),false,'삭제 시험 공개 글 여섯');
    sid_d := (r->>'id')::uuid;
    r := public.review_certification_proof(adm,sid_d,(select review_revision from public.certification_submissions where id = sid_d),'in_review',null);
    r := public.review_certification_proof(adm,sid_d,(r->>'revision')::integer,'approved',null);
    post_d := (r->>'postId')::uuid;
    if position(post_d::text in public.read_proof_board(c1,50,null)::text) = 0 then raise exception 'precondition: ud proof not on the board'; end if;
    -- uh: changes requested, then resubmitted and waiting (pending, consent and text still stored)
    perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000ca',uh,c1,m1);
    r := public.submit_certification_proof(uh,c1,'receipt','f3500000-0000-4000-8000-0000000000ca',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000da',repeat('a',64),false,'삭제 시험 재제출 글 일곱');
    sid_h := (r->>'id')::uuid;
    r := public.review_certification_proof(adm,sid_h,(select review_revision from public.certification_submissions where id = sid_h),'in_review',null);
    r := public.review_certification_proof(adm,sid_h,(r->>'revision')::integer,'changes_requested','사진을 다시 올려 주세요');
    perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000cb',uh,c1,m1);
    r := public.resubmit_certification_proof(uh,sid_h,(select review_revision from public.certification_submissions where id = sid_h),'f3500000-0000-4000-8000-0000000000cb',array['0123456789abcdef']);
    if (select status::text from public.certification_submissions where id = sid_h) <> 'pending'
       or (select post_body from public.certification_submissions where id = sid_h) is null then raise exception 'precondition: uh resubmission state'; end if;
    k := k + 1;

    -- ordinary edits stay rejected, also with the scrub flag set (only blanking passes)
    perform pg_temp.expect_error(format('update public.fan_posts set body=%L where id=%L','',post_b),'PROOF_POST_READ_ONLY');
    perform set_config('byus.proof_scrub','on',true);
    perform pg_temp.expect_error(format('update public.fan_posts set body=%L where id=%L','다른 글',post_b),'PROOF_POST_READ_ONLY');
    perform set_config('byus.proof_scrub','off',true);
    k := k + 1;

    -- approved + public
    perform pg_temp.erase(ud,29);
    perform pg_temp.assert_scrubbed(c1,adm,ud,sid_d,post_d);
    k := k + 1;
    -- resubmission pending (no post yet)
    perform pg_temp.erase(uh,30);
    perform pg_temp.assert_scrubbed(c1,adm,uh,sid_h,null);
    k := k + 1;
    -- author-deleted proof post (ua: approved, post removed by the author in group 7)
    if (select post_body from public.certification_submissions where id = sid) is null then raise exception 'precondition: ua copy already empty'; end if;
    perform pg_temp.erase(ua,21);
    perform pg_temp.assert_scrubbed(c1,adm,ua,sid,post);
    k := k + 1;
    if coalesce(current_setting('byus.proof_scrub',true),'') = 'on' then raise exception 'scrub flag leaked after deletion'; end if;
    -- a legacy (membership) submission is untouched by the new update
    if (select count(*) from public.certification_submissions where proof_type is null and post_body is not null) <> 0 then raise exception 'legacy row got post_body'; end if;
    k := k + 1;
  end;

  -- ===== 12. wave mission "introduction" does not count proof posts (opus finding 5) =====
  declare
    uw uuid := 'f3500000-0000-4000-8000-00000000002b'; mw uuid := 'f3500000-0000-4000-8000-0000000000a3'; rrw uuid := 'f3500000-0000-4000-8000-0000000000b3';
    wave uuid; sid_w uuid; stat text;
  begin
    select id into wave from public.celebrities where slug = 'kyaa-wave-fanpage';
    if wave is null then
      wave := extensions.gen_random_uuid();
      insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(wave,'kyaa-wave-fanpage','draft','/d.webp',null,'{artist}','idol');
      insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(wave,'ko','W','W','W'),(wave,'en','W','W','W');
      update public.celebrities set status='published' where id=wave;
    end if;
    perform pg_temp.mkuser(uw,31);
    insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint,created_at) values(uw,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',8),repeat('e',64),now()-interval '1 day');
    perform pg_temp.mkpass(uw,wave);
    insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
      values(mw,wave,'p3i-wave-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt');
    insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
      values(rrw,mw,1,1,0,0,adm,adm_al,extensions.gen_random_uuid());
    perform pg_temp.mkupload('f3500000-0000-4000-8000-0000000000cc',uw,wave,mw);
    r := public.submit_certification_proof(uw,wave,'receipt','f3500000-0000-4000-8000-0000000000cc',true,true,array['0123456789abcdef'],'f3500000-0000-4000-8000-0000000000dc',repeat('c',64),false,'웨이브 인증 글 여덟');
    sid_w := (r->>'id')::uuid;
    r := public.review_certification_proof(adm,sid_w,(select review_revision from public.certification_submissions where id = sid_w),'in_review',null);
    r := public.review_certification_proof(adm,sid_w,(r->>'revision')::integer,'approved',null);
    if not exists (select 1 from public.fan_posts where app_user_id = uw and celebrity_id = wave and category = 'proof' and visibility = 'public' and deleted_at is null) then
      raise exception 'precondition: wave proof post missing'; end if;
    select e->>'status' into stat from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(uw)->'progress') e where e->>'key' = 'introduction';
    if stat is distinct from 'pending' then raise exception 'proof post counted as a wave introduction (%)', stat; end if;
    -- positive control: a normal public post completes it
    insert into public.fan_posts(celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
      values(wave,uw,'웨이브 소개 글 positive control',extensions.gen_random_uuid(),repeat('5',64));
    select e->>'status' into stat from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(uw)->'progress') e where e->>'key' = 'introduction';
    if stat is distinct from 'completed' then raise exception 'normal post no longer completes the wave introduction (%)', stat; end if;
    k := k + 1;
  end;

  -- ===== 13. function owner rights (opus finding 1): wrapper, renamed copy and caller owned by different roles =====
  -- A clean replay owns everything with one role. Here the renamed legacy copies belong to one role, the new wrappers to a second, and a
  -- legacy-style caller to the first, like imported postgres-owned functions next to migration-admin-owned wrappers on AWS dev.
  create role p3_legacy_owner nologin bypassrls;
  create role p3_wrapper_owner nologin bypassrls;
  grant usage, create on schema public to p3_legacy_owner, p3_wrapper_owner;
  grant all on all tables in schema public to p3_legacy_owner, p3_wrapper_owner;
  grant execute on all functions in schema public to p3_legacy_owner, p3_wrapper_owner;
  revoke execute on function public.fan_web_content_target(uuid,text,uuid,public.content_locale), public.fan_web_content_target_before_proof(uuid,text,uuid,public.content_locale),
    public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status), public.get_admin_certification_queue_before_proof(uuid,uuid,public.certification_submission_status),
    public.proof_post_on_board(uuid) from p3_legacy_owner, p3_wrapper_owner;
  alter function public.fan_web_content_target_before_proof(uuid,text,uuid,public.content_locale) owner to p3_legacy_owner;
  alter function public.get_admin_certification_queue_before_proof(uuid,uuid,public.certification_submission_status) owner to p3_legacy_owner;
  alter function public.fan_web_content_target(uuid,text,uuid,public.content_locale) owner to p3_wrapper_owner;
  alter function public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status) owner to p3_wrapper_owner;
  create function public.p3_probe_target(p uuid) returns jsonb language sql security definer set search_path = '' as $f$
    select public.fan_web_content_target(null,'fan_post',p,'ko') $f$;
  alter function public.p3_probe_target(uuid) owner to p3_legacy_owner;
  revoke execute on function public.fan_web_content_target(uuid,text,uuid,public.content_locale), public.fan_web_content_target_before_proof(uuid,text,uuid,public.content_locale),
    public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status), public.get_admin_certification_queue_before_proof(uuid,uuid,public.certification_submission_status),
    public.proof_post_on_board(uuid) from p3_legacy_owner, p3_wrapper_owner;
  -- before the grant helper the cross-owner calls fail, which is the AWS failure this guards against
  perform pg_temp.expect_error(format('select public.p3_probe_target(%L)',norm),'permission denied for function');
  perform pg_temp.expect_error(format('select public.get_admin_certification_queue(%L,%L,%L)',adm,adm_al,'pending'),'permission denied for function');
  perform public.p3_grant_isolation_owner_execute();
  if public.p3_probe_target(norm) is null then raise exception 'normal post read failed under separate owners'; end if;
  if public.p3_probe_target(post_b) is not null then raise exception 'proof post visible through the gate under separate owners'; end if;
  if jsonb_typeof(public.get_admin_certification_queue(adm,adm_al,'pending')) <> 'array' then raise exception 'legacy queue failed under separate owners'; end if;
  k := k + 1;

  raise notice 'passport P3 isolation assertion groups: %', k;
end $$;

select 'passport P3 isolation assertions passed' as result;
rollback;
