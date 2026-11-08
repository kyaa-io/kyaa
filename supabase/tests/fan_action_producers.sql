-- Run only through scripts/verify-clean-migration-chain.sh against a disposable database.
begin;

create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAN_ACTION_PRODUCER_TEST: %',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare caught boolean:=false;begin
  begin execute statement;exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'Unexpected error %, wanted %',sqlerrm,expected; end if;
    caught:=true;
  end;
  if not caught then raise exception 'Expected error was not raised: %',expected; end if;
end $$;

-- Inspect the preserved producer behind the fan-web account/visibility guards.
create function pg_temp.producer_definition(signature regprocedure) returns text language plpgsql as $$
declare current_function regprocedure:=signature; original record; delegated text;
  definition text:=''; visited oid[]:='{}';
begin
  loop
    if current_function::oid=any(visited) then raise exception 'Producer wrapper cycle: %',signature; end if;
    visited:=array_append(visited,current_function::oid);
    definition:=definition||E'\n'||pg_get_functiondef(current_function);
    select prosrc,proargtypes into strict original from pg_proc where oid=current_function;
    delegated:=substring(original.prosrc from 'public\.([a-z0-9_]+(_fw_[a-f0-9]{8}|_before_fan_web|_before_reward_source))[[:space:]]*\(');
    if delegated is null then return definition; end if;
    select p.oid::regprocedure into strict current_function from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=delegated and p.proargtypes=original.proargtypes;
  end loop;
end $$;

do $$
declare
  creator uuid:='fa110000-0000-4000-8000-000000000001';
  owner_legacy uuid:='fa110000-0000-4000-8000-000000000002';
  owner_native uuid:='fa110000-0000-4000-8000-000000000003';
  binding uuid:='fa110000-0000-4000-8000-000000000004';
  action_code integer;entity_id uuid;outbox_id uuid;descriptor jsonb;snapshot jsonb;
  reaction_id uuid:='fa110000-0000-4000-8000-000000000005';
  reaction_job uuid:='fa110000-0000-4000-8000-000000000006';
  legacy_reaction uuid:='fa110000-0000-4000-8000-000000000010';
  legacy_reaction_job uuid:='fa110000-0000-4000-8000-000000000011';
  historical_occurrence uuid:='fa110000-0000-4000-8000-000000000012';
  historical_outbox uuid:='fa110000-0000-4000-8000-000000000013';
  issuance text:='0x'||repeat('a',64);
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'fan-action-producer','published','/fan-action.webp',now(),'{artist}','idol');
  insert into public.app_users(id,privy_user_id,verified_email,status) values
    (owner_legacy,'did:privy:fan-action-legacy','fan-action-legacy@byus.test','active'),
    (owner_native,'did:privy:fan-action-native','fan-action-native@byus.test','active');

  -- With no route rows, the existing producer remains the only lane.
  perform pg_temp.assert(not public.fan_action_native_enabled(7),'missing route must be disabled');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(owner_legacy,91342,'0x1111111111111111111111111111111111111111','privy','embedded');
  perform pg_temp.assert(exists(select 1 from public.community_stamps
    where app_user_id=owner_legacy and kind='welcome' and blockchain_job_id is not null and fan_action_outbox_id is null),
    'disabled welcome producer did not preserve legacy lane');
  perform public.react_to_creator(owner_legacy,creator,legacy_reaction,legacy_reaction_job,'0x'||repeat('9',64));

  insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,
    binding_version,asset_base_uri,assets) values(binding,91342,'0x'||repeat('1',64),
    '0x2222222222222222222222222222222222222222','0x3333333333333333333333333333333333333333',
    '0x'||repeat('4',64),1,1,'ipfs://bafybeigdyrzt',jsonb_build_object(
      '0','0x5555555555555555555555555555555555555555',
      '1','0x6666666666666666666666666666666666666666',
      '2','0x7777777777777777777777777777777777777777'));
  for action_code in 1..11 loop
    insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at)
      values(action_code,binding,true,1,clock_timestamp());
  end loop;
  insert into public.fan_action_verified_creators(
    binding_id,creator_id,verified_block_number,verified_block_hash,verified_at
  ) values(binding,creator,123456,'0x'||repeat('8',64),clock_timestamp());

  -- Exercise every registered action code through the same atomic source adapter.
  for action_code in 1..11 loop
    entity_id:=extensions.gen_random_uuid();
    descriptor:=jsonb_build_array(jsonb_build_object(
      'entityType',case when action_code=1 then 'passport' when action_code=6 then 'reaction'
        when action_code between 7 and 10 then 'community_stamp' when action_code=11 then 'collectible' else 'stamp' end,
      'entityId',entity_id,'kind',case when action_code=1 then 0 when action_code=11 then 2 else 1 end,
      'issuanceKey',case when action_code=11 then null else '0x'||encode(extensions.digest('issuance:'||action_code::text,'sha256'),'hex') end,
      'operationKey','byus:test:v1:'||entity_id::text,'legacyPayload',case
        when action_code=1 then jsonb_build_object('recipient','0x1111111111111111111111111111111111111111',
          'celebritySlug','fan-action-producer','passportId','0x'||repeat('1',64))
        when action_code between 2 and 5 then jsonb_build_object('recipient','0x1111111111111111111111111111111111111111',
          'celebritySlug','fan-action-producer','issuanceId','0x'||encode(extensions.digest('issuance:'||action_code::text,'sha256'),'hex'),
          'stampType',case action_code when 2 then 'Reservation' when 3 then 'Attendance' else 'Survey' end)
        when action_code=6 then jsonb_build_object('recipient','0x1111111111111111111111111111111111111111',
          'celebritySlug','fan-action-producer','issuanceId','0x'||encode(extensions.digest('issuance:6','sha256'),'hex'),
          'reactionType','FirstReaction')
        when action_code between 7 and 10 then jsonb_build_object('recipient','0x1111111111111111111111111111111111111111',
          'issuanceId','0x'||encode(extensions.digest('issuance:'||action_code::text,'sha256'),'hex'),
          'stampKind',case action_code when 7 then 'welcome' when 8 then 'first_comment' when 9 then 'invite' else 'daily_checkin' end,
          'celebritySlug',case when action_code in(7,9) then null else 'fan-action-producer' end)
        else jsonb_build_object('recipient','0x1111111111111111111111111111111111111111',
          'celebritySlug','fan-action-producer','liveSlug','producer-test-live','claimId',entity_id::text,'metadataVersion',1)
      end));
    if action_code=1 then
      entity_id:=extensions.gen_random_uuid();
      descriptor:=descriptor||jsonb_build_array(jsonb_build_object('entityType','stamp','entityId',entity_id,'kind',1,
        'issuanceKey','0x'||encode(extensions.digest('issuance:1:stamp','sha256'),'hex'),
        'operationKey','byus:test:v1:'||entity_id::text,'legacyPayload',jsonb_build_object(
          'recipient','0x1111111111111111111111111111111111111111','celebritySlug','fan-action-producer',
          'issuanceId','0x'||encode(extensions.digest('issuance:1:stamp','sha256'),'hex'),'stampType','Knowledge')));
    end if;
    outbox_id:=public.enqueue_fan_action_source('producer_test','source-'||action_code::text,owner_legacy,creator,null,
      '2026-09-13 01:00:00+09',action_code,descriptor);
    select source_snapshot into strict snapshot from public.fan_action_outbox where id=outbox_id;
    perform pg_temp.assert(snapshot->>'version'='1' and snapshot->>'actionCode'=action_code::text
      and snapshot->>'policyVersion'='1' and snapshot->>'operationKind'='RECORD_AND_ISSUE'
      and snapshot->>'origin'='NATIVE' and snapshot->>'assetBaseUri'='ipfs://bafybeigdyrzt'
      and snapshot->>'sourceOccurredAt' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      and snapshot->>'evidenceCommitment' ~ '^0x[0-9a-f]{64}$'
      and snapshot->>'migrationBatchId'='0x'||repeat('0',64)
      and jsonb_typeof(snapshot->'migrationProof')='array'
      and jsonb_array_length(snapshot->'credentials')=case when action_code=1 then 2 else 1 end
      and (action_code<>11 or snapshot->'credentials'->0->'issuanceKey'='null'::jsonb),
      'worker snapshot contract failed for code '||action_code);
  end loop;
  perform pg_temp.assert((select count(*) from public.fan_action_occurrences where source_namespace='producer_test')=11,
    'not all 11 occurrences were persisted');
  perform pg_temp.assert((select count(*) from public.fan_action_credentials credential join public.fan_action_outbox outbox
    on outbox.id=credential.outbox_id join public.fan_action_occurrences occurrence on occurrence.id=outbox.occurrence_row_id
    where occurrence.source_namespace='producer_test')=12,'credential fan-out changed');

  -- Actual trigger producer: enabling WELCOME changes only new sources to v2.
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(owner_native,91342,'0x8888888888888888888888888888888888888888','privy','embedded');
  perform pg_temp.assert(exists(select 1 from public.community_stamps where app_user_id=owner_native and kind='welcome'
    and blockchain_job_id is null and fan_action_outbox_id is not null),'enabled welcome producer did not use v2 lane');

  perform public.react_to_creator(owner_native,creator,reaction_id,reaction_job,issuance);
  perform pg_temp.assert(exists(select 1 from public.fan_reactions where id=reaction_id
    and blockchain_job_id is null and fan_action_outbox_id is not null),'enabled reaction producer did not use v2 lane');
  perform pg_temp.assert(not exists(select 1 from public.blockchain_jobs where id=reaction_job),
    'enabled producer created a fake legacy job');

  -- H2 recovery overlays a completed historical mint in owner reads while the
  -- legacy business row and its original queue job remain unchanged.
  insert into public.fan_action_occurrences(id,source_namespace,canonical_source_key,app_user_id,creator_id,source_occurred_at)
    values(historical_occurrence,'historical_test',legacy_reaction::text,owner_legacy,creator,'2026-09-12 01:00:00+09');
  insert into public.fan_action_outbox(id,occurrence_row_id,binding_id,operation_kind,source_snapshot,action_id,occurrence_id,
    request_hash,payload,status,tx_hash,signed_transaction)
    values(historical_outbox,historical_occurrence,binding,'import_historical','{}',
      '0x'||repeat('a',64),'0x'||repeat('b',64),'0x'||repeat('c',64),'{}','COMPLETED','0x'||repeat('d',64),'0x12');
  insert into public.fan_action_credentials(outbox_id,entity_type,entity_id,credential_kind,issuance_key,legacy_job_id,
    token_id,nft_contract,metadata_uri,link_origin)
    values(historical_outbox,'reaction',legacy_reaction,1,'0x'||repeat('9',64),legacy_reaction_job,77,
      '0x6666666666666666666666666666666666666666','ipfs://bafybeigdyrzt/reaction.json','MINTED_NOW');
  perform pg_temp.assert(public.get_owned_reaction(owner_legacy,'fan-action-producer')->>'mintStatus'='minted',
    'completed H2 mint was not visible in the owner reaction read');
  perform pg_temp.assert((select mint_status='queued' and blockchain_job_id=legacy_reaction_job and tx_hash is null and token_id is null
    from public.fan_reactions where id=legacy_reaction)
    and (select status='PENDING' and tx_hash is null and token_id is null from public.blockchain_jobs where id=legacy_reaction_job),
    'H2 read overlay mutated legacy evidence');
  perform pg_temp.assert(public.effective_fan_action_mint(owner_legacy,'reaction',legacy_reaction,'minted',
    '0x'||repeat('e',64),'88')=jsonb_build_object('status','minted','txHash','0x'||repeat('e',64),'tokenId','88'),
    'H1 existing mint evidence was replaced by an import overlay');

  perform pg_temp.expect_error(format('update public.fan_reactions set fan_action_outbox_id=%L where id=%L',
    (select id from public.fan_action_outbox where id<>(select fan_action_outbox_id from public.fan_reactions where id=reaction_id) limit 1),reaction_id),
    'credential fan action link is immutable');
