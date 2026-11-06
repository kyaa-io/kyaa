-- Renewal section 15 items 3, 5, 7, 8 through the real RPCs. Disposable clean-chain DB only; everything rolls back.
-- Lines starting 'OBSERVED' are current behaviour handed to a user decision, not a statement that the behaviour is right.
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
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:r15-'||n,'r15-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'r15-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','r15','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text, at timestamptz) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'r15-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,at,j);
  set local session_replication_role = origin;
  return s;
end $$;

-- fills slots first..last of a page with old fixture stamps; returns the last stamp
create function pg_temp.fill(u uuid, c uuid, pass uuid, pg integer, first_slot integer, last_slot integer) returns uuid language plpgsql as $$
declare i integer; s uuid;
begin
  for i in first_slot..last_slot loop
    s := pg_temp.mkstamp(u, c, 'quiz', 'r15-fill-'||pg||'-'||i||'-'||pass, now() - interval '3 days');
    insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pass,pg,i,s,now());
  end loop;
  return s;
end $$;

create function pg_temp.mkupload(id uuid, u uuid, c uuid, m uuid) returns uuid language plpgsql as $$
begin
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,expires_at)
    values(id,u,c,m,u||'/'||m||'/'||id||'.webp','image/webp',100,10,10,repeat('a',64),now() + interval '1 hour');
  return id;
end $$;

create function pg_temp.page(road jsonb, n integer) returns jsonb language sql as $$
  select p from jsonb_array_elements(road->'pages') p where (p->>'pageNo')::integer = n
