-- Disposable, rolled-back proof and issuance fixtures only.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.wave_stamp_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm=expected then return; else raise; end if; end; raise exception 'Expected error %',expected; end $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:mission-stamp-'||i,'mission-stamp-'||i||'@example.test' from generate_series(1,4)i;
insert into public.admin_allowlist(id,email,role,active) values
 ('91d00000-0000-4000-8000-000000000003','mission-stamp-3@example.test','admin',true),
 ('91d00000-0000-4000-8000-000000000004','mission-stamp-4@example.test','viewer',true);
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('mission-stamp:'||i)||md5('mission-stamp:'||i) from generate_series(1,2)i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('91d00000-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/fixture.webp',now(),'{brand}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) select '91d00000-0000-4000-8000-000000000090',locale,'WAVE','WAVE event','WAVE' from unnest(array['ko','en']::public.content_locale[]) locale;
do $$
declare owner uuid:='91d00000-0000-4000-8000-000000000001'; other_owner uuid:='91d00000-0000-4000-8000-000000000002'; admin_id uuid:='91d00000-0000-4000-8000-000000000003'; viewer uuid:='91d00000-0000-4000-8000-000000000004'; creator uuid:='91d00000-0000-4000-8000-000000000090'; participant uuid; completion uuid; binding uuid; result jsonb; first_grant jsonb; before_tickets bigint; before_jobs bigint; post_id uuid; before_points bigint; descriptor jsonb; campaign uuid;
begin
 select id into participant from public.kyaa_wave_participants where app_user_id=owner;
 select campaign_id into campaign from public.kyaa_wave_participation_config where event_key='kyaa-wave-2026';
 assert exists(select 1 from public.fan_action_campaign_contexts where id=campaign and creator_id=creator and wave_event_key='kyaa-wave-2026' and live_event_id is null),'actual WAVE event binds offline context';
 assert not exists(select 1 from public.live_events where id=campaign),'no fabricated LIVE';
 assert not exists(select 1 from public.live_events live left join public.fan_action_campaign_contexts context on context.live_event_id=live.id and context.id=live.id and context.creator_id=live.celebrity_id where context.id is null),'existing LIVE UUIDs and creators remain backed by their original sources';
 assert not has_table_privilege('service_role','public.fan_action_campaign_contexts','INSERT');
 assert not has_table_privilege('service_role','public.fan_action_campaign_contexts','UPDATE');
 assert not has_table_privilege('service_role','public.kyaa_wave_participation_config','UPDATE');
 perform pg_temp.wave_stamp_error('update public.kyaa_wave_participation_config set campaign_id=extensions.gen_random_uuid()','WAVE_EVENT_CAMPAIGN_IMMUTABLE');
 perform pg_temp.wave_stamp_error(format('update public.fan_action_campaign_contexts set creator_id=%L where id=%L',other_owner,campaign),'FAN_ACTION_CAMPAIGN_CONTEXT_IMMUTABLE');
 perform pg_temp.wave_stamp_error(format('insert into public.kyaa_wave_mission_completions(participant_id,app_user_id,celebrity_id,mission_key) values(%L,%L,%L,''event-photo'')',participant,owner,creator),'WAVE_MISSION_EVIDENCE_INVALID');
 perform pg_temp.wave_stamp_error(format('insert into public.kyaa_wave_mission_completions(participant_id,app_user_id,celebrity_id,mission_key) values(%L,%L,%L,''checkin'')',participant,other_owner,creator),'WAVE_MISSION_EVIDENCE_INVALID');
 begin
  insert into public.fan_action_campaign_contexts(id,creator_id) values(extensions.gen_random_uuid(),creator);
  raise exception 'missing campaign source accepted';
 exception when check_violation then null; end;

 assert not has_table_privilege('service_role','public.kyaa_wave_mission_completions','INSERT');
 assert not has_function_privilege('service_role','public.evaluate_owned_kyaa_wave_missions(uuid)','EXECUTE');
 select count(*) into before_tickets from public.fan_ticket_ledger;
 select count(*) into before_points from public.fan_score_ledger;
 select count(*) into before_jobs from public.blockchain_jobs;
 result:=public.read_owned_kyaa_wave_missions(owner);
 assert jsonb_array_length(result->'progress')=10;
 assert jsonb_array_length(result->'stamps')=1 and result->'stamps'->0->>'status'='waiting_wallet';
 assert (select count(*) from public.blockchain_jobs)=before_jobs,'no fabricated jobs before wallet/activation';
 select id into completion from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='checkin';
 perform public.read_owned_kyaa_wave_missions(owner);
 assert (select count(*) from public.kyaa_wave_mission_completions where participant_id=participant)=1,'idempotent proof';
 perform pg_temp.wave_stamp_error(format('update public.kyaa_wave_mission_completions set mission_key=''bingo'' where id=%L',completion),'WAVE_MISSION_PROOF_IMMUTABLE');
 perform public.assert_community_stamp_source(owner,creator,'wave_mission','wave-mission:'||completion);
 perform pg_temp.wave_stamp_error(format('select public.assert_community_stamp_source(%L,%L,''wave_mission'',%L)',other_owner,creator,'wave-mission:'||completion),'COMMUNITY_STAMP_INVALID_REQUEST');
 perform pg_temp.wave_stamp_error(format('select public.assert_community_stamp_source(%L,%L,''wave_mission'',%L)',owner,creator,'wave-mission:'||extensions.gen_random_uuid()),'COMMUNITY_STAMP_INVALID_REQUEST');
 perform pg_temp.wave_stamp_error(format('select public.grant_admin_kyaa_wave_bingo_stamp(%L,%L,%L,%L)',viewer,viewer,participant,extensions.gen_random_uuid()),'FAN_WEB_FORBIDDEN');
 first_grant:=public.grant_admin_kyaa_wave_bingo_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
 assert public.grant_admin_kyaa_wave_bingo_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid())=first_grant;
 assert (select count(*) from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='bingo')=1;
 assert (select count(*) from jsonb_array_elements(public.read_owned_kyaa_wave_missions(owner)->'progress') m where m->>'status'='completed')=1,'bingo excluded from ticket progress';
 perform public.grant_admin_kyaa_wave_quiz_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
 assert exists(select 1 from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='quiz-correct');
 insert into public.fan_posts(celebrity_id,app_user_id,body,idempotency_key,create_request_hash,created_at) values(creator,owner,'Introduction',extensions.gen_random_uuid(),repeat('a',64),clock_timestamp()) returning id into post_id;
 perform public.read_owned_kyaa_wave_missions(owner);
 assert exists(select 1 from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='introduction');
 update public.fan_posts set deleted_at=clock_timestamp() where id=post_id;
 result:=public.read_owned_kyaa_wave_missions(owner);
 assert exists(select 1 from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='introduction'),'recorded proof survives deletion';
 assert not exists(select 1 from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='event-photo'),'text without uploaded attachment insufficient';
 -- Wallet readiness records a preparing state, but does not activate incompatible workers.
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(owner,91342,'0xdddddddddddddddddddddddddddddddddddddddd','privy','embedded');
 assert not exists(select 1 from public.community_stamps where kind='wave_mission');
 insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
 values(91342,'0x'||repeat('1',64),'0x2222222222222222222222222222222222222222','0x3333333333333333333333333333333333333333','0x'||repeat('4',64),1,2,'ipfs://bafybeicrvmcnekzfyoktq3kb2rkvy2dvsfxtczs65e2b3sgjehvi4dm3ni/credentials/v2',jsonb_build_object('0','0x5555555555555555555555555555555555555555','1','0x6666666666666666666666666666666666666666','2','0x7777777777777777777777777777777777777777')) returning id into binding;
 insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at) values(4,binding,true,1,clock_timestamp());
 insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at) values(binding,creator,123456,'0x'||repeat('8',64),clock_timestamp());
 perform pg_temp.wave_stamp_error('update public.kyaa_wave_stamp_activation set enabled=true where singleton','WAVE_CAMPAIGN_NOT_READY');
 insert into public.fan_action_verified_campaigns(binding_id,campaign_id,creator_id,verified_block_number,verified_block_hash,verified_at) select binding,campaign_id,creator,123456,'0x'||repeat('8',64),clock_timestamp() from public.kyaa_wave_participation_config where event_key='kyaa-wave-2026';
 update public.kyaa_wave_stamp_activation set enabled=true where singleton;
 result:=public.read_owned_kyaa_wave_missions(owner);
 assert (select count(*) from public.community_stamps where kind='wave_mission' and app_user_id=owner)=4;
 assert not exists(select 1 from public.community_stamps where kind='wave_mission' and blockchain_job_id is not null),'mission uses native outbox only';
 assert not exists(select 1 from public.community_stamps s join public.kyaa_wave_mission_completions completion on s.source_key='wave-mission:'||completion.id::text join public.fan_action_outbox outbox on outbox.id=s.fan_action_outbox_id join public.fan_action_occurrences occurrence on occurrence.id=outbox.occurrence_row_id cross join public.kyaa_wave_participation_config config where s.kind='wave_mission' and (occurrence.campaign_id is distinct from config.campaign_id or occurrence.source_occurred_at is distinct from completion.completed_at or outbox.source_snapshot->>'campaignId' is distinct from '0x'||lpad(replace(config.campaign_id::text,'-',''),64,'0'))),'event campaign and observed completion time frozen in actual DB snapshot';
 assert not exists(select 1 from public.community_stamps s join public.fan_action_outbox o on o.id=s.fan_action_outbox_id join public.fan_action_occurrences f on f.id=o.occurrence_row_id where s.kind='wave_mission' and (o.source_snapshot->>'actionCode')::integer<>4),'MISSION_COMPLETED routing';
 assert not exists(select 1 from public.community_stamps s join public.fan_action_outbox o on o.id=s.fan_action_outbox_id where s.kind='wave_mission' and o.source_snapshot->'credentials'->0->'metadata'->'legacyPayload'->>'missionKey' is null),'payload includes verified mission key';
 select jsonb_build_array(jsonb_build_object('entityType','community_stamp','entityId',stamp.id,'kind',1,
  'issuanceKey',outbox.source_snapshot->'credentials'->0->>'issuanceKey',
  'operationKey',outbox.source_snapshot->'credentials'->0->'metadata'->>'operationKey',
  'legacyPayload',outbox.source_snapshot->'credentials'->0->'metadata'->'legacyPayload')) into descriptor
 from public.community_stamps stamp join public.fan_action_outbox outbox on outbox.id=stamp.fan_action_outbox_id where stamp.source_key='wave-mission:'||completion::text and stamp.app_user_id=owner;
 perform pg_temp.wave_stamp_error(format('select public.enqueue_fan_action_source(''community_stamps'',%L,%L,%L,null,%L,4,%L::jsonb)',
  'wave-mission:'||completion::text||':'||owner::text,owner,creator,(select completed_at from public.kyaa_wave_mission_completions where id=completion),descriptor),'WAVE_MISSION_EVIDENCE_INVALID');
 perform pg_temp.wave_stamp_error(format('select public.enqueue_fan_action_source(''community_stamps'',%L,%L,%L,%L,%L,4,%L::jsonb)',
  'wave-mission:'||completion::text||':'||owner::text,owner,creator,campaign,(select completed_at from public.kyaa_wave_mission_completions where id=completion),jsonb_set(descriptor,'{0,legacyPayload,missionKey}','"bingo"')),'WAVE_MISSION_EVIDENCE_INVALID');
 perform public.read_owned_kyaa_wave_missions(owner);
 assert (select count(*) from public.community_stamps where kind='wave_mission' and app_user_id=owner)=4,'idempotent stamp/outbox';
 assert (select count(*) from public.fan_ticket_ledger)=before_tickets,'no additional ticket rewards';
 assert (select count(*) from public.fan_score_ledger)=before_points,'no additional points';
