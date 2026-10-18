-- Keep the complete legacy ticket regression alongside the additive source.
\ir creator_raffle_campaigns.sql
begin;
create function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin
 execute p_sql;
 raise exception 'EXPECTED_ERROR_NOT_RAISED: %',p_message;
exception when others then
 if sqlerrm='EXPECTED_ERROR_NOT_RAISED: '||p_message or position(p_message in sqlerrm)=0 then raise; end if;
end $$;
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERTION_FAILED: %',label; end if; end $$;
do $$
declare
 actor uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); fan2 uuid:=gen_random_uuid();
 creator uuid; creator_slug text; live_id uuid:=gen_random_uuid(); campaign uuid:=gen_random_uuid(); benefit uuid:=gen_random_uuid(); benefit2 uuid:=gen_random_uuid();
 result jsonb; first_message uuid; key1 uuid:=gen_random_uuid(); key2 uuid:=gen_random_uuid(); draw_id uuid; draw_key uuid:=gen_random_uuid(); previous_close timestamptz;
 record_template jsonb; campaign_revision integer; quiz uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid(); pass uuid:=gen_random_uuid(); passport uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); stamp uuid:=gen_random_uuid(); balance_before bigint;
begin
 insert into public.app_users(id,privy_user_id,verified_email,status) values
 (actor,'did:privy:cheer-admin','cheer-admin@example.test','active'),
 (fan,'did:privy:cheer-fan','cheer-fan@example.test','active'),
 (fan2,'did:privy:cheer-fan2','cheer-fan2@example.test','active');
 insert into public.admin_allowlist(id,email,role,active) values(admin_id,'cheer-admin@example.test','admin',true);
 select c.id,c.slug into creator,creator_slug from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale='ko' where c.status='published' and c.archived_at is null limit 1;
 select to_jsonb(l) into record_template from public.live_events l limit 1;
 insert into public.live_events select * from jsonb_populate_record(null::public.live_events,record_template||jsonb_build_object(
 'id',live_id,'celebrity_id',creator,'slug','cheer-test-live','publication_status','published','published_at',clock_timestamp(),'archived_at',null,
 'starts_at',statement_timestamp()+interval '1 day','ends_at',statement_timestamp()+interval '2 days',
 'reservation_opens_at',statement_timestamp()-interval '1 day','reservation_closes_at',statement_timestamp()+interval '1 day'));
 select to_jsonb(b) into record_template from public.benefits b limit 1;
 insert into public.benefits select * from jsonb_populate_record(null::public.benefits,record_template||jsonb_build_object(
 'id',benefit,'delivery_type','text','allocation_mode','direct_claim','celebrity_id',creator,'slug','cheer-test-prize','publication_status','published','published_at',clock_timestamp(),'archived_at',null,
 'claim_opens_at',clock_timestamp()-interval '1 day','claim_closes_at',clock_timestamp()+interval '2 days'));
 insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values(benefit,'text','Disposable test fixture');
 insert into public.benefits select * from jsonb_populate_record(null::public.benefits,(select to_jsonb(b) from public.benefits b where id=benefit)||jsonb_build_object('id',benefit2,'slug','cheer-test-physical-prize'));
 insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label) values(benefit,'ko','Cheer prize','Summary','Fans','Digital');
 insert into public.live_benefit_campaigns(id,live_event_id,entry_source,status,entry_opens_at,entry_closes_at,actor_app_user_id,actor_admin_allowlist_id,published_at)
 values(campaign,live_id,'cheer','published',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',actor,admin_id,clock_timestamp());
 insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,winner_quantity,fulfillment_method) values(campaign,benefit,1,10,'digital'),(campaign,benefit2,2,10,'physical_shipping');
 insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values(quiz,creator,999,'draft',null);
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
 values(attempt,fan,creator,quiz,999,gen_random_uuid(),'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(pass,fan,creator,attempt);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
 values(fan,91342,'0xf100000000000000000000000000000000000001','privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
 values(job,'passport',passport,'byus:passport:v1:'||fan||':'||(select slug from public.celebrities where id=creator),1,jsonb_build_object('recipient','0xf100000000000000000000000000000000000001','celebritySlug',(select slug from public.celebrities where id=creator),'passportId','0x'||repeat('1',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(passport,fan,creator,pass,job);

 perform public.post_fan_ticket_entry(fan,creator,'credit',5,'cheer_test',gen_random_uuid(),gen_random_uuid(),2,null,null);
 balance_before:=public.get_fan_ticket_balance(fan,creator);
 perform pg_temp.expect_error(format('select public.claim_benefit(%L,%L,gen_random_uuid(),now())',benefit,fan),'FANPAGE_INVALID_REQUEST');
 update public.benefits set allocation_mode='application_selection' where id=benefit;
 perform pg_temp.expect_error(format('select public.submit_benefit_application(%L,%L,gen_random_uuid(),now())',benefit,fan),'FANPAGE_INVALID_REQUEST');
 update public.benefits set allocation_mode='direct_claim' where id=benefit;

 perform pg_temp.expect_error(format('select public.enter_owned_benefit_before_free_source(%L,%L,gen_random_uuid(),1,now())',fan,benefit),'FANPAGE_INVALID_REQUEST');
 perform pg_temp.check_true(public.get_fan_ticket_balance(fan,creator)=balance_before,'legacy alias failed ticket debit rolls back');
 perform pg_temp.expect_error(format('select public.execute_admin_cheer_event_draw(%L,%L,gen_random_uuid(),%L,gen_random_uuid(),1)',actor,admin_id,campaign),'PHASE4_BENEFIT_DRAW_EMPTY_CAMPAIGN');
 result:=public.post_celebrity_lounge_message(fan2,creator_slug,'generic',key2,null,'ko');
 perform public.post_celebrity_cheer(fan2,creator_slug,'generic',key2,'ko');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign),'generic replay must not enter');
 update public.live_benefit_campaigns set entry_opens_at=clock_timestamp()+interval '1 minute' where id=campaign;
 perform public.post_celebrity_cheer(fan2,creator_slug,'Upcoming!',gen_random_uuid(),'ko');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign),'upcoming comment not entered');
 update public.live_benefit_campaigns set entry_opens_at=clock_timestamp()-interval '1 hour' where id=campaign;
 perform public.post_celebrity_cheer(fan2,(select c.slug from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale='ko' where c.id<>creator and c.status='published' and c.archived_at is null limit 1),'Other creator!',gen_random_uuid(),'ko');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign),'other creator comment isolated');
 result:=public.post_celebrity_cheer(fan,creator_slug,'Cheer!',key1,'ko'); first_message:=(result->>'id')::uuid;
 perform public.post_celebrity_cheer(fan,creator_slug,'Cheer!',key1,'ko');
 perform public.post_celebrity_cheer(fan,creator_slug,'Again!',gen_random_uuid(),'ko');
 perform public.post_celebrity_lounge_message(fan2,creator_slug,'Reply',gen_random_uuid(),first_message,'ko');
 perform pg_temp.check_true((select count(*)=1 from public.benefit_cheer_entries where campaign_id=campaign),'unique automatic entry; replies excluded');
 perform public.remove_owned_lounge_message(fan,first_message);
 perform pg_temp.check_true((select count(*)=1 from public.benefit_campaign_candidate_weights(campaign,benefit,clock_timestamp())),'removed comment retains entry');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_ticket_entries where campaign_id=campaign),'no ticket entries');
 perform pg_temp.check_true(public.get_fan_ticket_balance(fan,creator)=balance_before,'cheer leaves balance unchanged');
 perform public.reserve_owned_live_event(fan,live_id,gen_random_uuid(),stamp,'byus:stamp:v1:'||stamp,'0x'||repeat('7',64));
 perform pg_temp.check_true((select weight=2 from public.benefit_campaign_candidate_weights(campaign,benefit,clock_timestamp())),'linked reservation doubles weight');
 update public.live_reservations set reserved_at=clock_timestamp()+interval '2 hours' where live_event_id=live_id and app_user_id=fan;
 perform pg_temp.check_true((select weight=1 from public.benefit_campaign_candidate_weights(campaign,benefit,clock_timestamp()+interval '3 hours')),'reservation after entry cutoff does not boost');
 update public.live_reservations set reserved_at=clock_timestamp() where live_event_id=live_id and app_user_id=fan;
 perform pg_temp.expect_error(format('update public.live_benefit_campaigns set entry_source=''tickets'' where id=%L',campaign),'FANPAGE_INVALID_REQUEST');


 perform pg_temp.check_true((public.read_celebrity_cheer_event(creator_slug,fan,'ko')->'event'->'participation'->>'entered')::boolean,'owner entered');
 perform pg_temp.check_true(public.read_celebrity_cheer_event(creator_slug,null,'ko')->'event'->'participation'='null'::jsonb,'guest hides participation');
 perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(public.get_public_raffles(creator_slug,'ko')->'raffles') r where (r->>'benefitId')::uuid=benefit),'ticket catalog excludes cheer');
 perform pg_temp.check_true((public.read_admin_cheer_event_participants(actor,admin_id,campaign)->>'total')::integer=1,'admin reads count');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_draws where campaign_id=campaign),'admin read must never draw');
 update public.app_users set status='disabled' where id=fan;
 perform pg_temp.check_true(not exists(select 1 from public.benefit_campaign_candidate_weights(campaign,benefit,clock_timestamp())),'disabled account excluded');
 update public.app_users set status='active' where id=fan;
 begin
   perform public.post_celebrity_cheer(fan2,creator_slug,'Rollback!',gen_random_uuid(),'ko');
   raise exception 'ROLLBACK_TEST';
 exception when others then if sqlerrm<>'ROLLBACK_TEST' then raise; end if; end;
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign and app_user_id=fan2),'failed transaction rolls back entry');
 perform pg_sleep(0.02);
 update public.live_benefit_campaigns set entry_closes_at=clock_timestamp()-interval '1 millisecond' where id=campaign;
 perform public.post_celebrity_cheer(fan2,creator_slug,'Closed!',gen_random_uuid(),'ko');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign and app_user_id=fan2),'closed comment not entered');
 perform pg_temp.check_true((public.get_owned_raffles(fan,'ko',null,20)->'items'->0->>'state')='pending','owned raffle includes cheer without fake tickets');
 -- Configure the normal digital recipient policy, then use only the existing draw/publication pipeline.
 select revision into campaign_revision from public.live_benefit_campaigns where id=campaign;
 perform public.configure_admin_raffle_fulfillment_policy(actor,admin_id,gen_random_uuid(),campaign,benefit,campaign_revision,
 jsonb_build_object('version','cheer-digital-v1','method','digital','shippingCountry',null,'requiresShippingAcknowledgment',false,'recipientWindowDays',7,'pickupEndsOn',null,'pickupVenue',jsonb_build_object('ko','','en',''),'pickupInstructions',jsonb_build_object('ko','','en','')));
 select revision into campaign_revision from public.live_benefit_campaigns where id=campaign;
 perform public.configure_admin_raffle_fulfillment_policy(actor,admin_id,gen_random_uuid(),campaign,benefit2,campaign_revision,
 jsonb_build_object('version','cheer-physical-v1','method','physical_shipping','shippingCountry','KR','requiresShippingAcknowledgment',true,'recipientWindowDays',7,'pickupEndsOn',null,'pickupVenue',jsonb_build_object('ko','','en',''),'pickupInstructions',jsonb_build_object('ko','','en','')));
 update public.live_benefit_campaigns set entry_closes_at=clock_timestamp()+interval '1 hour' where id=campaign;
 select revision,entry_closes_at into campaign_revision,previous_close from public.live_benefit_campaigns where id=campaign;
 perform pg_temp.expect_error(format('select public.execute_admin_cheer_event_draw(%L,%L,gen_random_uuid(),%L,gen_random_uuid(),%s)',actor,admin_id,campaign,campaign_revision+1),'benefit campaign revision conflict');
 perform pg_temp.expect_error(format('select public.execute_admin_cheer_event_draw(%L,%L,gen_random_uuid(),%L,null,%s)',actor,admin_id,campaign,campaign_revision),'null value in column "idempotency_key"');
 perform pg_temp.check_true((select entry_closes_at=previous_close and revision=campaign_revision from public.live_benefit_campaigns where id=campaign),'failed early draw rolls back closure');
 result:=public.execute_admin_cheer_event_draw(actor,admin_id,gen_random_uuid(),campaign,draw_key,campaign_revision); draw_id:=(result->>'drawId')::uuid;
 select entry_closes_at into previous_close from public.live_benefit_campaigns where id=campaign;
 perform pg_temp.check_true(previous_close<clock_timestamp(),'early draw closes before configured deadline');
 perform public.post_celebrity_cheer(fan2,creator_slug,'After draw!',gen_random_uuid(),'ko');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_cheer_entries where campaign_id=campaign and app_user_id=fan2),'early draw freezes late comments');
 result:=public.execute_admin_cheer_event_draw(actor,admin_id,gen_random_uuid(),campaign,draw_key,campaign_revision);
 perform pg_temp.check_true((result->>'replayed')::boolean and (select entry_closes_at=previous_close from public.live_benefit_campaigns where id=campaign),'early draw replay keeps snapshot and cutoff');
 perform pg_temp.check_true((select count(*)=2 from public.benefit_draw_candidates where campaign_id=campaign and weight=2),'draw uses cheer weighted pool');
 perform public.publish_admin_benefit_draw(actor,admin_id,gen_random_uuid(),campaign,draw_id,clock_timestamp());
 result:=public.build_owned_raffle_result(fan,campaign,benefit,'ko');
 perform pg_temp.check_true(result->>'state'='won','published cheer winner outcome');
 perform pg_temp.check_true((result->>'enteredTickets')::integer=0,'never fabricate ticket spending');
 perform pg_temp.expect_error(format('select public.save_owned_benefit_recipient_v2(%L,%L,gen_random_uuid(),%L,true,%L,%L,%L,null,null,null,null,%s)',fan,result->>'winnerId','2026-09-raffle-v2','Test Fan','+821012345678','KR',(select revision from public.benefit_fulfillments where winner_id=(result->>'winnerId')::uuid)),'PHASE4_RECIPIENT_NOT_REQUIRED');

 result:=public.build_owned_raffle_result(fan,campaign,benefit2,'ko');
 perform pg_temp.check_true(result->>'state'='won','second prize uses same cheer pool');
 update public.benefit_recipient_consent_versions set active=true where version='2026-09-raffle-v2';
 perform public.save_owned_benefit_recipient_v2(fan,(result->>'winnerId')::uuid,gen_random_uuid(),'2026-09-raffle-v2',true,'Test Fan','+821012345678','KR','KR','12345','Seoul Test Road',null,(select revision from public.benefit_fulfillments where winner_id=(result->>'winnerId')::uuid));
 perform pg_temp.check_true((public.build_owned_raffle_result(fan,campaign,benefit2,'ko')->>'recipientSubmitted')::boolean,'cheer winner existing recipient save workflow');
end $$;
do $$ begin
 if position('fan_web_lock_active_user' in pg_get_functiondef('public.reserve_owned_live_event(uuid,uuid,uuid,uuid,text,text)'::regprocedure))=0 then raise exception 'reservation active-account fence removed'; end if;
 if has_table_privilege('anon','public.benefit_cheer_entries','SELECT') or has_table_privilege('authenticated','public.benefit_cheer_entries','INSERT')
 or has_table_privilege('service_role','public.benefit_cheer_entries','INSERT')
 or has_function_privilege('authenticated','public.benefit_campaign_candidate_weights(uuid,uuid,timestamptz)','EXECUTE') then raise exception 'cheer privilege leak'; end if;
end $$;
rollback;
