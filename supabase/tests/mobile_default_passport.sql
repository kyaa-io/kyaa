-- Run after 20261112000000_mobile_default_passport.sql on a disposable DB.
begin;
do $$ declare
  owner constant uuid:='7d120000-0000-4000-8000-000000000001';
  invitee constant uuid:='7d120000-0000-4000-8000-000000000002';
  stranger constant uuid:='7d120000-0000-4000-8000-000000000003';
  celebrity constant uuid:='7d120000-0000-4000-8000-000000000010';
  quiz constant uuid:='7d120000-0000-4000-8000-000000000011';
  attempt constant uuid:='7d120000-0000-4000-8000-000000000012';
  quiz_pass constant uuid:='7d120000-0000-4000-8000-000000000013';
  friendship constant uuid:='7d120000-0000-4000-8000-000000000014';
  default_id uuid; repeated_id uuid; fan_passport_id uuid; share_token text;
  invite_code text; result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email,created_at) values
    (owner,'did:privy:default-passport-owner','default-passport-owner@example.test','2026-09-01T00:00:00Z'),
    (invitee,'did:privy:default-passport-invitee','default-passport-invitee@example.test','2026-09-02T00:00:00Z'),
    (stranger,'did:privy:default-passport-stranger','default-passport-stranger@example.test','2026-09-03T00:00:00Z');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)
    values(owner,'별빛산책','별빛산책'),(invitee,'초대팬','초대팬');
  insert into public.user_wallets(app_user_id,chain_id,address) values
    (owner,91342,'0x7d12000000004000800000000000000100000000'),
    (invitee,91342,'0x7d12000000004000800000000000000200000000');

  select id into strict default_id from public.mobile_default_passports where app_user_id=owner;
  if (select issued_at from public.mobile_default_passports where id=default_id)<>'2026-09-01T00:00:00Z'::timestamptz
    or (select count(*) from public.mobile_default_passports where app_user_id=owner)<>1 then
    raise exception 'signup did not issue exactly one default passport at account creation';
  end if;
  repeated_id:=public.ensure_mobile_default_passport(owner);
  if repeated_id<>default_id or (select count(*) from public.mobile_default_passports where app_user_id=owner)<>1 then
    raise exception 'default passport provisioning is not idempotent';
  end if;
  if exists(select 1 from public.community_stamps where app_user_id in(owner,invitee,stranger) and kind='invite')
    or exists(select 1 from public.fan_passports where app_user_id in(owner,invitee,stranger)) then
    raise exception 'default passport issuance created an invite reward or fan certification';
  end if;

  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(celebrity,'default-passport-test','draft','/default-passport-test.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (celebrity,'ko','기본 패스포트 테스트','기본 패스포트 테스트','기본 패스포트 테스트'),
    (celebrity,'en','Default passport test','Default passport test','Default passport test');
  update public.celebrities set status='published',published_at=clock_timestamp() where id=celebrity;
  insert into public.social_friendships(id,requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,created_at,accepted_at)
    values(friendship,owner,invitee,celebrity,'accepted',friendship,'friend-ledger','2026-09-11T00:00:00Z','2026-09-12T00:00:00Z');
  insert into public.celebrity_quizzes(id,celebrity_id,version,status) values(quiz,celebrity,1,'draft');
  invite_code:=public.get_community_stamp_invite_code(owner)->>'code';
  perform public.redeem_community_stamp_invite(invitee,invite_code);
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(attempt,invitee,celebrity,quiz,1,attempt,'passed',3,'2026-10-05T00:00:00Z');
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(quiz_pass,invitee,celebrity,attempt);
  fan_passport_id:='7d120000-0000-4000-8000-000000000015';
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values('7d120000-0000-4000-8000-000000000016','passport',fan_passport_id,
      'mobile-default-passport-share-fixture','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at)
    values(fan_passport_id,invitee,celebrity,quiz_pass,
      '7d120000-0000-4000-8000-000000000016','2026-10-05T00:00:00Z');
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
  result:=public.create_mobile_passport_share_link(invitee,fan_passport_id,false,false);
  share_token:=result->>'token';
  if share_token!~'^[a-f0-9]{32}$'
    or (select include_nickname or include_public_stamps from public.community_stamp_share_links where token=share_token)
    or public.read_shared_passport_activity(share_token) ?| array['ownerNickname','stampCount'] then
    raise exception 'private mobile share exposed excluded fields';
  end if;
  result:=public.create_mobile_passport_share_link(invitee,fan_passport_id,true,true);
  if result->>'token'=share_token
    or public.read_shared_passport_activity(result->>'token')->>'ownerNickname'<>'초대팬'
    or public.read_shared_passport_activity(result->>'token')->>'stampCount'<>'0'
    or (select visibility_mode from public.community_stamp_share_links where token=result->>'token')<>'explicit_public' then
    raise exception 'mobile share visibility variants were not isolated';
  end if;
  if public.create_mobile_passport_share_link(invitee,fan_passport_id,true,true)<>result then
    raise exception 'mobile share visibility variant is not idempotent';
  end if;
  begin
    insert into public.mobile_passport_public_stamps(
      fan_passport_id,app_user_id,celebrity_id,stamp_source,stamp_id
    ) values(
      fan_passport_id,invitee,celebrity,'stamp','7d120000-0000-4000-8000-000000000099'
    );
    raise exception 'phantom public stamp was accepted';
  exception when others then
    if sqlerrm='phantom public stamp was accepted' then raise;end if;
  end;
  insert into public.fan_activities(
    id,app_user_id,celebrity_id,activity_type,source_type,source_id,occurred_at
  ) values(
    '7d120000-0000-4000-8000-000000000017',invitee,celebrity,
    'knowledge','quiz_pass',quiz_pass,'2026-10-05T01:00:00Z'
  );
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
  values(
    '7d120000-0000-4000-8000-000000000019','stamp',
    '7d120000-0000-4000-8000-000000000018',
    'byus:stamp:v1:7d120000-0000-4000-8000-000000000018',
    jsonb_build_object(
      'recipient','0x7d12000000004000800000000000000200000000',
      'celebritySlug','default-passport-test',
      'issuanceId','0x'||repeat('1',64),
      'stampType','Knowledge'
    )
  );
  insert into public.stamps(
    id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,
    blockchain_job_id,issued_at
  ) values(
    '7d120000-0000-4000-8000-000000000018',invitee,celebrity,
    fan_passport_id,'7d120000-0000-4000-8000-000000000017','knowledge',
    '7d120000-0000-4000-8000-000000000019','2026-10-05T01:00:00Z'
  );
  insert into public.mobile_passport_public_stamps(
    fan_passport_id,app_user_id,celebrity_id,stamp_source,stamp_id
  ) values(
    fan_passport_id,invitee,celebrity,'stamp','7d120000-0000-4000-8000-000000000018'
  );
  if public.read_shared_passport_activity(result->>'token')->>'stampCount'<>'1'
    or public.read_owned_mobile_passport_public_stamp_count(invitee,fan_passport_id)<>1 then
    raise exception 'explicit public stamp projection was not used';
  end if;
  delete from public.stamps where id='7d120000-0000-4000-8000-000000000018';
  if public.read_shared_passport_activity(result->>'token')->>'stampCount'<>'0'
    or public.read_owned_mobile_passport_public_stamp_count(invitee,fan_passport_id)<>0 then
    raise exception 'deleted public stamp remained in the projection';
  end if;
  begin
    perform public.create_mobile_passport_share_link(stranger,fan_passport_id,true,true);
    raise exception 'another owner shared the passport';
  exception when others then
    if sqlerrm='another owner shared the passport' then raise;end if;
  end;

  result:=public.read_owned_mobile_passports(owner,'ko');
  if jsonb_array_length(result->'passports')<>1
    or result#>>'{passports,0,id}'<>default_id::text
    or result#>>'{passports,0,kind}'<>'default'
    or result#>>'{passports,0,stampCount}'<>'2'
    or result#>'{passports,0}' ?| array['favorite','fanXp','fanTier','progress'] then
    raise exception 'default list projection changed fan passport semantics: %',result;
  end if;

  result:=public.read_owned_mobile_default_passport(owner,default_id,'ko');
  if result->>'ownerNickname'<>'별빛산책'
    or result->>'passportNumber'!~'^BU [0-9]{6,}$'
    or jsonb_array_length(result->'stamps')<>2
    or not exists(select 1 from jsonb_array_elements(result->'stamps') stamp where stamp->>'id'=friendship::text and stamp->>'kind'='friend')
    or not exists(select 1 from jsonb_array_elements(result->'stamps') stamp where stamp->>'kind'='invite') then
    raise exception 'default detail did not project real friend and invite ledgers: %',result;
  end if;
  if public.read_owned_mobile_default_passport(stranger,default_id,'ko') is not null then
    raise exception 'another owner read the default passport';
  end if;
  if has_table_privilege('service_role','public.mobile_default_passports','select')
    or has_function_privilege('authenticated','public.read_owned_mobile_default_passport(uuid,uuid,public.content_locale)','execute')
    or has_function_privilege('authenticated','public.create_mobile_passport_share_link(uuid,uuid,boolean,boolean)','execute') then
    raise exception 'default passport bypasses its owner RPC boundary';
  end if;

  insert into public.account_deletion_requests(app_user_id,provider_subject)
    values(owner,'did:privy:default-passport-owner');
  update public.app_users set status='disabled' where id=owner;
  if exists(select 1 from public.mobile_default_passports where app_user_id=owner) then
    raise exception 'account deletion did not remove the default passport';
  end if;
  begin
    perform public.read_owned_mobile_default_passport(owner,default_id,'ko');
    raise exception 'disabled owner retained default passport access';
  exception when others then
    if sqlerrm='disabled owner retained default passport access' then raise; end if;
  end;
end $$;
rollback;
select 'Mobile default passport lifecycle, owner scope, and real ledger projection PASS' as result;