end $$;

-- Exercise every public producer with its route enabled. The fixtures model one
-- complete fan journey and keep all business-side score, ticket, rate-limit,
-- response, and idempotency writes inside the same transaction as the v2 lane.
do $$
declare
  creator uuid:='fa110000-0000-4000-8000-000000000001';
  binding uuid:='fa110000-0000-4000-8000-000000000004';
  private_creator uuid:='fa110000-0000-4000-8000-000000000014';
  owner uuid:='fa110000-0000-4000-8000-000000000003';
  invitee uuid:='fa110000-0000-4000-8000-000000000007';
  brand uuid:='fa110000-0000-4000-8000-000000000008';
  allowlist uuid:='fa110000-0000-4000-8000-000000000009';
  quiz uuid:='fa120000-0000-4000-8000-000000000001';
  attempt uuid:='fa120000-0000-4000-8000-000000000002';
  passport_stamp uuid:='fa120000-0000-4000-8000-000000000003';
  live_reserve uuid:='fa130000-0000-4000-8000-000000000001';
  live_mission uuid:='fa130000-0000-4000-8000-000000000002';
  live_collectible uuid:='fa130000-0000-4000-8000-000000000003';
  reservation_stamp uuid:='fa140000-0000-4000-8000-000000000001';
  attendance_stamp uuid:='fa140000-0000-4000-8000-000000000002';
  survey_stamp uuid:='fa140000-0000-4000-8000-000000000003';
  mission_stamp uuid:='fa140000-0000-4000-8000-000000000004';
  legacy_survey uuid:='fa150000-0000-4000-8000-000000000001';
  mission uuid:='fa150000-0000-4000-8000-000000000002';
  survey_question uuid:='fa150000-0000-4000-8000-000000000011';
  mission_question uuid:='fa150000-0000-4000-8000-000000000012';
  survey_option uuid:='fa150000-0000-4000-8000-000000000021';
  mission_option uuid:='fa150000-0000-4000-8000-000000000023';
  template_live public.live_events%rowtype;
  template_localization public.live_event_localizations%rowtype;
  reward_setting public.live_reward_setting_revisions%rowtype;
  requirement uuid:='fa160000-0000-4000-8000-000000000001';
  completion uuid:='fa160000-0000-4000-8000-000000000002';
  observed timestamptz:=statement_timestamp();
  result jsonb;invite_code text;passport_id uuid;attendance_id uuid;claim_id uuid;share_link jsonb;
  i integer;q uuid;o_good uuid;o_bad uuid;snapshot_q uuid;snapshot_good uuid;snapshot_bad uuid;
  invite_attempt uuid:='fa120000-0000-4000-8000-000000000005';
  invite_stamp uuid:='fa120000-0000-4000-8000-000000000006';
  source_question record;source_option record;
  same_mission uuid:='fa150000-0000-4000-8000-000000000041';
  same_question uuid:='fa150000-0000-4000-8000-000000000042';
  same_option_a uuid:='fa150000-0000-4000-8000-000000000043';
  same_option_b uuid:='fa150000-0000-4000-8000-000000000044';
  same_stamp uuid:='fa140000-0000-4000-8000-000000000005';
  late_mission uuid:='fa150000-0000-4000-8000-000000000051';
  late_question uuid:='fa150000-0000-4000-8000-000000000052';
  late_option_a uuid:='fa150000-0000-4000-8000-000000000053';
  late_option_b uuid:='fa150000-0000-4000-8000-000000000054';
  late_stamp uuid:='fa140000-0000-4000-8000-000000000006';
  same_result jsonb;get_before jsonb;get_after jsonb;late_result jsonb;survey_result jsonb;
  survey_response uuid;idem_old uuid:='fa150000-0000-4000-8000-000000000061';
  idem_draft uuid:='fa150000-0000-4000-8000-000000000062';idem_zero uuid:='fa150000-0000-4000-8000-000000000063';
  rewritten integer;live_id uuid;answers jsonb;snap_other jsonb;
  live_zero uuid:='fa130000-0000-4000-8000-000000000004';
  zero_survey uuid:='fa150000-0000-4000-8000-000000000071';
  zero_question uuid:='fa150000-0000-4000-8000-000000000072';
  zero_option uuid:='fa150000-0000-4000-8000-000000000073';
  zero_stamp uuid:='fa140000-0000-4000-8000-000000000007';
  zero_result jsonb;
  late_stamp_2 uuid:='fa140000-0000-4000-8000-000000000008';