$$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f1500000-0000-4000-8000-000000000001';
  adm uuid := 'f1500000-0000-4000-8000-000000000010'; adm_al uuid := 'f1500000-0000-4000-8000-000000000011';
  ua uuid := 'f1500000-0000-4000-8000-000000000021'; ub uuid := 'f1500000-0000-4000-8000-000000000022';
  uc uuid := 'f1500000-0000-4000-8000-000000000023'; ud uuid := 'f1500000-0000-4000-8000-000000000024';
  ue uuid := 'f1500000-0000-4000-8000-000000000025'; viewer uuid := 'f1500000-0000-4000-8000-000000000026';
  m1 uuid := 'f1500000-0000-4000-8000-0000000000a1'; rr1 uuid := 'f1500000-0000-4000-8000-0000000000b1';
  up1 uuid := 'f1500000-0000-4000-8000-0000000000c1'; up2 uuid := 'f1500000-0000-4000-8000-0000000000c2';
  up3 uuid := 'f1500000-0000-4000-8000-0000000000c3'; up4 uuid := 'f1500000-0000-4000-8000-0000000000c4';
  pa uuid; pb uuid; pc uuid; pd uuid; pe uuid; r jsonb; r2 jsonb; road jsonb; sa uuid; sb uuid; sc uuid; post uuid; s1 uuid; s2 uuid; txt text; bal bigint; k integer := 0;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'r15-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','R15','R15','R15'),(c1,'en','R15','R15','R15');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22); perform pg_temp.mkuser(uc,23);
  perform pg_temp.mkuser(ud,24); perform pg_temp.mkuser(ue,25); perform pg_temp.mkuser(viewer,26);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'r15-10@byus.test','admin',true);
  pa := pg_temp.mkpass(ua,c1); pb := pg_temp.mkpass(ub,c1); pc := pg_temp.mkpass(uc,c1); pd := pg_temp.mkpass(ud,c1); pe := pg_temp.mkpass(ue,c1);
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'r15-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt');
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid());

  -- ===== item 3: a stamp of a full slot goes to page 2 while page 1 is incomplete =====
  s1 := pg_temp.mkstamp(ua,c1,'post','r15-old-post',now() - interval '2 days');
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pa,1,3,s1,now());
  r := public.assign_passport_stamp(ua,c1,'post','r15-post-today');
  if (r->>'pageNo')::int <> 2 or (r->>'slotNo')::int <> 1 then raise exception 'item 3: stamp of a filled slot must go to page 2 %', r; end if;
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,1)->>'filled')::int <> 1 or (pg_temp.page(road,1)->>'claimable')::boolean then raise exception 'item 3: page 1 %', pg_temp.page(road,1); end if;
  if not (pg_temp.page(road,2)->>'locked')::boolean or pg_temp.page(road,2)->>'lockReason' <> 'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN' then raise exception 'item 3: page 2 lock %', pg_temp.page(road,2); end if;
  -- a kind without a mission-book slot also lands on page 2
  r := public.assign_passport_stamp(ua,c1,'reaction','r15-reaction-1');
  if (r->>'pageNo')::int <> 2 or (r->>'slotNo')::int <> 2 then raise exception 'item 3: reaction must fill page 2 %', r; end if;
  k := k + 1;

  -- full page 2 before the title stays locked; the proof approval opens it
  perform pg_temp.fill(ua,c1,pa,2,3,9);
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,2)->>'filled')::int <> 9 or (pg_temp.page(road,2)->>'claimable')::boolean or road->>'jjinfan' <> 'false' then raise exception 'item 3: full page 2 before title %', road; end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,2,%L)',ua,c1,'r15-claim-a2-early'),'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN');
  if public.passport_hearts(ua,c1) <> 0 then raise exception 'item 3: locked claim minted a heart'; end if;
  k := k + 1;

  -- ===== items 7, 8: a proof without publish consent =====
  perform pg_temp.mkupload(up1,ua,c1,m1);
  -- item 7: personal data in the one-liner refuses the proof and stores nothing
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,''receipt'',%L,false,false,array[''0123456789abcdef''],%L,%L,true,null)',ua,c1,up1,extensions.gen_random_uuid(),repeat('9',64)),'PROOF_PII_DETECTED');
  if exists(select 1 from public.certification_submissions where app_user_id=ua) then raise exception 'item 7: blocked proof stored a row'; end if;
  r := public.submit_certification_proof(ua,c1,'receipt',up1,false,false,array['0123456789abcdef'],'f1500000-0000-4000-8000-0000000000d1',repeat('1',64));
  sa := (r->>'id')::uuid;
  bal := public.group_wallet_balance(ua,'fan_point');
  r := public.review_certification_proof(adm,sa,(r->>'revision')::bigint,'approved');
  if r->>'postId' is not null or not (r->>'titleIssued')::boolean or (r->>'points')::int <> 500 then raise exception 'item 8: approval %', r; end if;
  if (r->>'pageNo')::int <> 1 or (r->>'slotNo')::int <> 9 then raise exception 'item 3: first proof must take slot 9 %', r; end if;
  if public.group_wallet_balance(ua,'fan_point') <> bal + 500 then raise exception 'item 8: points'; end if;
  if exists(select 1 from public.fan_posts where source_id=sa) then raise exception 'item 8: consent-less proof has a post'; end if;
  if (select post_body from public.certification_submissions where id=sa) is not null then raise exception 'item 8: consent-less proof kept a body'; end if;
  k := k + 1;

  -- item 3: the title opens page 2
  road := public.read_passport_roadmap(ua,c1);
  if (pg_temp.page(road,2)->>'locked')::boolean or not (pg_temp.page(road,2)->>'claimable')::boolean or road->>'jjinfan' <> 'true' then raise exception 'item 3: page 2 after the title %', road; end if;
  r := public.claim_passport_page(ua,c1,2,'r15-claim-a2');
  if (r->>'hearts')::int <> 1 or public.passport_hearts(ua,c1) <> 1 then raise exception 'item 3: claim after title %', r; end if;
  k := k + 1;

  -- item 8: no read path for another member returns the private proof
  foreach txt in array array[
    public.read_proof_board(c1,50,null,null)::text, public.read_proof_board(c1,50,null,viewer)::text,
    public.read_fan_posts(viewer,'r15-1',null,null,null,'latest',20,'ko')::text, public.read_fan_posts(null,'r15-1',null,null,null,'latest',20,'ko')::text,
    public.read_public_popular_posts_page(viewer,'ko',50,false)::text, public.read_public_home_feed(viewer,'ko')::text, public.read_public_home_feed_page(viewer,'ko',50)::text,
    public.read_public_mobile_profile_activities(viewer,ua,'r15-1','ko')::text, public.read_fan_post_period_ranking(viewer,'r15-1','week','ko')::text,
    public.list_my_certification_proofs(viewer,c1)::text
  ] loop
    if position(sa::text in txt) > 0 or position(up1::text in txt) > 0 then raise exception 'item 8: private proof in a read path: %', txt; end if;
  end loop;
  if jsonb_array_length(public.read_proof_board(c1,50,null,null)) <> 0 then raise exception 'item 8: board not empty'; end if;
  if jsonb_array_length(public.list_my_certification_proofs(viewer,c1)) <> 0 then raise exception 'item 8: another member listed the proof'; end if;
  if jsonb_array_length(public.list_my_certification_proofs(ua,c1)) <> 1 then raise exception 'item 8: the owner lost the proof'; end if;
  perform pg_temp.expect_error(format('select public.get_admin_proof_queue(%L,''approved'')',viewer),'ADMIN_REQUIRED');
  k := k + 1;

  -- control: the same paths with consent. On the board, out of the general feeds, off the board after a void
  perform pg_temp.mkupload(up2,ub,c1,m1);
  r := public.submit_certification_proof(ub,c1,'receipt',up2,true,false,array['fedcba9876543210'],'f1500000-0000-4000-8000-0000000000d2',repeat('2',64),false,'공개 동의 한마디');
  sb := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sb,(r->>'revision')::bigint,'approved');
  post := (r->>'postId')::uuid;
  if post is null then raise exception 'item 8 control: post missing %', r; end if;
  if position(post::text in public.read_proof_board(c1,50,null,viewer)::text) = 0 then raise exception 'item 8 control: consent post not on the board'; end if;
  insert into public.fan_post_likes(post_id,app_user_id) values(post,viewer);
  foreach txt in array array[
    public.read_fan_posts(viewer,'r15-1',null,null,null,'latest',20,'ko')::text, public.read_public_popular_posts_page(viewer,'ko',50,false)::text,
    public.read_public_home_feed(viewer,'ko')::text, public.read_public_home_feed_page(viewer,'ko',50)::text,
    public.read_public_mobile_profile_activities(viewer,ub,'r15-1','ko')::text, public.read_fan_post_period_ranking(viewer,'r15-1','week','ko')::text
  ] loop
    if position(post::text in txt) > 0 then raise exception 'item 8 control: proof post outside the board: %', txt; end if;
  end loop;
  k := k + 1;

  -- item 7: a repeat image warns the reviewer and does not reject; a 0 won rejection needs a reason and pays nothing
  perform pg_temp.mkupload(up3,uc,c1,m1);
  r := public.submit_certification_proof(uc,c1,'receipt',up3,false,false,array['fedcba9876543210'],'f1500000-0000-4000-8000-0000000000d3',repeat('3',64));
  sc := (r->>'id')::uuid;
  if r->>'status' <> 'pending' then raise exception 'item 7: duplicate must not be auto-rejected %', r; end if;
  txt := (select e::text from jsonb_array_elements(public.get_admin_proof_queue(adm,'pending')) e where e->>'id' = sc::text);
  if position(sb::text in txt) = 0 then raise exception 'item 7: duplicate warning missing %', txt; end if;
  perform pg_temp.expect_error(format('select public.review_certification_proof(%L,%L,%s,''rejected'',null)',adm,sc,(r->>'revision')),'REASON_REQUIRED');
  bal := public.group_wallet_balance(uc,'fan_point');
  r2 := public.review_certification_proof(adm,sc,(r->>'revision')::bigint,'rejected','0원 결제 내역은 대상이 아닙니다');
  if r2->>'status' <> 'rejected' or public.group_wallet_balance(uc,'fan_point') <> bal or exists(select 1 from public.community_stamps where app_user_id=uc and kind='proof') then raise exception 'item 7: rejection %', r2; end if;
  if (select e->>'reason' from jsonb_array_elements(public.list_my_certification_proofs(uc,c1)) e where e->>'submissionId' = sc::text) <> '0원 결제 내역은 대상이 아닙니다' then raise exception 'item 7: member does not see the reason'; end if;
  k := k + 1;

  -- ===== item 5: void, relock, claim, sanction =====
  -- before the claim: a void takes the page below 9 and locks the claim again; the same claim works after a refill
  s1 := pg_temp.fill(ud,c1,pd,1,1,8);
  s2 := pg_temp.mkstamp(ud,c1,'proof','r15-ud-proof',now() - interval '3 days');
  insert into public.passport_page_slots(passport_id,page_no,slot_no,stamp_id,assigned_at) values(pd,1,9,s2,now());
  if not (pg_temp.page(public.read_passport_roadmap(ud,c1),1)->>'claimable')::boolean then raise exception 'item 5: page 1 must be claimable'; end if;
  r := public.void_passport_stamp(adm,s1,'item 5',false,'r15-void-1');
  if (r->>'jjinfanRevoked')::boolean then raise exception 'item 5: a plain void revoked %', r; end if;
  road := public.read_passport_roadmap(ud,c1);
  if (pg_temp.page(road,1)->>'filled')::int <> 8 or (pg_temp.page(road,1)->>'claimable')::boolean then raise exception 'item 5: relock %', pg_temp.page(road,1); end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,1,%L)',ud,c1,'r15-claim-d1'),'PASSPORT_PAGE_NOT_COMPLETE');
  s1 := pg_temp.mkstamp(ud,c1,'quiz','r15-ud-refill',now() - interval '3 days');
  update public.passport_page_slots set stamp_id=s1, assigned_at=now(), cleared_at=null where passport_id=pd and page_no=1 and slot_no=8;
  r := public.claim_passport_page(ud,c1,1,'r15-claim-d1');
  if not (r->>'jjinfanConfirmed')::boolean then raise exception 'item 5: claim %', r; end if;
  k := k + 1;

  -- after the claim: the void keeps the heart and the claim row, no second heart on replay (D9)
  r := public.void_passport_stamp(adm,s1,'item 5',false,'r15-void-2');
  road := public.read_passport_roadmap(ud,c1);
  if not (pg_temp.page(road,1)->>'claimed')::boolean or (pg_temp.page(road,1)->>'filled')::int <> 8 or public.passport_hearts(ud,c1) <> 1 then raise exception 'item 5: after claim %', road; end if;
  r := public.claim_passport_page(ud,c1,1,'r15-claim-d1-again');
  if not (r->>'replayed')::boolean or public.passport_hearts(ud,c1) <> 1 then raise exception 'item 5: replay %', r; end if;
  k := k + 1;

  -- sanction: title revoked, jjinfanRevoked true, page 2 locks again and its claim is refused, the heart stays
  perform pg_temp.fill(ud,c1,pd,2,1,9);
  if not (pg_temp.page(public.read_passport_roadmap(ud,c1),2)->>'claimable')::boolean then raise exception 'item 5: page 2 must be open'; end if;
  r := public.void_passport_stamp(adm,s2,'item 5 fraud',true,'r15-void-3');
  if not (r->>'jjinfanRevoked')::boolean or r->>'pointCorrection' <> 'none' then raise exception 'item 5: sanction %', r; end if;
  road := public.read_passport_roadmap(ud,c1);
  if not (pg_temp.page(road,2)->>'locked')::boolean or (pg_temp.page(road,2)->>'claimable')::boolean or road->>'jjinfan' <> 'false' then raise exception 'item 5: page 2 relock %', road; end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,2,%L)',ud,c1,'r15-claim-d2'),'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN');
  if public.passport_hearts(ud,c1) <> 1 then raise exception 'item 5: the heart must stay'; end if;
  k := k + 1;

  -- proof void: 500P comes back once, the consent post leaves the board, slot 9 clears
  r := public.void_passport_stamp(adm,(select stamp_id from public.dukjil_action_log where app_user_id=ub and action_key='proof'),'item 5',false,'r15-void-4');
  if r->>'pointCorrection' <> 'corrected' or public.group_wallet_balance(ub,'fan_point') <> 0 then raise exception 'item 5: proof void %', r; end if;
  if position(post::text in public.read_proof_board(c1,50,null,null)::text) > 0 then raise exception 'item 5: voided proof on the board'; end if;
  if (pg_temp.page(public.read_passport_roadmap(ub,c1),1)->>'filled')::int <> 0 then raise exception 'item 5: slot 9 still filled'; end if;
  k := k + 1;

  -- ===== stamps without a limit stack from page 2 (user decision 2026-11-06), details in passport_stacking_pages.sql =====
  -- ua's page 2 was claimed full, so the second approved proof opens page 3
  perform pg_temp.mkupload(up4,ua,c1,m1);
  r := public.submit_certification_proof(ua,c1,'receipt',up4,false,false,array['1111222233334444'],'f1500000-0000-4000-8000-0000000000d4',repeat('4',64));
  r := public.review_certification_proof(adm,(r->>'id')::uuid,(r->>'revision')::bigint,'approved');
  if (r->>'pageNo')::int <> 3 or (r->>'slotNo')::int <> 1 or (r->>'points')::int <> 100 then raise exception 'second proof must stack %', r; end if;
  r := public.assign_passport_stamp(ue,c1,'subscription','r15-sub-1');
  r2 := public.assign_passport_stamp(ue,c1,'subscription','r15-sub-2');
  if (r->>'slotNo')::int <> 7 or (r2->>'pageNo')::int <> 2 or (r2->>'slotNo')::int <> 1 then raise exception 'second subscription must stack %, %', r, r2; end if;
  r := public.assign_passport_stamp(ue,c1,'live_attend','r15-live-1');
  if (r->>'pageNo')::int <> 2 or (r->>'slotNo')::int <> 2 then raise exception 'live stamp must stack %', r; end if;
  k := k + 1;

  -- ===== item 5: a sanction on a stamp that is already void still revokes the title, once, with an audit row =====
  insert into public.jjinfan_titles(app_user_id,celebrity_id) values(ue,c1);
  perform pg_temp.fill(ue,c1,pe,2,3,9);
  r := public.assign_passport_stamp(ue,c1,'survey','r15-ue-last');
  if (r->>'pageNo')::int <> 3 then raise exception 'page 2 must be full before the sanction %', r; end if;
  s1 := pg_temp.mkstamp(ue,c1,'comment','r15-ue-comment',now() - interval '3 days');
  r := public.void_passport_stamp(adm,s1,'plain first',false,'r15-void-5');
  if (r->>'jjinfanRevoked')::boolean or not exists(select 1 from public.jjinfan_titles where app_user_id=ue and celebrity_id=c1 and revoked_at is null) then raise exception 'item 5: plain void touched the title %', r; end if;
  r := public.void_passport_stamp(adm,s1,'plain first',false,'r15-void-5');
  if (r->>'jjinfanRevoked')::boolean then raise exception 'item 5: plain replay reported a revocation %', r; end if;
  -- only an admin may ask for it, and a refused request changes nothing
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',ue,s1,'self','r15-void-self'),'ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',viewer,s1,'stranger','r15-void-stranger'),'ADMIN_REQUIRED');
  if not exists(select 1 from public.jjinfan_titles where app_user_id=ue and celebrity_id=c1 and revoked_at is null) then raise exception 'item 5: a refused sanction revoked the title'; end if;
  r := public.void_passport_stamp(adm,s1,'sanction later',true,'r15-void-6');
  if (r->>'replayed')::boolean or not (r->>'jjinfanRevoked')::boolean then raise exception 'item 5: a sanction that revokes the title is not a replay %', r; end if;
  if exists(select 1 from public.jjinfan_titles where app_user_id=ue and celebrity_id=c1 and revoked_at is null) then raise exception 'item 5: the title stayed active'; end if;
  if (select count(*) from public.audit_logs where action='passport.stamp.sanction_after_void' and entity_id=s1::text and actor_app_user_id=adm) <> 1 then raise exception 'item 5: audit row'; end if;
  if (select before_after_summary->>'reason' from public.audit_logs where action='passport.stamp.sanction_after_void' and entity_id=s1::text) is distinct from 'sanction later' then raise exception 'item 5: audit reason missing'; end if;
  road := public.read_passport_roadmap(ue,c1);
  if not (pg_temp.page(road,2)->>'locked')::boolean or (pg_temp.page(road,2)->>'claimable')::boolean then raise exception 'item 5: page 2 must lock %', road; end if;
  perform pg_temp.expect_error(format('select public.claim_passport_page(%L,%L,2,%L)',ue,c1,'r15-claim-e2'),'PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN');
  -- asking again keeps one audit row and the same answer
  r := public.void_passport_stamp(adm,s1,'sanction later',true,'r15-void-6');
  if not (r->>'replayed')::boolean or not (r->>'jjinfanRevoked')::boolean or (select count(*) from public.audit_logs where action='passport.stamp.sanction_after_void' and entity_id=s1::text) <> 1 then raise exception 'item 5: sanction repeat %', r; end if;
  k := k + 1;

  -- a sanction on a member with no title answers false both times
  s1 := pg_temp.mkstamp(uc,c1,'comment','r15-uc-comment',now() - interval '3 days');
  r := public.void_passport_stamp(adm,s1,'no title',true,'r15-void-7');
  r2 := public.void_passport_stamp(adm,s1,'no title',true,'r15-void-7');
  if (r->>'jjinfanRevoked')::boolean or (r2->>'jjinfanRevoked')::boolean then raise exception 'item 5: no title %, %', r, r2; end if;
  k := k + 1;

  -- a stamp already revoked without a void row (a void that lost a race): the sanction still needs an admin, still revokes, and writes the reason
  insert into public.jjinfan_titles(app_user_id,celebrity_id) values(ub,c1) on conflict (app_user_id,celebrity_id) do nothing;
  if not exists(select 1 from public.jjinfan_titles where app_user_id=ub and celebrity_id=c1 and revoked_at is null) then raise exception 'precondition: ub needs an active title'; end if;
  s1 := pg_temp.mkstamp(ub,c1,'comment','r15-ub-no-void-row',now() - interval '3 days');
  update public.community_stamps set revoked_at=now(), revoked_reason='race' where id=s1;
  r := public.void_passport_stamp(ub,s1,'owner replay',false,'r15-void-8');
  if not (r->>'replayed')::boolean or (r->>'jjinfanRevoked')::boolean then raise exception 'no void row: plain replay %', r; end if;
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',viewer,s1,'stranger','r15-void-9'),'ADMIN_REQUIRED');
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,%L,true,%L)',ub,s1,'self','r15-void-10'),'ADMIN_REQUIRED');
  if not exists(select 1 from public.jjinfan_titles where app_user_id=ub and celebrity_id=c1 and revoked_at is null) then raise exception 'no void row: a refused sanction revoked the title'; end if;
  r := public.void_passport_stamp(adm,s1,'late fraud',true,'r15-void-11');
  if (r->>'replayed')::boolean or not (r->>'jjinfanRevoked')::boolean or r->>'pointCorrection' <> 'none' then raise exception 'no void row: sanction %', r; end if;
  if exists(select 1 from public.jjinfan_titles where app_user_id=ub and celebrity_id=c1 and revoked_at is null) then raise exception 'no void row: the title stayed active'; end if;
  if (select before_after_summary->>'reason' from public.audit_logs where action='passport.stamp.sanction_after_void' and entity_id=s1::text) is distinct from 'late fraud' then raise exception 'no void row: audit reason'; end if;
  k := k + 1;

  raise notice 'passport renewal 15: % assertion groups passed', k;
end $$;

-- every function that builds post JSON from fan_posts with neither proof guard: a list to read, not a failure
select p.oid::regprocedure::text as fan_posts_reader_without_proof_guard
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
   and position('fan_posts' in pg_get_functiondef(p.oid)) > 0
   and position('category' in pg_get_functiondef(p.oid)) = 0
   and position('fan_web_content_visible' in pg_get_functiondef(p.oid)) = 0
   and position('visibility' in pg_get_functiondef(p.oid)) > 0
 order by 1;

select 'passport renewal 15 verification passed' as result;
rollback;
