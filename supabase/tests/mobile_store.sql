do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Mobile Store tests require disposable local byus_clean'; end if;
end $$;
begin;

create function pg_temp.expect_mobile_store_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'Expected error was not raised: %',expected;
end $$;

do $$
declare owner constant uuid:='57000000-0000-4000-8000-000000000001';creator constant uuid:='57000000-0000-4000-8000-000000000002';
  other_creator constant uuid:='57000000-0000-4000-8000-000000000003';request_key constant uuid:='57000000-0000-4000-8000-000000000004';
  benefit constant uuid:='57000000-0000-4000-8000-000000000005';benefit_policy constant uuid:='57000000-0000-4000-8000-000000000006';prize constant uuid:='57000000-0000-4000-8000-000000000007';allowlist constant uuid:='57000000-0000-4000-8000-000000000008';
  intent jsonb;result jsonb;policy integer;page jsonb;seen uuid[]:='{}';entry_id uuid;
begin
  select version into policy from public.reward_policy_versions order by version desc limit 1;
  insert into public.app_users(id,privy_user_id,verified_email) values(owner,'did:privy:mobile-store-test','mobile-store@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (creator,'mobile-store-creator','published','/test.webp',now(),'{creator}','creator'),
    (other_creator,'mobile-store-other','published','/test.webp',now(),'{creator}','creator');
  insert into public.admin_allowlist(id,email,role,active)values(allowlist,'mobile-store@example.test','admin',true);
  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)values(benefit,'mobile-store-digital-benefit',creator,'draft','text',now()-interval'1 hour',now()+interval'2 hours');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)values(benefit,'ko','스토어 디지털 경품','설명','응모권','디지털'),(benefit,'en','Store digital benefit','Summary','Tickets','Digital');
  insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value)values(benefit,'text','store fixture delivery');update public.benefits set publication_status='published',published_at=now()where id=benefit;
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,allow_paid_tickets,enabled,tester_only,opens_at,closes_at)values(benefit_policy,benefit,'instant_draw','paid-campaign-v1',5,true,false,false,now()-interval'1 hour',now()+interval'1 hour');
  insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method)values(prize,benefit_policy,'won',1,10,'digital');update public.mobile_benefit_policies set enabled=true where id=benefit_policy;
  insert into public.mobile_store_product_policies(store,environment,product_id,policy_version,currency,ticket_quantity,support_rate_bps,reward_policy_version,effective_at)
    values('apple','sandbox','kr.byus.ticket.10','sandbox-v1','KRW',10,1000,policy,now()-interval '1 minute');

  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_list_products(%L,'apple','mobile-store-creator')$q$,owner),'MOBILE_STORE_TESTER_REQUIRED');
  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_create_intent(%L,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',%L,'paid-campaign-v1',%L)$q$,owner,benefit,request_key),'MOBILE_STORE_TESTER_REQUIRED');
  insert into public.mobile_store_sandbox_testers(app_user_id,enabled) values(owner,true);

  result:=public.mobile_store_list_products(owner,'apple','mobile-store-creator');
  if result#>>'{products,0,paidCampaign,benefitId}'<>benefit::text or result#>>'{products,0,paidCampaign,totalWeight}'<>'1'or result#>>'{products,0,paidCampaign,outcomes,0,fulfillmentMethod}'<>'digital'then raise exception'Paid digital campaign source missing: %',result;end if;
  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_create_intent(%L,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',%L,'stale-paid-campaign',%L)$q$,owner,benefit,extensions.gen_random_uuid()),'MOBILE_STORE_PAID_CAMPAIGN_CHANGED');

  intent:=public.mobile_store_create_intent(owner,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',benefit,'paid-campaign-v1',request_key);
  if intent#>>'{paidCampaign,benefitId}'<>benefit::text or intent#>>'{paidCampaign,policyVersion}'<>'paid-campaign-v1'or intent->>'appAccountToken'<>intent->>'id' then
    raise exception 'Intent projection is invalid: %',intent;
  end if;
  if not (public.mobile_store_create_intent(owner,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',benefit,'paid-campaign-v1',request_key)->>'replayed')::boolean then
    raise exception 'Intent replay was not stable';
  end if;
  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_create_intent(%L,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',%L,'stale-paid-campaign',%L)$q$,owner,benefit,request_key),'MOBILE_STORE_IDEMPOTENCY_CONFLICT');
  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_create_intent(%L,'apple','kr.byus.ticket.10','mobile-store-other','sandbox-v1',%L,'paid-campaign-v1',%L)$q$,owner,benefit,request_key),'MOBILE_STORE_IDEMPOTENCY_CONFLICT');

  result:=public.mobile_store_apply_owned_verified_transaction(owner,'apple','sandbox','apple-transaction-1',(intent->>'appAccountToken')::uuid,
    'kr.byus.ticket.10','KRW',1000,0,'purchased',repeat('a',64),now());
  if result->>'state'<>'granted' or (result->>'supportKrw')::bigint<>100 or not (result->>'finishAllowed')::boolean then raise exception 'Initial grant invalid: %',result; end if;
  if result->>'intentId'<>intent->>'id'or result->>'productId'<>'kr.byus.ticket.10'or result->>'celebrityId'<>creator::text or result->>'ticketQuantity'<>'10'or result->>'supportRateBps'<>'1000'or result->>'policyVersion'<>'sandbox-v1'or result->>'purchasedAt'is null then raise exception'Original intent projection invalid: %',result;end if;
  perform public.mobile_store_admin_record_support_settlement(owner,allowlist,extensions.gen_random_uuid(),(select id from public.mobile_store_transactions where external_transaction_id='apple-transaction-1'),100,now(),'fixture:settlement:100','초기 후원 정산 증거를 기록합니다.');
  perform public.mobile_store_apply_owned_verified_transaction(owner,'apple','sandbox','apple-transaction-1',(intent->>'appAccountToken')::uuid,
    'kr.byus.ticket.10','KRW',1000,0,'purchased',repeat('b',64),now());
  if (select count(*) from public.mobile_store_paid_ticket_ledger where transaction_id=(select id from public.mobile_store_transactions where external_transaction_id='apple-transaction-1'))<>1 then raise exception 'Replay duplicated paid ticket'; end if;
  if exists(select 1 from public.fan_ticket_ledger where app_user_id=owner) then raise exception 'Paid tickets leaked into physical-benefit balance'; end if;

  result:=public.mobile_store_apply_verified_transaction('apple','sandbox','apple-transaction-1',(intent->>'appAccountToken')::uuid,
    'kr.byus.ticket.10','KRW',1000,500,'purchased',repeat('c',64),now());
  if result->>'state'<>'granted' or (result->>'supportKrw')::bigint<>50 then raise exception 'Partial refund invalid: %',result; end if;
  if result->>'settlementStatus'<>'refund_correction_required'then raise exception'Refund correction status missing: %',result;end if;
  perform public.mobile_store_admin_record_support_settlement(owner,allowlist,extensions.gen_random_uuid(),(select id from public.mobile_store_transactions where external_transaction_id='apple-transaction-1'),50,now(),'fixture:settlement:50','부분 환불 보정 정산 증거를 기록합니다.');
  perform public.mobile_store_apply_verified_transaction('apple','sandbox','apple-transaction-1',(intent->>'appAccountToken')::uuid,
    'kr.byus.ticket.10','KRW',1000,100,'purchased',repeat('d',64),now()-interval '1 hour');
  if (select refunded_krw from public.mobile_store_transactions where external_transaction_id='apple-transaction-1')<>500 then raise exception 'Older refund regressed cumulative amount'; end if;
  result:=public.mobile_store_apply_verified_transaction('apple','sandbox','apple-transaction-1',(intent->>'appAccountToken')::uuid,
    'kr.byus.ticket.10','KRW',1000,1000,'revoked',repeat('e',64),now());
  if result->>'state'<>'revoked' or (result->>'supportKrw')::bigint<>0 then raise exception 'Full refund invalid: %',result; end if;
  if (select resulting_balance from public.mobile_store_paid_ticket_ledger where app_user_id=owner order by owner_sequence desc limit 1)<>0 then raise exception 'Refund did not reverse paid tickets'; end if;
  if (select sum(amount_delta_krw) from public.mobile_store_support_ledger where app_user_id=owner)<>0 then raise exception 'Support delta did not net to zero'; end if;
  result:=public.mobile_store_get_owned_support(owner,'mobile-store-creator',50);
  if result->>'totalSupportKrw'<>'0'or jsonb_array_length(result->'entries')<>3 or result#>>'{purchases,0,refundStatus}'<>'fully_refunded'or result#>>'{purchases,0,settlementStatus}'<>'refund_correction_required'or result#>>'{entries,0,correctionType}'<>'refund_adjustment'then raise exception'Support detail/settlement projection invalid: %',result;end if;

  for n in 2..3 loop
    intent:=public.mobile_store_create_intent(owner,'apple','kr.byus.ticket.10','mobile-store-creator','sandbox-v1',benefit,'paid-campaign-v1',extensions.gen_random_uuid());
    perform public.mobile_store_apply_owned_verified_transaction(owner,'apple','sandbox','apple-transaction-'||n,(intent->>'appAccountToken')::uuid,
      'kr.byus.ticket.10','KRW',1000,0,'purchased',repeat('a',64),now());
  end loop;
  page:=public.mobile_store_get_owned_support_page(owner,'mobile-store-creator',1);
  loop
    if page->>'totalSupportKrw'<>'200' or page->>'pendingSupportKrw'<>'200'
      or page->>'settledSupportKrw'<>'50' or page->>'settlementCorrectionKrw'<>'50'
      or page->>'refundAdjustmentKrw'<>'100' or jsonb_array_length(page->'purchases')<>1 then
      raise exception 'Support totals were derived from a partial page: %',page;
    end if;
    entry_id:=(page#>>'{purchases,0,transactionId}')::uuid;
    if entry_id=any(seen) then raise exception 'Support cursor repeated a purchase'; end if;
    seen:=array_append(seen,entry_id);
    exit when page->'nextCursor'='null'::jsonb;
    page:=public.mobile_store_get_owned_support_page(owner,'mobile-store-creator',1,
      (page#>>'{nextCursor,createdAt}')::timestamptz,(page#>>'{nextCursor,id}')::uuid);
  end loop;
  if cardinality(seen)<>3 then raise exception 'Support cursor omitted a purchase'; end if;
  select id into entry_id from public.mobile_store_transactions where external_transaction_id='apple-transaction-1';
  page:=public.mobile_store_get_owned_support_page(owner,'mobile-store-creator',50,null,null,entry_id);
  if page#>>'{purchases,0,ticketReversed}'<>'10' or jsonb_array_length(page->'purchases')<>1 then raise exception 'Refund detail lost reversed tickets'; end if;
  if jsonb_array_length(public.mobile_store_get_owned_support_page(owner,'mobile-store-other',50,null,null,entry_id)->'purchases')<>0 then raise exception 'Support detail crossed celebrity scope'; end if;
  insert into public.app_users(id,privy_user_id,verified_email) values('57000000-0000-4000-8000-000000000099','did:privy:mobile-store-empty-owner','mobile-store-empty@example.test');
  page:=public.mobile_store_get_owned_support_page('57000000-0000-4000-8000-000000000099','mobile-store-creator',50,null,null,entry_id);
  if page->>'totalSupportKrw'<>'0' or jsonb_array_length(page->'purchases')<>0 then raise exception 'Support detail crossed owner scope'; end if;
  if has_function_privilege('authenticated','public.mobile_store_get_owned_support_page(uuid,text,integer,timestamptz,uuid,uuid)','execute') then raise exception 'Support RPC exposed caller-selected owner'; end if;
  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_get_owned_support_page(%L,'mobile-store-creator',1,now(),null)$q$,owner),'MOBILE_STORE_INVALID');

  perform pg_temp.expect_mobile_store_error(format($q$select public.mobile_store_apply_owned_verified_transaction(%L,'apple','sandbox','other',%L,'kr.byus.ticket.10','KRW',1000,0,'purchased',%L,now())$q$,owner,extensions.gen_random_uuid(),repeat('f',64)),'MOBILE_STORE_ACCOUNT_MISMATCH');
end $$;

rollback;
