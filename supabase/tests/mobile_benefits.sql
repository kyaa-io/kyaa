do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Mobile benefit tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$ declare
  owner constant uuid:='58000000-0000-4000-8000-000000000001'; celebrity constant uuid:='58000000-0000-4000-8000-000000000002';
  benefit constant uuid:='58000000-0000-4000-8000-000000000003'; policy constant uuid:='58000000-0000-4000-8000-000000000004';
  prize constant uuid:='58000000-0000-4000-8000-000000000005'; request constant uuid:='58000000-0000-4000-8000-000000000006';
  benefit2 constant uuid:='58000000-0000-4000-8000-000000000031';policy2 constant uuid:='58000000-0000-4000-8000-000000000032';prize2 constant uuid:='58000000-0000-4000-8000-000000000033';request2 constant uuid:='58000000-0000-4000-8000-000000000034';tx constant uuid:='58000000-0000-4000-8000-000000000035';
  benefit3 constant uuid:='58000000-0000-4000-8000-000000000061';policy3 constant uuid:='58000000-0000-4000-8000-000000000062';campaign3 constant uuid:='58000000-0000-4000-8000-000000000063';entry3 constant uuid:='58000000-0000-4000-8000-000000000064';
  benefit4 constant uuid:='58000000-0000-4000-8000-000000000071';policy4 constant uuid:='58000000-0000-4000-8000-000000000072';prize4 constant uuid:='58000000-0000-4000-8000-000000000073';request4 constant uuid:='58000000-0000-4000-8000-000000000074';request5 constant uuid:='58000000-0000-4000-8000-000000000075';
  admin_user constant uuid:='58000000-0000-4000-8000-000000000041';admin_allow constant uuid:='58000000-0000-4000-8000-000000000042';quiz constant uuid:='58000000-0000-4000-8000-000000000051';attempt constant uuid:='58000000-0000-4000-8000-000000000052';quiz_pass constant uuid:='58000000-0000-4000-8000-000000000053';job constant uuid:='58000000-0000-4000-8000-000000000054';passport constant uuid:='58000000-0000-4000-8000-000000000055';reward_version integer; result jsonb;paid_ledger uuid;
