do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
create function pg_temp.fan_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',label;end if;raise notice 'PASS %',label;end $$;
do $$
declare creator uuid:='d2000000-0000-4000-8000-000000000001'; other_creator uuid:='d2000000-0000-4000-8000-000000000002';
 u uuid; source uuid; correction_source uuid; original_id uuid; activation jsonb; answer jsonb; replay jsonb; rules jsonb;
 event uuid:=extensions.gen_random_uuid(); correction_policy uuid; points bigint;
begin
 for n in 1..6 loop
  u:=('d2100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into public.app_users(id,privy_user_id,verified_email) values(u,'did:privy:t2-'||n,'t2-'||n||'@example.test');
 end loop;
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 (creator,'t2-cutover','published','/fixture.webp',now(),'{creator}','creator'),
 (other_creator,'t2-legacy','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select c,locale,'Fixture','Fixture','Fixture' from unnest(array[creator,other_creator]) c cross join unnest(enum_range(null::public.content_locale)) locale;
 insert into public.fan_ticket_activity_policy(celebrity_id,enabled) values(creator,true),(other_creator,true);
 u:='d2100000-0000-4000-8000-000000000001';
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible)
 values(u,creator,'before activation',extensions.gen_random_uuid(),'fixture',true);
 perform pg_temp.fan_assert(public.get_fan_ticket_balance(u,creator)=1 and public.mobile_fan_economy_balance(u,creator,'fan_point')=0,'expansion_keeps_legacy_rewards');
 begin
  perform public.activate_mobile_fan_earning(creator,'invalid','{"comment":3}');
  raise exception 'partial policy accepted';
 exception when others then if sqlerrm<>'FAN_ECONOMY_POLICY_UNCONFIGURED' then raise;end if;end;
 perform pg_temp.fan_assert(not exists(select 1 from public.mobile_fan_earning_cutovers where celebrity_id=creator) and (select enabled from public.fan_ticket_activity_policy where celebrity_id=creator),'unconfigured_earning_does_not_disable_legacy');
 select jsonb_object_agg(action,3) into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone']) action;
 rules:=rules||'{"share":0}';
 activation:=public.activate_mobile_fan_earning(creator,'fixture-v1',rules);
 perform pg_temp.fan_assert(exists(select 1 from public.mobile_fan_earning_cutovers c join public.mobile_fan_economy_policies p on p.id=c.policy_id where c.celebrity_id=creator and p.effective_at=c.effective_at and p.version=c.version),'cutover_and_policy_activate_atomically');
 replay:=public.activate_mobile_fan_earning(creator,'fixture-v1',rules);
 perform pg_temp.fan_assert(replay->>'replayed'='true' and replay->>'policyId'=activation->>'policyId','activation_replay_once');
 u:='d2100000-0000-4000-8000-000000000002';
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,creator,'delayed before cutover',extensions.gen_random_uuid(),'fixture',true,(activation->>'effectiveAt')::timestamptz-interval '1 second');
 perform pg_temp.fan_assert(public.get_fan_ticket_balance(u,creator)=1 and public.mobile_fan_economy_balance(u,creator,'fan_point')=0,'delayed_pre_cutover_source_keeps_legacy');
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,other_creator,'other creator',extensions.gen_random_uuid(),'fixture',true,clock_timestamp());
 perform pg_temp.fan_assert(public.read_mobile_fan_economy_reward_mode('t2-cutover')->>'mode'='fan_point' and public.read_mobile_fan_economy_reward_mode('t2-legacy')->>'mode'='legacy_ticket','creator_scoped_mode');
 perform pg_temp.fan_assert(public.get_fan_ticket_balance(u,other_creator)=1 and public.mobile_fan_economy_balance(u,other_creator,'fan_point')=0,'unmigrated_creator_keeps_legacy');
 perform public.activate_mobile_fan_earning(other_creator,'explicit-disabled',rules||'{"comment":0}');
 u:='d2100000-0000-4000-8000-000000000006';
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,other_creator,'explicitly disabled reward',extensions.gen_random_uuid(),'fixture',true,clock_timestamp());
 perform pg_temp.fan_assert(public.get_fan_ticket_balance(u,other_creator)=0 and public.mobile_fan_economy_balance(u,other_creator,'fan_point')=0,'explicit_zero_does_not_fall_back_to_legacy');
 u:='d2100000-0000-4000-8000-000000000003';
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,creator,'after activation',extensions.gen_random_uuid(),'fixture',true,clock_timestamp()) returning id into source;
 perform public.award_mobile_fan_activity(u,creator,'comment','once');
 perform pg_temp.fan_assert(public.get_fan_ticket_balance(u,creator)=0 and public.mobile_fan_economy_balance(u,creator,'fan_point')=3,'same_source_never_receives_both_assets');
 answer:=public.request_mobile_fan_reward_correction(u,source,event,'correction-v1');
 perform pg_temp.fan_assert(public.read_owned_mobile_fan_reward_corrections('d2100000-0000-4000-8000-000000000002',source)='[]'::jsonb and jsonb_array_length(public.read_owned_mobile_fan_reward_corrections(u,source))=1,'correction_owner_isolation');
 perform pg_temp.fan_assert(answer->>'status'='review' and answer->>'reason'='policy_absent' and answer->>'original_ledger_id' is not null,'correction_without_policy_review');
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at) values(creator,'correction-v1','correction','{"mode":"revoke_unspent_points"}',clock_timestamp()) returning id into correction_policy;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at) values(creator,'exchange-v1','exchange','{"free_vote":1}',clock_timestamp());
 perform public.exchange_owned_mobile_fan_economy(u,extensions.gen_random_uuid(),'t2-cutover','free_vote','exchange-v1',1);
 answer:=public.request_mobile_fan_reward_correction(u,source,extensions.gen_random_uuid(),'correction-v1','correction-v1');
 perform pg_temp.fan_assert(answer->>'status'='review' and answer->>'reason'='rights_spent' and public.mobile_fan_economy_balance(u,creator,'fan_point')=2,'award_exchange_spend_then_review');
 u:='d2100000-0000-4000-8000-000000000004';event:=extensions.gen_random_uuid();
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,creator,'unspent correction',extensions.gen_random_uuid(),'fixture',true,clock_timestamp()) returning id into correction_source;
 select point_ledger_id into original_id from public.mobile_fan_economy_activity_receipts where source_id=correction_source;
 answer:=public.request_mobile_fan_reward_correction(u,correction_source,event,'v1','correction-v1');
 replay:=public.request_mobile_fan_reward_correction(u,correction_source,event,'v1','correction-v1');
 perform pg_temp.fan_assert(answer->>'status'='corrected' and replay->>'replayed'='true' and replay->>'correction_ledger_id'=answer->>'correction_ledger_id' and public.mobile_fan_economy_balance(u,creator,'fan_point')=0,'correction_replay_is_once');
 perform public.award_mobile_fan_activity(u,creator,'comment','once');
 perform pg_temp.fan_assert(public.mobile_fan_economy_balance(u,creator,'fan_point')=0 and exists(select 1 from public.mobile_fan_economy_ledger where id=original_id and amount=3),'reapproval_does_not_duplicate_original_reward');
 -- A committed source awaits processing while its original policy is stopped.
 u:='d2100000-0000-4000-8000-000000000005';
 alter table public.fan_posts disable trigger user;
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 values(u,creator,'delayed point processing',extensions.gen_random_uuid(),'fixture',true,clock_timestamp()) returning id into source;
 alter table public.fan_posts enable trigger user;
 begin
  update public.mobile_fan_economy_policies set retired_at=(activation->>'effectiveAt')::timestamptz where id=(activation->>'policyId')::uuid;
  raise exception 'retroactive retirement accepted';
 exception when others then if sqlerrm<>'FAN_ECONOMY_POLICY_RETROACTIVE' then raise;end if;end;
 update public.mobile_fan_economy_policies set retired_at=clock_timestamp() where id=(activation->>'policyId')::uuid;
 begin
  insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(creator,'retroactive','earning',rules,(activation->>'effectiveAt')::timestamptz);
  raise exception 'retroactive revision accepted';
 exception when others then if sqlerrm<>'FAN_ECONOMY_POLICY_RETROACTIVE' then raise;end if;end;
 perform pg_temp.fan_assert(true,'source_policy_cannot_be_retroactively_rewritten');
 perform public.award_fan_ticket_activity(u,creator,'comment','once',false);
 perform pg_temp.fan_assert(public.mobile_fan_economy_balance(u,creator,'fan_point')=3 and public.get_fan_ticket_balance(u,creator)=0,'delayed_point_source_uses_retired_original_policy');
 perform pg_temp.fan_assert(not has_function_privilege('authenticated','public.activate_mobile_fan_earning(uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','public.request_mobile_fan_reward_correction(uuid,uuid,uuid,text,text)','execute') and has_function_privilege('service_role','public.request_mobile_fan_reward_correction(uuid,uuid,uuid,text,text)','execute'),'service_only_activation_correction');
 perform pg_temp.fan_assert(not has_table_privilege('authenticated','public.mobile_fan_reward_corrections','select') and not has_table_privilege('anon','public.mobile_fan_earning_cutovers','insert'),'direct_data_api_table_privileges_denied');
end $$;
set constraints all immediate;
rollback;
-- Execute real role changes rather than relying only on catalog privilege checks.
begin;
do $$begin
 begin
  execute 'set local role authenticated';
  perform * from public.mobile_fan_reward_corrections;
  raise exception 'authenticated read correction rows';
 exception when insufficient_privilege then null;end;
 begin
  execute 'set local role anon';
  perform public.activate_mobile_fan_earning(null,'forbidden','{}');
  raise exception 'anon executed activation';
 exception when insufficient_privilege then null;end;
 begin
  execute 'set local role authenticated';
  perform * from storage.objects;
  raise exception 'authenticated read private storage objects';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS actual_authenticated_table_anon_rpc_and_storage_denials';
end $$;
rollback;