begin
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','팬 행동 테스트','팬 행동 테스트','팬 행동 테스트'),
    (creator,'en','Fan action test','Fan action test','Fan action test');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(private_creator,'fan-action-private','draft','/fan-action-private.webp','{artist}','idol');
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)
    values(brand,'fan-action-brand','published','/fan-action-brand.svg','Fan action brand',observed);
  insert into public.brand_localizations(brand_id,locale,name,description) values
    (brand,'ko','팬 행동 브랜드','팬 행동 브랜드'),(brand,'en','Fan action brand','Fan action brand');
  insert into public.admin_allowlist(id,email,role,active,created_by_app_user_id)
    values(allowlist,'fan-action-native@byus.test','admin',true,owner);
  insert into public.app_users(id,privy_user_id,verified_email,status)
    values(invitee,'did:privy:fan-action-invitee','fan-action-invitee@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(invitee,91342,'0x9999999999999999999999999999999999999999','privy','embedded');
  begin
    perform public.enqueue_fan_action_source('public_context_test','private-creator',owner,private_creator,null,observed,6,
      jsonb_build_array(jsonb_build_object('entityType','reaction','entityId',extensions.gen_random_uuid(),'kind',1,
        'issuanceKey','0x'||repeat('8',64),'operationKey','byus:test:private-creator',
        'legacyPayload',jsonb_build_object('recipient','0x8888888888888888888888888888888888888888',
          'celebritySlug','fan-action-private','issuanceId','0x'||repeat('8',64),'reactionType','FirstReaction'))));
    raise exception 'private creator source unexpectedly accepted';
  exception when others then
    if sqlerrm<>'FAN_ACTION_CREATOR_NOT_PUBLIC' then raise; end if;
  end;

  insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)
    values(quiz,creator,1,'draft',null);
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key)
    values(attempt,owner,creator,quiz,1,'fa120000-0000-4000-8000-000000000004');
  for i in 1..3 loop
    q:=('fa121000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    o_good:=('fa122000-0000-4000-8000-'||lpad((i*2-1)::text,12,'0'))::uuid;
    o_bad:=('fa122000-0000-4000-8000-'||lpad((i*2)::text,12,'0'))::uuid;
    snapshot_q:=('fa123000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    snapshot_good:=('fa124000-0000-4000-8000-'||lpad((i*2-1)::text,12,'0'))::uuid;
    snapshot_bad:=('fa124000-0000-4000-8000-'||lpad((i*2)::text,12,'0'))::uuid;
    insert into public.celebrity_quiz_questions(id,quiz_id,position,prompt_ko,prompt_en)
      values(q,quiz,i,'질문 '||i,'Question '||i);
    insert into public.celebrity_quiz_options(id,question_id,position,label_ko,label_en,is_correct) values
      (o_good,q,1,'정답','Correct',true),(o_bad,q,2,'오답','Wrong',false);
    insert into public.quiz_attempt_questions(id,attempt_id,quiz_id,source_question_id,position,prompt_ko,prompt_en)
      values(snapshot_q,attempt,quiz,q,i,'질문 '||i,'Question '||i);
    insert into public.quiz_attempt_options(id,attempt_question_id,source_question_id,source_option_id,position,label_ko,label_en,is_correct) values
      (snapshot_good,snapshot_q,q,o_good,1,'정답','Correct',true),
      (snapshot_bad,snapshot_q,q,o_bad,2,'오답','Wrong',false);
    insert into public.quiz_attempt_answers(attempt_id,attempt_question_id,selected_option_id)
      values(attempt,snapshot_q,snapshot_good);
  end loop;
  update public.celebrity_quizzes set status='published',published_at=observed where id=quiz;
  -- The personal-letter producer must retain both canary actor and creator
  -- verification gates. Roll back each successful fallback so the same actual
  -- answered attempt can subsequently prove the authorized v2 branch below.
  for i in 1..2 loop
    begin
      if i=1 then
        insert into public.fan_action_canary_scope(action_code,app_user_id)
          values(1,'fa110000-0000-4000-8000-000000000002');
      else
        delete from public.fan_action_verified_creators where creator_id=creator;
      end if;
      result:=public.submit_owned_quiz_attempt(owner,attempt,passport_stamp,
        'byus:passport:v1:'||owner::text||':fan-action-producer','0x'||repeat('b',64),
        'byus:stamp:v1:'||passport_stamp::text,'0x'||repeat('c',64));
      perform pg_temp.assert(exists(select 1 from public.fan_passports
        where app_user_id=owner and celebrity_id=creator
          and fan_action_outbox_id is null and blockchain_job_id is not null),
        case when i=1 then 'non-canary quiz actor bypassed scope'
          else 'unverified quiz creator bypassed scope' end);
      perform pg_temp.assert(not exists(select 1 from public.fan_action_occurrences
        where app_user_id=owner and source_namespace='quiz_passes'),
        'ineligible quiz emitted a native credential occurrence');
      raise exception 'QUIZ_SCOPE_FALLBACK_VERIFIED_ROLLBACK';
    exception when raise_exception then
      if sqlerrm <> 'QUIZ_SCOPE_FALLBACK_VERIFIED_ROLLBACK' then raise; end if;
    end;
  end loop;
  result:=public.submit_owned_quiz_attempt(owner,attempt,passport_stamp,
    'byus:passport:v1:'||owner::text||':fan-action-producer','0x'||repeat('b',64),
    'byus:stamp:v1:'||passport_stamp::text,'0x'||repeat('c',64));
  select id into strict passport_id from public.fan_passports where app_user_id=owner and celebrity_id=creator;
  perform pg_temp.assert((select fan_action_outbox_id is not null and blockchain_job_id is null from public.fan_passports where id=passport_id),
    'enabled quiz did not issue its Passport through v2');
  perform pg_temp.assert((select count(*) from public.fan_action_credentials credential
    join public.fan_action_outbox outbox on outbox.id=credential.outbox_id
    join public.fan_action_occurrences occurrence on occurrence.id=outbox.occurrence_row_id
    where occurrence.source_namespace='quiz_passes' and occurrence.app_user_id=owner)=2,
    'enabled quiz did not enqueue both credentials');

  -- A newly registered LIVE must use binding 2 while older non-LIVE routes stay on binding 1.
  insert into public.fan_action_bindings(chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,
    binding_version,asset_base_uri,assets)
    select chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,2,asset_base_uri,
      assets||jsonb_build_object('1','0xabababababababababababababababababababab')
    from public.fan_action_bindings where id=binding returning id into binding;
  update public.fan_action_producer_routes set binding_id=binding where action_code in(2,3,4,5);
  insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at)
    values(binding,creator,123456,'0x'||repeat('8',64),clock_timestamp());
  select * into strict template_live from public.live_events where publication_status='published' limit 1;
  select * into strict template_localization from public.live_event_localizations
    where live_event_id=template_live.id and locale='ko';
  insert into public.live_events select (jsonb_populate_record(null::public.live_events,to_jsonb(template_live)||jsonb_build_object(
    'id',live_reserve,'slug','fan-action-live','celebrity_id',creator,'brand_id',brand,
    'starts_at',observed+interval '1 hour','ends_at',observed+interval '2 hours',
    'reservation_opens_at',observed-interval '1 hour','reservation_closes_at',observed+interval '30 minutes',
    'attendance_valid_from',observed-interval '1 hour','attendance_valid_until',observed+interval '3 hours',
    'fan_code_hash',extensions.crypt('FAN2026',extensions.gen_salt('bf',12)),
    'publication_status','draft','published_at',null,'ever_published_at',null,'created_at',observed,'updated_at',observed))).*;
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
    select live_reserve,locale,'Fan action live','Fan action live','Fan action live'
    from (values('ko'::public.content_locale),('en'::public.content_locale)) locale(locale);
  begin
    perform public.enqueue_fan_action_source('public_context_test','draft-campaign',owner,creator,live_reserve,observed,2,
      jsonb_build_array(jsonb_build_object('entityType','stamp','entityId',extensions.gen_random_uuid(),'kind',1,
        'issuanceKey','0x'||repeat('7',64),'operationKey','byus:test:draft-campaign',
        'legacyPayload',jsonb_build_object('recipient','0x8888888888888888888888888888888888888888',
          'celebritySlug','fan-action-producer','issuanceId','0x'||repeat('7',64),'stampType','Reservation'))));
    raise exception 'draft campaign source unexpectedly accepted';
  exception when others then
    if sqlerrm<>'FAN_ACTION_CAMPAIGN_NOT_PUBLIC' then raise; end if;
  end;
  update public.live_events set publication_status='published',published_at=observed,ever_published_at=observed where id=live_reserve;
  begin
    perform public.fan_action_native_enabled(2,owner,creator,live_reserve);
    raise exception 'unverified binding 2 LIVE unexpectedly accepted';
  exception when others then
    if sqlerrm<>'FAN_ACTION_CONTEXT_NOT_VERIFIED' then raise; end if;
  end;
  insert into public.fan_action_verified_campaigns(
    binding_id,campaign_id,creator_id,verified_block_number,verified_block_hash,verified_at
  ) values(binding,live_reserve,creator,123456,'0x'||repeat('8',64),clock_timestamp());
  insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,
    mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)
    select live_reserve,2,activation.policy_version,'published',1,1,0,
      'fa130000-0000-4000-8000-000000000021',observed from public.reward_policy_activation activation where activation.singleton;

  result:=public.reserve_owned_live_event(owner,live_reserve,'fa130000-0000-4000-8000-000000000011',reservation_stamp,
    'byus:stamp:v1:'||reservation_stamp::text,'0x'||repeat('d',64));
  perform pg_temp.assert(exists(select 1 from public.stamps where id=reservation_stamp and fan_action_outbox_id is not null and blockchain_job_id is null),
    'enabled reservation did not use v2');
  perform pg_temp.assert(exists(select 1 from public.stamps s join public.fan_action_outbox o on o.id=s.fan_action_outbox_id
    where s.id=reservation_stamp and o.binding_id=binding and o.source_snapshot->>'bindingVersion'='2'
      and o.source_snapshot#>>'{credentials,0,nftContract}'='0xabababababababababababababababababababab'),
    'registered LIVE did not select the new NFT contract');
  result:=public.reserve_owned_live_event(owner,live_reserve,'fa130000-0000-4000-8000-000000000011',reservation_stamp,
    'byus:stamp:v1:'||reservation_stamp::text,'0x'||repeat('d',64));
  perform pg_temp.assert((select count(*) from public.live_reservations
      where app_user_id=owner and live_event_id=live_reserve)=1
      and (select count(*) from public.fan_action_occurrences
        where app_user_id=owner and source_namespace='live_reservations')=1,
    'verified campaign replay duplicated its business or native occurrence');
  result:=public.attend_owned_live_event(owner,'fan-action-live','fa130000-0000-4000-8000-000000000012','FAN2026',true,
    attendance_stamp,'byus:stamp:v1:'||attendance_stamp::text,'0x'||repeat('e',64));
  select id into strict attendance_id from public.live_attendances where app_user_id=owner and live_event_id=live_reserve;
  perform pg_temp.assert(exists(select 1 from public.stamps where id=attendance_stamp and fan_action_outbox_id is not null and blockchain_job_id is null)
    and exists(select 1 from public.attendance_verification_attempts where app_user_id=owner and live_event_id=live_reserve and category='success')
    and exists(select 1 from public.attendance_rate_limits where app_user_id=owner and live_event_id=live_reserve and failed_count=0 and blocked_until is null),
    'enabled attendance did not preserve the successful rate-limit path');

  insert into public.live_surveys(id,live_event_id,version,legacy_contract,attendance_requirement,visible_from,visible_until)
    values(legacy_survey,live_reserve,1,true,'required',observed-interval '1 hour',observed+interval '1 day');
  insert into public.live_survey_localizations(survey_id,locale,title,description) values
    (legacy_survey,'ko','팬 행동 설문','팬 행동 설문'),(legacy_survey,'en','Fan action survey','Fan action survey');
  insert into public.live_survey_questions(id,survey_id,question_type,position) values(survey_question,legacy_survey,'single_choice',1);
  insert into public.live_survey_question_localizations(question_id,locale,question_text) values
    (survey_question,'ko','선택'),(survey_question,'en','Choose');
  insert into public.live_survey_options(id,question_id,position) values(survey_option,survey_question,1);
  insert into public.live_survey_option_localizations(option_id,locale,label) values
    (survey_option,'ko','예'),(survey_option,'en','Yes');
  update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=observed,
    ever_published_at=observed where id=legacy_survey;
  -- P1-SURVEY-503-2 mission-first order: a mission of the same LIVE is completed before the survey.
  insert into public.live_surveys(id,live_event_id,version,mission_type,legacy_contract,attendance_requirement,visible_from,visible_until)
    values(same_mission,live_reserve,2,'vote',false,'not_required',observed-interval '1 hour',observed+interval '1 day');
  insert into public.live_survey_localizations(survey_id,locale,title,description) values
    (same_mission,'ko','같은 LIVE 미션','같은 LIVE 미션'),(same_mission,'en','Same LIVE mission','Same LIVE mission');
  insert into public.live_survey_questions(id,survey_id,question_type,position) values(same_question,same_mission,'single_choice',1);
  insert into public.live_survey_question_localizations(question_id,locale,question_text) values
    (same_question,'ko','선택'),(same_question,'en','Choose');
  insert into public.live_survey_options(id,question_id,position) values(same_option_a,same_question,1),(same_option_b,same_question,2);
  insert into public.live_survey_option_localizations(option_id,locale,label) values
    (same_option_a,'ko','A'),(same_option_a,'en','A'),(same_option_b,'ko','B'),(same_option_b,'en','B');
  update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=observed,
    ever_published_at=observed where id=same_mission;
  same_result:=public.submit_owned_live_mission(owner,same_mission,'fa150000-0000-4000-8000-000000000045',
    jsonb_build_array(jsonb_build_object('questionId',same_question,'selectedOptionIds',jsonb_build_array(same_option_a))),
    same_stamp,'byus:stamp:v1:'||same_stamp::text,'0x'||repeat('3',64));
  get_before:=public.get_owned_live_survey(owner,'fan-action-live','en');
  perform pg_temp.assert(same_result ? 'mission' and exists(select 1 from public.stamps where id=same_stamp),
    'same-LIVE mission did not complete');
  result:=public.submit_owned_live_survey(owner,'fan-action-live','fa150000-0000-4000-8000-000000000031',
    jsonb_build_array(jsonb_build_object('questionId',survey_question,'selectedOptionIds',jsonb_build_array(survey_option))),
    survey_stamp,'byus:stamp:v1:'||survey_stamp::text,'0x'||repeat('1',64));
  perform pg_temp.assert(
    get_before->'response'='null'::jsonb and get_before->'completion'='null'::jsonb
    and result ? 'completion' and not (result ? 'mission')
    and exists(select 1 from public.stamps where id=survey_stamp)
    and (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and legacy_contract and status='submitted')=1
    and (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and not legacy_contract and status='submitted')=1
    and (select count(*) from public.fan_activities a join public.live_survey_responses r on r.id=a.source_id and a.source_type='live_survey_response'
         where a.app_user_id=owner and r.live_event_id=live_reserve and r.legacy_contract)=1
    and (select count(*) from public.fan_score_ledger l join public.fan_activities a on a.id=l.activity_id join public.live_survey_responses r on r.id=a.source_id
         where a.app_user_id=owner and r.live_event_id=live_reserve and r.legacy_contract)=1
    and public.submit_owned_live_mission(owner,same_mission,'fa150000-0000-4000-8000-000000000045',
      jsonb_build_array(jsonb_build_object('questionId',same_question,'selectedOptionIds',jsonb_build_array(same_option_a))),
      same_stamp,'byus:stamp:v1:'||same_stamp::text,'0x'||repeat('3',64))=same_result,
    format('mission-first: survey GET not submitted=%s, submit returned survey completion=%s, survey stamp stored=%s, legacy submitted=%s, survey payments=%s, mission result=%s',
      get_before->'response'='null'::jsonb, result ? 'completion',
      exists(select 1 from public.stamps where id=survey_stamp),
      (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and legacy_contract and status='submitted'),
      (select count(*) from public.fan_score_ledger l join public.fan_activities a on a.id=l.activity_id join public.live_survey_responses r on r.id=a.source_id
         where a.app_user_id=owner and r.live_event_id=live_reserve and r.legacy_contract),
      left(same_result::text,80)));
  perform pg_temp.assert(exists(select 1 from public.stamps where id=survey_stamp and fan_action_outbox_id is not null and blockchain_job_id is null),
    'enabled survey did not use v2');
  perform pg_temp.assert(result->'completion'->'earnedStamp'->>'id'=survey_stamp::text
    and (result->'completion'->>'scoreDelta')::integer=(result->'response'->>'scorePoints')::integer
    and result->'completion'->'earnedStamp'->>'mintStatus'=result->'response'->'stamp'->>'mintStatus',
    'survey submission result lacks a consistent completion');
  perform pg_temp.assert(public.submit_owned_live_survey(owner,'fan-action-live','fa150000-0000-4000-8000-000000000031',
    jsonb_build_array(jsonb_build_object('questionId',survey_question,'selectedOptionIds',jsonb_build_array(survey_option))),
    survey_stamp,'byus:stamp:v1:'||survey_stamp::text,'0x'||repeat('1',64))=result,'survey replay result differs');
  perform pg_temp.assert(public.get_owned_live_survey(owner,'fan-action-live','en')->'completion'=result->'completion',
    'survey GET completion differs from the submission result');
  -- Zero-score reward setting: no ledger row exists. Simulated by removing the row in this rolled-back test.
  set local session_replication_role=replica;
  delete from public.fan_score_ledger where activity_id=(result->'response'->>'activityId')::uuid;
  set local session_replication_role=origin;
  result:=public.build_owned_live_survey_submission_result(owner,(select id from public.live_survey_responses where app_user_id=owner and legacy_contract and live_event_id=(select id from public.live_events where slug='fan-action-live')));
  perform pg_temp.assert((result->'response'->>'scorePoints')::integer=0 and (result->'completion'->>'scoreDelta')::integer=0
    and result->'completion'->'earnedStamp'->>'id'=survey_stamp::text
    and result->'completion'->'earnedStamp'->>'mintStatus'=result->'response'->'stamp'->>'mintStatus'
    and (result->'completion'->>'updatedScore')::integer>=0 and (result->'completion'->>'leveledUp')::boolean=false,
    'zero-score survey result lacks a consistent completion');
  perform pg_temp.assert(public.get_owned_live_survey(owner,'fan-action-live','en')->'completion'=result->'completion',
    'zero-score survey GET completion differs');

  -- Order 2 (survey first, mission afterwards): a mission of the same LIVE must not change the survey side.
  get_before:=public.get_owned_live_survey(owner,'fan-action-live','en');
  insert into public.live_surveys(id,live_event_id,version,mission_type,legacy_contract,attendance_requirement,visible_from,visible_until)
    values(late_mission,live_reserve,3,'vote',false,'not_required',observed-interval '1 hour',observed+interval '1 day');
  insert into public.live_survey_localizations(survey_id,locale,title,description) values
    (late_mission,'ko','늦은 미션','늦은 미션'),(late_mission,'en','Late mission','Late mission');
  insert into public.live_survey_questions(id,survey_id,question_type,position) values(late_question,late_mission,'single_choice',1);
  insert into public.live_survey_question_localizations(question_id,locale,question_text) values
    (late_question,'ko','선택'),(late_question,'en','Choose');
  insert into public.live_survey_options(id,question_id,position) values(late_option_a,late_question,1),(late_option_b,late_question,2);
  insert into public.live_survey_option_localizations(option_id,locale,label) values
    (late_option_a,'ko','A'),(late_option_a,'en','A'),(late_option_b,'ko','B'),(late_option_b,'en','B');
  update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=observed,
    ever_published_at=observed where id=late_mission;
  late_result:=public.submit_owned_live_mission(owner,late_mission,'fa150000-0000-4000-8000-000000000046',
    jsonb_build_array(jsonb_build_object('questionId',late_question,'selectedOptionIds',jsonb_build_array(late_option_a))),
    late_stamp,'byus:stamp:v1:'||late_stamp::text,'0x'||repeat('4',64));
  get_after:=public.get_owned_live_survey(owner,'fan-action-live','en');
  answers:=jsonb_build_array(jsonb_build_object('questionId',survey_question,'selectedOptionIds',jsonb_build_array(survey_option)));
  survey_result:=public.submit_owned_live_survey(owner,'fan-action-live','fa150000-0000-4000-8000-000000000036',answers,
    late_stamp_2,'byus:stamp:v1:'||late_stamp_2::text,'0x'||repeat('5',64));
  perform pg_temp.assert(late_result ? 'mission' and (get_before #- '{completion,updatedScore}')=(get_after #- '{completion,updatedScore}')
    and (get_after->'completion'->>'updatedScore')::integer>(get_before->'completion'->>'updatedScore')::integer
    and survey_result->'completion'=get_after->'completion'
    and survey_result->'response'->>'activityId'=result->'response'->>'activityId'
    and not exists(select 1 from public.stamps where id=late_stamp_2)
    and (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and legacy_contract)=1
    and (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and not legacy_contract and status='submitted')=2
    and (select count(*) from public.fan_activities a join public.live_survey_responses r on r.id=a.source_id and a.source_type='live_survey_response'
         where a.app_user_id=owner and r.live_event_id=live_reserve and r.legacy_contract)=1,
    format('survey-first: before=%s after=%s mission=%s get_same_except_total=%s completion_same=%s activity_same=%s no_new_stamp=%s legacy=%s missions=%s survey_activities=%s',
      get_before::text, get_after::text, late_result ? 'mission', (get_before #- '{completion,updatedScore}')=(get_after #- '{completion,updatedScore}'), survey_result->'completion'=get_after->'completion',
      survey_result->'response'->>'activityId'=result->'response'->>'activityId',
      not exists(select 1 from public.stamps where id=late_stamp_2),
      (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and legacy_contract),
      (select count(*) from public.live_survey_responses where app_user_id=owner and live_event_id=live_reserve and not legacy_contract and status='submitted'),
      (select count(*) from public.fan_activities a join public.live_survey_responses r on r.id=a.source_id and a.source_type='live_survey_response'
         where a.app_user_id=owner and r.live_event_id=live_reserve and r.legacy_contract)));

  -- Pre-migration-shaped idempotency rows and the rewrite of the migration (same statement).
  select id into strict survey_response from public.live_survey_responses
    where app_user_id=owner and live_event_id=live_reserve and legacy_contract;
  insert into public.live_survey_idempotency(idempotency_key,app_user_id,live_event_id,operation,request_hash,response_id,result)
    values(idem_old,owner,live_reserve,'submit',encode(extensions.digest(answers::text,'sha256'),'hex'),survey_response,
      jsonb_build_object('response',result->'response'));
  insert into public.live_survey_idempotency(idempotency_key,app_user_id,live_event_id,operation,request_hash,response_id,result)
    values(idem_draft,owner,live_reserve,'save_draft',repeat('b',64),survey_response,
      jsonb_build_object('response',jsonb_build_object('status','draft','revision',1,'answers','[]'::jsonb,'updatedAt',observed)));
  perform pg_temp.assert((select count(*) from public.live_survey_idempotency i
      where i.operation='submit' and i.result ? 'response' and not (i.result ? 'completion'))=1
    and (select count(*) from public.live_survey_idempotency i where i.result ? 'mission')=2
    and (select count(*) from public.live_survey_idempotency i where i.operation='save_draft' and not (i.result ? 'completion'))>=1,
    'idempotency fixture does not have exactly one old-shaped survey submit row');
  snap_other:=(select jsonb_object_agg(i.idempotency_key,i.result) from public.live_survey_idempotency i where i.idempotency_key<>idem_old);
  update public.live_survey_idempotency stored
  set result = rebuilt.result
  from (
    select idem.idempotency_key,
      public.build_owned_live_survey_submission_result(idem.app_user_id, idem.response_id) as result
    from public.live_survey_idempotency idem
    join public.live_survey_responses response on response.id = idem.response_id and response.legacy_contract
    where idem.operation = 'submit' and idem.result ? 'response' and not (idem.result ? 'completion')
  ) rebuilt
  where stored.idempotency_key = rebuilt.idempotency_key and rebuilt.result is not null;
  get diagnostics rewritten = row_count;
  perform pg_temp.assert(rewritten=1
    and (select i.result from public.live_survey_idempotency i where i.idempotency_key=idem_old)
      =public.build_owned_live_survey_submission_result(owner,survey_response)
    and (select (i.result->'completion'->>'scoreDelta')::integer=0 and (i.result->'response'->>'scorePoints')::integer=0
      from public.live_survey_idempotency i where i.idempotency_key=idem_old)
    and (select not (i.result ? 'completion') from public.live_survey_idempotency i where i.idempotency_key=idem_draft)
    and snap_other=(select jsonb_object_agg(i.idempotency_key,i.result) from public.live_survey_idempotency i where i.idempotency_key<>idem_old)
    and (select count(*) from public.live_survey_idempotency i where i.result ? 'mission')=2,
    format('idempotency rewrite: rows=%s equals_builder=%s old=%s draft_untouched=%s other_rows_unchanged=%s',
      rewritten,
      (select i.result from public.live_survey_idempotency i where i.idempotency_key=idem_old)=public.build_owned_live_survey_submission_result(owner,survey_response),
      (select i.result::text from public.live_survey_idempotency i where i.idempotency_key=idem_old),
      (select not (i.result ? 'completion') from public.live_survey_idempotency i where i.idempotency_key=idem_draft),
      snap_other=(select jsonb_object_agg(i.idempotency_key,i.result) from public.live_survey_idempotency i where i.idempotency_key<>idem_old)));
  perform pg_temp.assert(public.submit_owned_live_survey(owner,'fan-action-live',idem_old,answers,
      late_stamp_2,'byus:stamp:v1:'||late_stamp_2::text,'0x'||repeat('5',64))->'completion'=survey_result->'completion',
    'same-key resend of the rewritten idempotency row did not return the completion');

  -- Real zero-score LIVE: the published reward setting grants 0 points, so no ledger row is written.
  insert into public.live_events select (jsonb_populate_record(null::public.live_events,to_jsonb(template_live)||jsonb_build_object(
    'id',live_zero,'slug','fan-action-zero','celebrity_id',creator,'brand_id',brand,
    'attendance_valid_from',statement_timestamp()-interval '1 hour','attendance_valid_until',statement_timestamp()+interval '1 day',
    'schedule_revision',1,'publication_status','draft','published_at',null,'ever_published_at',null,'created_at',observed,'updated_at',observed))).*;
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
    select live_zero,locale,'Fan action zero','Fan action zero','Fan action zero'
    from (values('ko'::public.content_locale),('en'::public.content_locale)) locale(locale);
  update public.live_events set publication_status='published',published_at=observed,ever_published_at=observed where id=live_zero;
  insert into public.fan_action_verified_campaigns(
    binding_id,campaign_id,creator_id,verified_block_number,verified_block_hash,verified_at
  ) values(binding,live_zero,creator,123456,'0x'||repeat('8',64),clock_timestamp());
  insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,
    mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)
    select live_zero,2,activation.policy_version,'published',0,0,0,
      'fa130000-0000-4000-8000-000000000024',observed from public.reward_policy_activation activation where activation.singleton;
  insert into public.live_surveys(id,live_event_id,version,legacy_contract,attendance_requirement,visible_from,visible_until)
    values(zero_survey,live_zero,1,true,'required',observed-interval '1 hour',observed+interval '1 day');
  insert into public.live_survey_localizations(survey_id,locale,title,description) values
    (zero_survey,'ko','영점 설문','영점 설문'),(zero_survey,'en','Zero survey','Zero survey');
  insert into public.live_survey_questions(id,survey_id,question_type,position) values(zero_question,zero_survey,'single_choice',1);
  insert into public.live_survey_question_localizations(question_id,locale,question_text) values
    (zero_question,'ko','선택'),(zero_question,'en','Choose');
  insert into public.live_survey_options(id,question_id,position) values(zero_option,zero_question,1);
  insert into public.live_survey_option_localizations(option_id,locale,label) values
    (zero_option,'ko','예'),(zero_option,'en','Yes');
  update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=observed,
    ever_published_at=observed where id=zero_survey;
  insert into public.live_attendances(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)
    select owner,live_zero,creator,passport.id,'fa130000-0000-4000-8000-000000000025'
    from public.fan_passports passport where passport.app_user_id=owner and passport.celebrity_id=creator;
  zero_result:=public.submit_owned_live_survey(owner,'fan-action-zero','fa150000-0000-4000-8000-000000000074',
    jsonb_build_array(jsonb_build_object('questionId',zero_question,'selectedOptionIds',jsonb_build_array(zero_option))),
    zero_stamp,'byus:stamp:v1:'||zero_stamp::text,'0x'||repeat('6',64));
  perform pg_temp.assert((zero_result->'response'->>'scorePoints')::integer=0 and (zero_result->'completion'->>'scoreDelta')::integer=0
    and not exists(select 1 from public.fan_score_ledger where activity_id=(zero_result->'response'->>'activityId')::uuid)
    and zero_result->'completion'->'earnedStamp'->>'id'=zero_stamp::text
    and public.get_owned_live_survey(owner,'fan-action-zero','en')->'completion'=zero_result->'completion'
    and public.submit_owned_live_survey(owner,'fan-action-zero','fa150000-0000-4000-8000-000000000074',
      jsonb_build_array(jsonb_build_object('questionId',zero_question,'selectedOptionIds',jsonb_build_array(zero_option))),
      zero_stamp,'byus:stamp:v1:'||zero_stamp::text,'0x'||repeat('6',64))=zero_result,
    'real zero-score survey submit, GET or replay failed');

  insert into public.live_events select (jsonb_populate_record(null::public.live_events,to_jsonb(template_live)||jsonb_build_object(
    'id',live_mission,'slug','fan-action-mission','celebrity_id',creator,'brand_id',brand,
    'starts_at',observed-interval '1 hour','ends_at',observed+interval '1 hour',
    'reservation_opens_at',observed-interval '2 hours','reservation_closes_at',observed-interval '1 hour',
    'attendance_valid_from',observed-interval '2 hours','attendance_valid_until',observed+interval '2 hours',
    'publication_status','draft','published_at',null,'ever_published_at',null,'created_at',observed,'updated_at',observed))).*;
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
    select live_mission,locale,'Fan action mission','Fan action mission','Fan action mission'
    from (values('ko'::public.content_locale),('en'::public.content_locale)) locale(locale);
  update public.live_events set publication_status='published',published_at=observed,ever_published_at=observed where id=live_mission;
  insert into public.fan_action_verified_campaigns(
    binding_id,campaign_id,creator_id,verified_block_number,verified_block_hash,verified_at
  ) values(binding,live_mission,creator,123456,'0x'||repeat('8',64),clock_timestamp());
  insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,
    mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)
    select live_mission,2,activation.policy_version,'published',1,1,0,
      'fa130000-0000-4000-8000-000000000022',observed from public.reward_policy_activation activation where activation.singleton;
  insert into public.live_surveys(id,live_event_id,version,mission_type,legacy_contract,attendance_requirement,visible_from,visible_until)
    values(mission,live_mission,1,'vote',false,'not_required',observed-interval '1 hour',observed+interval '1 day');
  insert into public.live_survey_localizations(survey_id,locale,title,description) values
    (mission,'ko','팬 행동 미션','팬 행동 미션'),(mission,'en','Fan action mission','Fan action mission');
  insert into public.live_survey_questions(id,survey_id,question_type,position) values(mission_question,mission,'single_choice',1);
  insert into public.live_survey_question_localizations(question_id,locale,question_text) values
    (mission_question,'ko','선택'),(mission_question,'en','Choose');
  insert into public.live_survey_options(id,question_id,position) values
    (mission_option,mission_question,1),('fa150000-0000-4000-8000-000000000024',mission_question,2);
  insert into public.live_survey_option_localizations(option_id,locale,label) values
    (mission_option,'ko','A'),(mission_option,'en','A'),
    ('fa150000-0000-4000-8000-000000000024','ko','B'),('fa150000-0000-4000-8000-000000000024','en','B');
  update public.live_surveys set lifecycle_status='published',publication_status='published',published_at=observed,
    ever_published_at=observed where id=mission;
  result:=public.submit_owned_live_mission(owner,mission,'fa150000-0000-4000-8000-000000000032',
    jsonb_build_array(jsonb_build_object('questionId',mission_question,'selectedOptionIds',jsonb_build_array(mission_option))),
    mission_stamp,'byus:stamp:v1:'||mission_stamp::text,'0x'||repeat('2',64));
  perform pg_temp.assert(exists(select 1 from public.stamps where id=mission_stamp and fan_action_outbox_id is not null and blockchain_job_id is null),
    'enabled mission did not use v2');

  insert into public.live_events select (jsonb_populate_record(null::public.live_events,to_jsonb(template_live)||jsonb_build_object(
    'id',live_collectible,'slug','fan-action-collectible','celebrity_id',creator,'brand_id',brand,
    'starts_at',observed-interval '2 hours','ends_at',observed-interval '1 hour',
    'reservation_opens_at',observed-interval '4 hours','reservation_closes_at',observed-interval '3 hours',
    'attendance_valid_from',observed-interval '3 hours','attendance_valid_until',observed,
    'schedule_revision',1,'publication_status','draft','published_at',null,'ever_published_at',null,'created_at',observed,'updated_at',observed))).*;
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
    select live_collectible,locale,'Fan action collectible','Fan action collectible','Fan action collectible'
    from (values('ko'::public.content_locale),('en'::public.content_locale)) locale(locale);
  update public.live_events set publication_status='published',published_at=observed-interval '1 day',ever_published_at=observed-interval '1 day' where id=live_collectible;
  insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,
    mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)
    select live_collectible,2,activation.policy_version,'published',1,1,0,
      'fa130000-0000-4000-8000-000000000023',observed from public.reward_policy_activation activation where activation.singleton;
  select * into strict reward_setting from public.live_reward_setting_revisions
    where live_event_id=live_collectible and lifecycle_status='published' order by revision desc limit 1;
  insert into public.live_journey_requirement_revisions(id,live_event_id,revision,lifecycle_status,require_passport,
    require_reservation,require_attendance,bonus_ticket_amount,reward_setting_revision_id,reward_setting_revision,
    policy_version,actor_app_user_id,actor_admin_allowlist_id,correlation_id,published_at)
    values(requirement,live_collectible,1,'published',true,false,false,0,reward_setting.id,reward_setting.revision,
      reward_setting.policy_version,owner,allowlist,'fa160000-0000-4000-8000-000000000003',observed-interval '1 day');
  insert into public.live_journey_completions(id,app_user_id,live_event_id,requirement_revision_id,requirement_snapshot,
    bonus_ticket_amount,policy_version,reward_setting_revision,reward_setting_revision_id,completed_at)
    values(completion,owner,live_collectible,requirement,'{}',0,reward_setting.policy_version,reward_setting.revision,
      reward_setting.id,observed-interval '30 minutes');
  result:=public.claim_owned_live_collectible(owner,'fan-action-collectible','fa160000-0000-4000-8000-000000000004');
  claim_id:=(result->'claim'->>'id')::uuid;
  perform pg_temp.assert(exists(select 1 from public.live_collectible_claims where id=claim_id
    and fan_action_outbox_id is not null and blockchain_job_id is null),'enabled collectible did not use v2');

  result:=public.post_celebrity_lounge_message(owner,'fan-action-producer','첫 댓글','fa170000-0000-4000-8000-000000000001');
  perform pg_temp.assert(exists(select 1 from public.community_stamps where app_user_id=owner and celebrity_id=creator
    and kind='first_comment' and fan_action_outbox_id is not null and blockchain_job_id is null),
    'enabled first-comment producer did not use v2');
  result:=public.check_in_community_stamp(owner,'fan-action-producer');
  perform pg_temp.assert(exists(select 1 from public.community_stamps where app_user_id=owner and celebrity_id=creator
    and kind='daily_checkin' and fan_action_outbox_id is not null and blockchain_job_id is null),
    'enabled daily-checkin producer did not use v2');
  invite_code:=public.get_community_stamp_invite_code(owner)->>'code';
  result:=public.redeem_community_stamp_invite(invitee,invite_code);
  -- Registration records a pending relationship; the authoritative quiz pass
  -- qualifies it. Preserve the v2 producer assertion after that actual flow.
  perform pg_temp.assert(result->>'state'='registered_pending_fan_verification'
    and exists(select 1 from public.community_stamp_invitation_relations
      where inviter_app_user_id=owner and invitee_app_user_id=invitee and status='pending')
    and not exists(select 1 from public.community_stamps where kind='invite'
      and app_user_id in(owner,invitee)), 'invite registration awarded before fan verification');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key)
    values(invite_attempt,invitee,creator,quiz,1,invite_attempt);
  for source_question in select * from public.celebrity_quiz_questions where quiz_id=quiz order by position loop
    snapshot_q:=extensions.gen_random_uuid();
    insert into public.quiz_attempt_questions(id,attempt_id,quiz_id,source_question_id,position,prompt_ko,prompt_en)
      values(snapshot_q,invite_attempt,quiz,source_question.id,source_question.position,
        source_question.prompt_ko,source_question.prompt_en);
    for source_option in select * from public.celebrity_quiz_options where question_id=source_question.id loop
      snapshot_good:=extensions.gen_random_uuid();
      insert into public.quiz_attempt_options(id,attempt_question_id,source_question_id,source_option_id,position,label_ko,label_en,is_correct)
        values(snapshot_good,snapshot_q,source_question.id,source_option.id,source_option.position,
          source_option.label_ko,source_option.label_en,source_option.is_correct);
      if source_option.is_correct then
        insert into public.quiz_attempt_answers(attempt_id,attempt_question_id,selected_option_id)
          values(invite_attempt,snapshot_q,snapshot_good);
      end if;
    end loop;
  end loop;
  perform public.submit_owned_quiz_attempt(invitee,invite_attempt,invite_stamp,
    'byus:passport:v1:'||invitee::text||':fan-action-producer','0x'||repeat('d',64),
    'byus:stamp:v1:'||invite_stamp::text,'0x'||repeat('e',64));
  perform pg_temp.assert(exists(select 1 from public.community_stamp_invitation_relations
    where inviter_app_user_id=owner and invitee_app_user_id=invitee and status='qualified'),
    'actual quiz submission did not qualify the pending invite');
  perform pg_temp.assert((select count(*) from public.community_stamps where kind='invite'
    and app_user_id in(owner,invitee) and fan_action_outbox_id is not null and blockchain_job_id is null)=2,
    'enabled qualified invite producer did not issue both v2 stamps');

  -- SHARE has verified source evidence but no ActionHub action code. Even while
  -- all mapped routes are enabled, it must retain its canonical legacy job.
  share_link:=public.create_community_stamp_share_link(owner,'fan-action-producer');
  -- 20261215070000: with link-opening payouts off (the default) the opening is recorded and nothing is issued on any lane.
  perform pg_temp.assert((select column_default from information_schema.columns where table_schema='public' and table_name='fan_share_settings' and column_name='visit_payouts')='false', 'share link opening payouts are not off by default');
  update public.fan_share_settings set visit_payouts=false where singleton;
  perform public.visit_community_stamp_share_link(invitee,share_link->>'token');
  perform pg_temp.assert(exists(select 1 from public.fan_share_link_opens o join public.community_stamp_share_links link on link.id=o.share_link_id
      where link.token=share_link->>'token' and o.visitor_app_user_id=invitee)
    and not exists(select 1 from public.community_stamp_share_visits visit join public.community_stamp_share_links link on link.id=visit.share_link_id
      where link.token=share_link->>'token')
    and not exists(select 1 from public.community_stamps where app_user_id=owner and celebrity_id=creator and kind='share'),
    'share link opening paid while payouts are off');
  -- The legacy share lane below is checked with the setting on (this transaction only).
  update public.fan_share_settings set visit_payouts=true where singleton;
  perform public.visit_community_stamp_share_link(invitee,share_link->>'token');
  perform public.visit_community_stamp_share_link(invitee,share_link->>'token');
  perform pg_temp.assert((select count(*) from public.community_stamps
      where app_user_id=owner and celebrity_id=creator and kind='share')=1
      and exists(select 1 from public.community_stamps stamp
        join public.blockchain_jobs job on job.id=stamp.blockchain_job_id
        where stamp.app_user_id=owner and stamp.celebrity_id=creator and stamp.kind='share'
          and stamp.fan_action_outbox_id is null and job.entity_type='community_stamp'
          and job.payload->>'stampKind'='share')
      and not exists(select 1 from public.fan_action_occurrences occurrence
        where occurrence.app_user_id=owner and occurrence.source_namespace='community_stamps'
          and occurrence.canonical_source_key like 'verified-share-visit:%'),
    'verified share did not remain idempotent on the legacy lane');

  perform pg_temp.assert(not exists(select 1 from public.blockchain_jobs job where job.entity_id in
    (passport_stamp,reservation_stamp,attendance_stamp,survey_stamp,mission_stamp,claim_id)),
    'an enabled producer created a legacy job');
  perform pg_temp.assert((select count(distinct (outbox.source_snapshot->>'actionCode')::integer)
    from public.fan_action_occurrences occurrence join public.fan_action_outbox outbox on outbox.occurrence_row_id=occurrence.id
    where occurrence.app_user_id in(owner,invitee) and (outbox.source_snapshot->>'actionCode')::integer between 1 and 11)=11,
    'actual producers did not cover all 11 action codes');
