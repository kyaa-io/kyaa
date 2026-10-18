\ir mobile_store.sql
\ir mobile_benefits.sql
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

  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select id,locale,'Fixture','Fixture','Fixture'from public.celebrities cross join unnest(enum_range(null::public.content_locale))locale where id in(creator,other_creator);
  insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values(creator,true);
  insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible)values(owner,creator,'old consumed comment',extensions.gen_random_uuid(),'fixture-old',true);
  perform public.post_fan_ticket_entry(owner,creator,'debit',-public.get_fan_ticket_balance(owner,creator),'fixture_consume',extensions.gen_random_uuid(),extensions.gen_random_uuid(),policy,null,null);
end $$;
commit;