end $$;

-- Registration starts issuance without any mission-page read, in either wallet order.
insert into public.app_users(id,privy_user_id,verified_email)
select ('91d00000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:auto-checkin-'||i,'auto-checkin-'||i||'@example.test' from generate_series(5,7)i;
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
values('91d00000-0000-4000-8000-000000000005',91342,'0x5555555555555555555555555555555555555555','privy','embedded');
update public.kyaa_wave_participation_config set enabled=true,code_hash=repeat('a',64);
do $$
declare owner uuid:='91d00000-0000-4000-8000-000000000005'; late_wallet uuid:='91d00000-0000-4000-8000-000000000006'; rejected uuid:='91d00000-0000-4000-8000-000000000007'; request_id uuid:=extensions.gen_random_uuid(); receipt jsonb; result jsonb;
 cipher text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12);
begin
 assert not has_function_privilege('service_role','public.submit_kyaa_wave_participation_before_auto_stamp(uuid,uuid,text,text,text,text)','EXECUTE');
 receipt:=public.submit_kyaa_wave_participation(owner,request_id,repeat('a',64),repeat('b',64),cipher,repeat('5',64));
 assert receipt->'participation'->>'id' is not null,'registration succeeds';
 assert exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=owner and mission_key='checkin'),'registration records checkin proof';
 assert (select count(*) from public.community_stamps s join public.fan_action_outbox o on o.id=s.fan_action_outbox_id where s.app_user_id=owner and s.kind='wave_mission')=1,'registration queues the native stamp without a mission read';
 assert public.submit_kyaa_wave_participation(owner,request_id,repeat('a',64),repeat('b',64),cipher,repeat('5',64))=receipt,'request replay keeps its receipt';
 assert public.submit_kyaa_wave_participation(owner,extensions.gen_random_uuid(),repeat('a',64),repeat('b',64),cipher,repeat('5',64))=receipt,'repeat registration keeps its receipt';
 assert (select count(*) from public.community_stamps where app_user_id=owner and kind='wave_mission')=1,'no duplicate stamp';
 result:=public.submit_kyaa_wave_participation(late_wallet,extensions.gen_random_uuid(),repeat('a',64),repeat('b',64),cipher,repeat('6',64));
 assert result->'participation'->>'id' is not null;
 assert (public.project_kyaa_wave_mission_stamps((result->'participation'->>'id')::uuid)->0->>'status')='waiting_wallet','registration preserves proof while waiting for wallet';
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
 values(late_wallet,91342,'0x6666666666666666666666666666666666666666','privy','embedded');
 assert (select count(*) from public.community_stamps s join public.fan_action_outbox o on o.id=s.fan_action_outbox_id where s.app_user_id=late_wallet and s.kind='wave_mission')=1,'wallet creation automatically queues the stamp';
 result:=public.submit_kyaa_wave_participation(rejected,extensions.gen_random_uuid(),repeat('f',64),repeat('b',64),cipher,repeat('7',64));
 assert result#>>'{error,code}'='PARTICIPATION_CODE_INVALID';
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id=rejected),'invalid code cannot earn a proof';
 result:=public.submit_kyaa_wave_participation(rejected,extensions.gen_random_uuid(),repeat('a',64),repeat('b',64),cipher,repeat('5',64));
 assert result#>>'{error,code}'='PARTICIPATION_REVIEW_REQUIRED';
 assert not exists(select 1 from public.community_stamps where app_user_id=rejected),'duplicate name cannot earn a stamp';