begin
  select version into reward_version from public.reward_policy_versions order by version desc limit 1;
  insert into public.app_users(id,privy_user_id,verified_email) values(owner,'did:privy:mobile-benefit','mobile-benefit@example.test');
  insert into public.app_users(id,privy_user_id,verified_email) values(admin_user,'did:privy:mobile-benefit-admin','mobile-benefit-admin@example.test');
  insert into public.admin_allowlist(id,email,role,active) values(admin_allow,'mobile-benefit-admin@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(celebrity,'mobile-benefit','draft','/test.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (celebrity,'ko','모바일 경품','설명','이미지'),(celebrity,'en','Mobile benefit','Summary','Image');
  update public.celebrities set status='published',published_at=now() where id=celebrity;
  insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values(celebrity,true);
  insert into public.celebrity_quizzes(id,celebrity_id,version,status) values(quiz,celebrity,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values(attempt,owner,celebrity,quiz,1,extensions.gen_random_uuid(),'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(quiz_pass,owner,celebrity,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload) values(job,'passport',passport,'mobile-benefit-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(passport,owner,celebrity,quiz_pass,job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)
    values(benefit,'mobile-benefit-prize',celebrity,'draft','text',now()-interval '1 hour',now()+interval '2 hours');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)
    values(benefit,'ko','테스트 경품','테스트 경품 설명','응모권 2장','디지털 수령'),
      (benefit,'en','Test prize','Test prize summary','Two tickets','Digital delivery');
  insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values(benefit,'text','test delivery');
  update public.benefits set publication_status='published',published_at=now() where id=benefit;
  insert into public.mobile_store_sandbox_testers(app_user_id,enabled) values(owner,true);
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,enabled,opens_at,closes_at)
    values(policy,benefit,'instant_draw','gift-v1',2,false,now()-interval '1 hour',now()+interval '1 hour');
  insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method)
    values(prize,policy,'won',1,1,'digital');
  if jsonb_array_length(public.read_owned_mobile_benefit_catalog(owner,'mobile-benefit','ko')->'items')<>0 then raise exception 'Disabled policy leaked into catalog'; end if;
  update public.mobile_benefit_policies set enabled=true where id=policy;
  result:=public.read_owned_mobile_benefit_catalog(owner,'mobile-benefit','ko');
  if result#>>'{items,0,eligibilityLabel}'<>'응모권 2장'or result#>>'{items,0,instantOdds,totalWeight}'<>'1'or result#>>'{items,0,instantOdds,outcomes,0,weight}'<>'1'then raise exception'Catalog policy and fixed odds missing: %',result;end if;
  result:=public.read_owned_mobile_benefit_free_ticket_missions(owner,'mobile-benefit');
  if result#>>'{policy,status}'<>'configured'or result#>>'{missions,0,key}'<>'daily_attendance'or result#>>'{missions,2,key}'<>'first_signup'or result#>>'{missions,2,status}'<>'awarded'or result#>>'{missions,2,eligibilitySource}'<>'quiz_pass'or(result#>>'{missions,2,defaultPassportCounts}')::boolean then raise exception'Free ticket mission source invalid: %',result;end if;
  -- Passing the quiz already grants one verification ticket; add four more so
  -- the fixture starts the draw flow with exactly five free tickets.
  perform public.post_fan_ticket_entry(owner,celebrity,'credit',4,'mobile_benefit_test',request,extensions.gen_random_uuid(),reward_version,null,null);
  result:=public.draw_owned_mobile_benefit(owner,benefit,request,'gift-v1',now());
  if result->>'outcome'<>'won' or (result->>'freeTicketsUsed')::integer<>2 or (result->>'paidTicketsUsed')::integer<>0 then raise exception 'Draw result invalid: %',result; end if;
  if result->>'awardId'is null or result->>'awardId'<>(select id::text from public.mobile_benefit_awards where draw_request_id=request)then raise exception'Draw award routing missing: %',result;end if;
  result:=public.draw_owned_mobile_benefit(owner,benefit,request,'gift-v1',now());
  if not (result->>'replayed')::boolean then raise exception 'Draw replay was not stable'; end if;
  if public.read_owned_mobile_benefit_draw(owner,'58000000-0000-4000-8000-000000000099')is not null or public.read_owned_mobile_benefit_entry(owner,'58000000-0000-4000-8000-000000000099')is not null then raise exception'Unknown request status was not nullable';end if;
  if (select count(*) from public.mobile_benefit_draw_requests where id=request)<>1 or (select inventory_awarded from public.mobile_benefit_instant_prizes where id=prize)<>1 then raise exception 'Replay duplicated draw or inventory'; end if;
  if public.get_fan_ticket_balance(owner,celebrity)<>3 then raise exception 'Free ticket debit was not atomic: %',public.get_fan_ticket_balance(owner,celebrity); end if;
  if not exists(select 1 from public.mobile_benefit_awards where draw_request_id=request and fulfillment_status='digital_delivered') then raise exception 'Won draw did not create an owned award'; end if;
  begin perform public.draw_owned_mobile_benefit(owner,benefit,'58000000-0000-4000-8000-000000000007','gift-v1',now()); raise exception 'Sold version accepted another draw'; exception when others then if position('MOBILE_BENEFIT_SOLD_OUT' in sqlerrm)=0 then raise; end if; end;

  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at) values(benefit2,'mobile-benefit-paid-prize',celebrity,'draft','unique_code',now()-interval '1 hour',now()+interval '2 hours');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label) values
    (benefit2,'ko','유료 혼합 경품','설명','응모권 5장','디지털'),(benefit2,'en','Mixed ticket prize','Summary','Five tickets','Digital');
  insert into public.benefit_unique_codes(benefit_id,code_value) values(benefit2,'MOBILE-UNIQUE-001');
  update public.benefits set publication_status='published',published_at=now() where id=benefit2;
  insert into public.mobile_store_transactions(id,store,environment,external_transaction_id,app_user_id,celebrity_id,product_id,currency,amount_krw,ticket_quantity,support_rate_bps,reward_policy_version,state,verification_fingerprint,verified_at)
    values(tx,'apple','sandbox','mobile-benefit-paid-fixture',owner,celebrity,'test.product','KRW',1000,2,0,reward_version,'granted',repeat('a',64),now());
  insert into public.mobile_store_paid_ticket_ledger(app_user_id,celebrity_id,transaction_id,entry_kind,amount,owner_sequence,resulting_balance) values(owner,celebrity,tx,'credit',2,1,2) returning id into paid_ledger;
  update public.mobile_store_transactions set ticket_ledger_id=paid_ledger where id=tx;
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,allow_paid_tickets,enabled,opens_at,closes_at) values(policy2,benefit2,'instant_draw','paid-v1',5,true,false,now()-interval '1 hour',now()+interval '1 hour');
  insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method) values(prize2,policy2,'won',1,1,'digital');
  update public.mobile_benefit_policies set enabled=true where id=policy2;
  result:=public.draw_owned_mobile_benefit(owner,benefit2,request2,'paid-v1',now());
  if (result->>'freeTicketsUsed')::integer<>3 or (result->>'paidTicketsUsed')::integer<>2 then raise exception 'Free-first paid split invalid: %',result; end if;
  if not exists(select 1 from public.mobile_benefit_paid_allocations where draw_request_id=request2 and store_transaction_id=tx and ticket_amount=2) then raise exception 'Paid consumption was not linked to its purchase'; end if;
  if not exists(select 1 from public.mobile_benefit_awards a join public.benefit_claims c on c.id=a.benefit_claim_id join public.benefit_unique_codes code on code.id=c.unique_code_id and code.claimed_by_claim_id=c.id where a.draw_request_id=request2 and a.digital_delivery_value='MOBILE-UNIQUE-001') then raise exception 'Unique code was not issued through the canonical claim inventory'; end if;
  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)values(benefit3,'mobile-period-prize',celebrity,'draft','text',now()-interval'1 day',now()+interval'2 days');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)values(benefit3,'ko','기간 경품','설명','팬 인증','디지털'),(benefit3,'en','Period prize','Summary','Fan verification','Digital');
  insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value)values(benefit3,'text','period delivery');update public.benefits set publication_status='published',published_at=now()where id=benefit3;
  insert into public.live_benefit_campaigns(id,live_event_id,celebrity_id,status,entry_opens_at,entry_closes_at,actor_app_user_id,actor_admin_allowlist_id,published_at)values(campaign3,null,celebrity,'published',now()-interval'2 hours',now()+interval'2 hours',admin_user,admin_allow,now());
  insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,per_fan_ticket_limit,winner_quantity,fulfillment_method,teaser_image_url)values(campaign3,benefit3,1,5,2,'digital','/period-prize.webp');
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,enabled,opens_at,closes_at,result_at)values(policy3,benefit3,'period_raffle','period-v1',1,false,now()-interval'1 hour',now()+interval'1 hour',now()+interval'3 hours');update public.mobile_benefit_policies set enabled=true where id=policy3;
  perform public.post_fan_ticket_entry(owner,celebrity,'credit',2,'mobile_benefit_test',entry3,extensions.gen_random_uuid(),reward_version,null,null);
  result:=public.enter_owned_benefit(owner,benefit3,entry3,1,now());
  if public.read_owned_mobile_benefit_entry(owner,entry3)->>'entryId'<>result->>'entryId'or public.get_owned_raffles(owner,'ko',null,20)#>>'{items,0,imageUrl}'<>'/period-prize.webp'then raise exception'Period entry status/history failed';end if;
  result:=public.read_owned_mobile_benefit_catalog(owner,'mobile-benefit','ko');
  if not exists(select 1 from jsonb_array_elements(result->'items')item where item->>'benefitId'=benefit3::text and item#>>'{periodPolicy,winnerQuantity}'='2'and item->>'imageUrl'='/period-prize.webp')then raise exception'Period catalog policy missing: %',result;end if;
  perform public.set_admin_mobile_benefit_policy_enabled(admin_user,admin_allow,policy2,false,'검증 완료 후 새 버전 작성을 위해 비활성화합니다.','58000000-0000-4000-8000-000000000043');
  perform public.reprocess_admin_mobile_benefit_draw(admin_user,admin_allow,request2,'원본 결과를 유지하며 발급 상태를 다시 확인합니다.','58000000-0000-4000-8000-000000000044');
  result:=public.create_admin_mobile_benefit_policy(admin_user,admin_allow,benefit2,'instant_draw','paid-v2',5,null,true,true,now(),now()+interval '1 hour',null,null,'[{"outcome":"won","weight":1,"inventoryLimit":1,"fulfillmentMethod":"digital","imageUrl":null},{"outcome":"not_selected","weight":9,"inventoryLimit":null,"fulfillmentMethod":null,"imageUrl":null}]','고유 코드 재고 보충 전 비활성 새 버전을 작성합니다.','58000000-0000-4000-8000-000000000045');
  if result->>'policyVersion'<>'paid-v2' or (result->>'enabled')::boolean then raise exception 'Admin version creation invalid: %',result; end if;
  result:=public.create_admin_mobile_benefit_consent(admin_user,admin_allow,'2026-10-test',now(),$json${"ko":{"title":"배송 정보 동의","body":"배송을 위해 수령인 정보를 수집합니다.","documentUrl":null,"items":[{"id":"recipient","label":"이름과 연락처 수집","required":true}]},"en":{"title":"Recipient consent","body":"We collect recipient information for delivery.","documentUrl":null,"items":[{"id":"recipient","label":"Collect name and phone","required":true}]}}$json$::jsonb,'테스트용 배송 동의문 버전을 등록합니다.','58000000-0000-4000-8000-000000000046');
  perform public.set_admin_mobile_benefit_consent_active(admin_user,admin_allow,'2026-10-test',true,'검증된 배송 동의문 버전을 활성화합니다.','58000000-0000-4000-8000-000000000047');
  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)values(benefit4,'mobile-physical-prize',celebrity,'draft','text',now()-interval'1 hour',now()+interval'2 hours');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)values(benefit4,'ko','배송 경품','설명','하루 1회','배송'),(benefit4,'en','Shipping prize','Summary','Once daily','Shipping');
  update public.benefits set publication_status='published',published_at=now()where id=benefit4;
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,daily_limit,enabled,opens_at,closes_at,recipient_deadline_mode,recipient_deadline_duration_hours)values(policy4,benefit4,'instant_draw','physical-v1',1,1,false,now()-interval'1 hour',now()+interval'1 hour','after_award',48);
  insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method)values(prize4,policy4,'won',1,2,'physical_shipping');
  update public.mobile_benefit_policies set enabled=true where id=policy4;
  perform public.post_fan_ticket_entry(owner,celebrity,'credit',2,'mobile_benefit_test',request4,extensions.gen_random_uuid(),reward_version,null,null);
  result:=public.draw_owned_mobile_benefit(owner,benefit4,request4,'physical-v1',now());
  result:=public.read_owned_mobile_benefit_good(owner,(result->>'awardId')::uuid,'ko');
  if result#>>'{recipientPolicy,consentVersion}'<>'2026-10-test'or result#>>'{recipientPolicy,title}'<>'배송 정보 동의'or result->>'recipientDeadlineAt'is null or result->>'shareUrl'<>('/benefits/'||benefit4::text) or (result->>'recipientDeadlineAt')::timestamptz<>(select recipient_deadline_at from public.mobile_benefit_awards where id=(result->>'id')::uuid)then raise exception'Physical deadline/consent/share source missing: %',result;end if;
  perform public.save_owned_mobile_benefit_recipient(owner,(result->>'id')::uuid,'2026-10-test','테스터','010-1234-5678','12345','서울시 테스트로 1','',now());
  begin perform public.draw_owned_mobile_benefit(owner,benefit4,request5,'physical-v1',now());raise exception'Daily limit allowed a second draw';exception when others then if position('MOBILE_BENEFIT_DAILY_LIMIT'in sqlerrm)=0 then raise;end if;end;
  result:=public.draw_owned_mobile_benefit(owner,benefit4,request4,'physical-v1',now());if not(result->>'replayed')::boolean then raise exception'Replay was counted against daily limit';end if;
  update public.benefits set publication_status='draft',published_at=null where id=benefit4;
  result:=public.read_owned_mobile_benefit_good(owner,(result->>'awardId')::uuid,'ko');
  if result->'shareUrl'<>'null'::jsonb then raise exception'Unpublished benefit remained shareable: %',result;end if;
  if jsonb_array_length(public.read_admin_mobile_benefit_policies(admin_user,admin_allow)->'policies')<4 or jsonb_array_length(public.read_admin_mobile_benefit_consents(admin_user,admin_allow)->'versions')<1 or (select count(*) from public.mobile_benefit_admin_audits where actor_app_user_id=admin_user)<>5 then raise exception 'Admin policy/consent/read/audit contract failed'; end if;
end $$;
rollback;
