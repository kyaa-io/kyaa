-- Production-shaped fixture: two revision-4 campaigns, 11 preserved entries each.
insert into public.app_users(id,privy_user_id,verified_email,status) values('92900000-0000-4000-8000-000000000001','did:privy:wave-stage-admin','wave-stage-admin@example.test','active');
insert into public.admin_allowlist(id,email,role,active) values('92900000-0000-4000-8000-000000000002','wave-stage-admin@example.test','admin',true);
do $$ declare c record; creator uuid; template jsonb; fan uuid; index integer;
begin
 for c in select * from(values
 ('changha','aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'29a1f87a-1632-4851-9e38-de3d350cfcfa'::uuid,'112b7574-dcf2-4db1-9e8a-fd7b93b6750d'::uuid),
 ('wena','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'e7595eb5-ed0e-4740-b548-abdbddc1ee53'::uuid,'e65e482f-181e-4803-9b85-80c7afdd1bc2'::uuid)) x(slug,campaign,live,starbucks,hotel) loop
  select id into creator from public.celebrities where slug=c.slug;
  if creator is null then
   creator:=extensions.gen_random_uuid();
   select to_jsonb(x) into template from public.celebrities x limit 1;
   insert into public.celebrities select * from jsonb_populate_record(null::public.celebrities,template||jsonb_build_object('id',creator,'slug',c.slug,'status','published','archived_at',null));
   insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko',c.slug,'fixture','fixture'),(creator,'en',c.slug,'fixture','fixture');
  end if;
  select to_jsonb(x) into template from public.live_events x limit 1;
  insert into public.live_events select * from jsonb_populate_record(null::public.live_events,template||jsonb_build_object('id',c.live,'celebrity_id',creator,'slug',c.slug||'-kyaa-wave-20261022','publication_status','published','published_at',statement_timestamp(),'archived_at',null,'starts_at',statement_timestamp()+interval '1 day','ends_at',statement_timestamp()+interval '2 days','reservation_opens_at',statement_timestamp()-interval '1 day','reservation_closes_at',statement_timestamp()+interval '1 day'));
  insert into public.live_event_localizations select (jsonb_populate_record(null::public.live_event_localizations,to_jsonb(x)||jsonb_build_object('live_event_id',c.live))).* from public.live_event_localizations x where live_event_id=(select live_event_id from public.live_event_localizations limit 1);
  select to_jsonb(x) into template from public.benefits x limit 1;
  insert into public.benefits select * from jsonb_populate_record(null::public.benefits,template||jsonb_build_object('id',c.starbucks,'celebrity_id',creator,'slug',c.slug||'-kyaa-wave-starbucks-20261022','publication_status','published','published_at',statement_timestamp(),'archived_at',null,'delivery_type','text','allocation_mode','direct_claim','claim_opens_at',statement_timestamp()-interval '1 day','claim_closes_at',statement_timestamp()+interval '2 days'));
  insert into public.benefits select * from jsonb_populate_record(null::public.benefits,template||jsonb_build_object('id',c.hotel,'celebrity_id',creator,'slug',c.slug||'-kyaa-wave-eliena-20261022','publication_status','published','published_at',statement_timestamp(),'archived_at',null,'delivery_type','text','allocation_mode','direct_claim','claim_opens_at',statement_timestamp()-interval '1 day','claim_closes_at',statement_timestamp()+interval '2 days'));
  insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values(c.starbucks,'text','Fixture delivery'),(c.hotel,'text','Fixture delivery');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label) values(c.starbucks,'ko','Starbucks','fixture','fixture','fixture'),(c.hotel,'ko','Hotel coffee','fixture','fixture','fixture'),(c.starbucks,'en','Starbucks','fixture','fixture','fixture'),(c.hotel,'en','Hotel coffee','fixture','fixture','fixture');
  insert into public.live_benefit_campaigns(id,live_event_id,entry_source,status,entry_opens_at,entry_closes_at,revision,actor_app_user_id,actor_admin_allowlist_id,published_at) values(c.campaign,c.live,'cheer','published',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 day',4,'92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',statement_timestamp());
  insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,winner_quantity,fulfillment_method) values(c.campaign,c.starbucks,1,10,'digital'),(c.campaign,c.hotel,2,5,'digital');
  insert into public.raffle_fulfillment_policies(campaign_id,benefit_id,version,method,requires_shipping_acknowledgment,recipient_window_days,actor_app_user_id,actor_admin_allowlist_id,correlation_id) values(c.campaign,c.starbucks,'fixture-v1','digital',false,7,'92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',extensions.gen_random_uuid());
  update public.live_benefit_campaign_items set active_fulfillment_policy_version='fixture-v1' where campaign_id=c.campaign and benefit_id=c.starbucks;
  for index in 1..11 loop
   fan:=md5('wave-stage-fixture:'||index::text)::uuid;
   insert into public.app_users(id,privy_user_id,verified_email,status) values(fan,'did:privy:wave-stage-fan-'||index,'wave-stage-fan-'||index||'@example.test','active') on conflict do nothing;
   insert into public.benefit_cheer_entries(campaign_id,app_user_id) values(c.campaign,fan);
  end loop;
 end loop;
end $$;