end $$;
rollback;

-- Wallet creation remains independent of the draft WAVE fanpage.
begin;
insert into public.app_users(id,privy_user_id,verified_email) values('91d00000-0000-4000-8000-000000000005','did:privy:wallet-publication','wallet-publication@example.test'),('91d00000-0000-4000-8000-000000000003','did:privy:wallet-publication-admin','wallet-publication-admin@example.test');
insert into public.admin_allowlist(id,email,role,active) values('91d00000-0000-4000-8000-000000000003','wallet-publication-admin@example.test','admin',true);
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values('91d00000-0000-4000-8000-000000000005','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',repeat('e',64));
insert into public.celebrities(id,slug,status,image_url,roles,primary_role,archived_at,archived_by_admin_allowlist_id,archive_reason) values('91d00000-0000-4000-8000-000000000090','kyaa-wave-fanpage','draft','/fixture.webp','{brand}','brand',null,null,null);
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('91d00000-0000-4000-8000-000000000005',91342,'0x5555555555555555555555555555555555555555','privy','embedded');
do $$ begin
 assert not (select enabled from public.kyaa_wave_stamp_activation where singleton);
 assert exists(select 1 from public.user_wallets where app_user_id='91d00000-0000-4000-8000-000000000005'),'draft WAVE does not roll back wallet creation';
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id='91d00000-0000-4000-8000-000000000005'),'draft WAVE skips reconciliation';
end $$;
rollback;