end $$;

do $$
declare item record;definition text;
begin
  for item in select * from (values
    ('public.submit_owned_quiz_attempt(uuid,uuid,uuid,text,text,text,text)'::regprocedure,'fan_action_native_enabled(1,p_app_user_id,attempt_record.celebrity_id)'),
    ('public.reserve_owned_live_event(uuid,uuid,uuid,uuid,text,text)'::regprocedure,'fan_action_native_enabled(2,p_app_user_id,live_record.celebrity_id,live_record.id)'),
    ('public.attend_owned_live_event_before_recurring_live(uuid,text,uuid,text,uuid,text,text)'::regprocedure,'fan_action_native_enabled(3,p_app_user_id,live_record.celebrity_id,live_record.id)'),
    ('public.submit_owned_live_mission(uuid,uuid,uuid,jsonb,uuid,text,text)'::regprocedure,'fan_action_native_enabled(4,p_app_user_id,live_record.celebrity_id,mission.live_event_id)'),
    ('public.submit_owned_live_survey(uuid,text,uuid,jsonb,uuid,text,text)'::regprocedure,'fan_action_native_enabled(5,p_app_user_id,response_record.celebrity_id,response_record.live_event_id)'),
    ('public.react_to_creator(uuid,uuid,uuid,uuid,text)'::regprocedure,'fan_action_native_enabled(6,p_app_user_id,p_celebrity_id)'),
    ('public.claim_owned_live_collectible(uuid,text,uuid)'::regprocedure,'fan_action_native_enabled(11,p_app_user_id)')
  ) v(signature,marker) loop
    definition:=pg_temp.producer_definition(item.signature);
    perform pg_temp.assert(position(item.marker in definition)>0,item.signature::text||' is missing its v2 branch');
  end loop;
  definition:=pg_temp.producer_definition('public.attend_owned_live_event(uuid,text,uuid,text,uuid,text,text)'::regprocedure);
  perform pg_temp.assert(
    (length(definition)-length(replace(definition,'public.attend_owned_live_event_before_recurring_live(','')))
      / length('public.attend_owned_live_event_before_recurring_live(')=1,
    'recurring LIVE attendance wrapper no longer delegates exactly once to the patched producer');
  definition:=pg_temp.producer_definition('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
  perform pg_temp.assert(position('fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id)' in definition)>0,
    'community producer is missing action codes 7-10 branch');
  perform pg_temp.assert(position('v_action_code is not null and' in definition)>0
      and position('p_kind in (''subscription'',''support'')' in definition)>0,
    'community producer did not preserve unmapped share on the legacy lane');
  perform pg_temp.assert(not has_function_privilege('anon','public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)','execute')
    and not has_function_privilege('authenticated','public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)','execute')
    and not has_function_privilege('service_role','public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)','execute'),
    'internal enqueue helper is executable by an API role');
end $$;

rollback;