-- Wallet creation remains independent of the archived WAVE fanpage.
begin;
insert into public.app_users(id,privy_user_id,verified_email) values('91d00000-0000-4000-8000-000000000005','did:privy:wallet-publication','wallet-publication@example.test'),('91d00000-0000-4000-8000-000000000003','did:privy:wallet-publication-admin','wallet-publication-admin@example.test');
insert into public.admin_allowlist(id,email,role,active) values('91d00000-0000-4000-8000-000000000003','wallet-publication-admin@example.test','admin',true);
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values('91d00000-0000-4000-8000-000000000005','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',repeat('e',64));
insert into public.celebrities(id,slug,status,published_at,image_url,roles,primary_role,archived_at,archived_by_admin_allowlist_id,archive_reason) values('91d00000-0000-4000-8000-000000000090','kyaa-wave-fanpage','published',clock_timestamp(),'/fixture.webp','{brand}','brand',clock_timestamp(),'91d00000-0000-4000-8000-000000000003','Regression archive');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) select '91d00000-0000-4000-8000-000000000090',locale,'WAVE','WAVE event','WAVE' from unnest(array['ko','en']::public.content_locale[]) locale;
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('91d00000-0000-4000-8000-000000000005',91342,'0x5555555555555555555555555555555555555555','privy','embedded');
do $$ begin
 assert not (select enabled from public.kyaa_wave_stamp_activation where singleton);
 assert exists(select 1 from public.user_wallets where app_user_id='91d00000-0000-4000-8000-000000000005'),'archived WAVE does not roll back wallet creation';
 assert not exists(select 1 from public.kyaa_wave_mission_completions where app_user_id='91d00000-0000-4000-8000-000000000005'),'archived WAVE skips reconciliation';
end $$;
rollback;
