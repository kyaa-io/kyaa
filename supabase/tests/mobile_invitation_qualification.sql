-- Run after 20261011220000_mobile_invitation_qualification.sql.
-- Production has no reward config; this transaction adds an internal fixture.
begin;

create function pg_temp.expect_error(statement text,expected text)
returns void language plpgsql as $$
declare caught boolean:=false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then
      raise exception 'Unexpected error %, wanted %',sqlerrm,expected;
    end if;
    caught:=true;
  end;
  if not caught then raise exception 'Expected error was not raised: %',expected; end if;
end $$;

do $$
declare
  creator uuid:='1a110000-0000-4000-8000-000000000001';
  quiz uuid:='1a110000-0000-4000-8000-000000000002';
  inviter uuid:='1a110000-0000-4000-8000-000000000010';
  invitee uuid;
  attempt_id uuid;
  pass_id uuid;
  invite_code text;
  result jsonb;
  relation_id uuid;
  legacy_invitee uuid:='1a110000-0000-4000-8000-000000000080';
  legacy_redemption uuid:='1a110000-0000-4000-8000-000000000081';
  late_invitee uuid:='1a110000-0000-4000-8000-000000000090';
  pending_invitee uuid:='1a110000-0000-4000-8000-000000000091';
  deleted_inviter uuid:='1a110000-0000-4000-8000-000000000092';
  deletion_invitee uuid:='1a110000-0000-4000-8000-000000000093';
  deleted_code text;
  content_admin uuid:='1a110000-0000-4000-8000-000000000094';
  content_allowlist uuid:='1a110000-0000-4000-8000-000000000095';
  content_post uuid:='1a110000-0000-4000-8000-000000000096';
  content_asset uuid:='1a110000-0000-4000-8000-000000000097';
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'invitation-qualification-qa','published','/qa.webp',now(),'{artist}','idol');
  insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)
    values(quiz,creator,1,'draft',null);
  insert into public.app_users(id,privy_user_id,verified_email)
    values(inviter,'did:privy:invitation-inviter','invitation-inviter@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(inviter,91342,'0x'||replace(inviter::text,'-','')||'00000000','privy','embedded');
  invite_code:=public.get_community_stamp_invite_code(inviter)->>'code';

  for ordinal in 1..11 loop
    invitee:=('1a110000-0000-4000-8000-'||lpad((100+ordinal)::text,12,'0'))::uuid;
    insert into public.app_users(id,privy_user_id,verified_email) values(
      invitee,'did:privy:invitation-'||ordinal,'invitation-'||ordinal||'@example.test');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values(invitee,91342,'0x'||replace(invitee::text,'-','')||'00000000','privy','embedded');
    result:=public.redeem_community_stamp_invite(invitee,invite_code);
    if result->>'state'<>'registered_pending_fan_verification' then
      raise exception 'registration % did not enter pending state: %',ordinal,result;
    end if;
    if exists(select 1 from public.community_stamps
        where app_user_id=invitee and kind='invite') then
      raise exception 'registration % awarded from signup or base Passport state',ordinal;
    end if;
    if public.redeem_community_stamp_invite(invitee,invite_code)->>'state'
        <>'pending_fan_verification' then
      raise exception 'registration replay % was not idempotent',ordinal;
    end if;
  end loop;
  if (select count(*) from public.community_stamp_invitation_relations
      where inviter_app_user_id=inviter)<>11 then
    raise exception 'duplicate registration changed relationship count';
  end if;

  for ordinal in 1..10 loop
    invitee:=('1a110000-0000-4000-8000-'||lpad((100+ordinal)::text,12,'0'))::uuid;
    attempt_id:=('1a110000-0000-4000-8001-'||lpad(ordinal::text,12,'0'))::uuid;
    pass_id:=('1a110000-0000-4000-8002-'||lpad(ordinal::text,12,'0'))::uuid;
    insert into public.quiz_attempts(
      id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(attempt_id,invitee,creator,quiz,1,attempt_id,'passed',3,now());
    insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
      values(pass_id,invitee,creator,attempt_id);
    if (select status from public.community_stamp_invitation_relations
        where invitee_app_user_id=invitee)<>'qualified' then
      raise exception 'first fan verification % did not qualify',ordinal;
    end if;
    if (select count(*) from public.community_stamps
        where kind='invite' and app_user_id in (inviter,invitee))
        <>ordinal+1 then
      raise exception 'invite Stamp count is wrong at qualification %',ordinal;
    end if;
  end loop;
  if (select count(*) from public.community_stamps
      where app_user_id=inviter and kind='invite')<>10 then
    raise exception 'inviter did not receive one Stamp per qualified relationship';
  end if;
  result:=public.get_owned_community_stamps(inviter,null);
  if (select count(*) from jsonb_array_elements(result->'stamps') stamp
      where stamp->>'kind'='invite')<>1 then
    raise exception 'MY projection did not preserve the single Invite achievement card: %',result;
  end if;
  if (select count(*) from public.community_stamp_invitation_relations
      where inviter_app_user_id=inviter and status='qualified')<>10 then
    raise exception 'qualified count did not stop at ten';
  end if;
  if (select count(*) from public.community_stamp_invitation_milestones
      where inviter_app_user_id=inviter and milestone_number=1
        and qualified_count=10 and status='pending_configuration')<>1 then
    raise exception 'tenth qualification did not create one pending milestone';
  end if;
  result:=public.get_mobile_social_stamp_collection(inviter);
  if result#>>'{invitation,count}'<>'10'
    or result#>>'{invitation,nextThreshold}'<>'20'
    or result#>>'{invitation,remaining}'<>'10'
    or not exists(
      select 1 from jsonb_array_elements(result#>'{invitation,milestones}') item
      where item->>'threshold'='1' and item->>'status'='earned'
    )
    or not exists(
      select 1 from jsonb_array_elements(result#>'{invitation,milestones}') item
      where item->>'threshold'='10' and item->>'status'='pending_configuration'
    )
    or jsonb_array_length(result#>'{invitation,content}')<>0 then
    raise exception 'social collection did not distinguish earned and pending invitation milestones: %',result;
  end if;

  insert into public.app_users(id,privy_user_id,verified_email)
  values(content_admin,'did:privy:invitation-content-admin','invitation-content-admin@example.test');
  insert into public.admin_allowlist(id,email,role,active)
  values(content_allowlist,'invitation-content-admin@example.test','operator',true);
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)
  values(content_post,creator,'1a110000-0000-4000-8000-000000000101',
    '첫 공연에서 함께 만든 응원 순간','public',content_post,repeat('a',64));
  insert into public.content_assets(
    id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,
    uploaded_at,upload_settled_at,post_id,position
  ) values(content_asset,'1a110000-0000-4000-8000-000000000101',creator,
    'invitation-content/fixture.webp',1024,1200,800,repeat('b',64),
    pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp(),content_post,0);
  result:=public.create_admin_community_stamp_invitation_content(
    content_admin,content_allowlist,10,content_post,
    pg_catalog.clock_timestamp()-interval '1 second',
    '첫 초대 마일스톤 콘텐츠를 연결합니다.','1a110000-0000-4000-8000-000000000098');
  if result->>'configVersion'<>'1'
    or (select count(*) from public.audit_logs
      where action='community_stamp.invitation_content.created'
        and correlation_id='1a110000-0000-4000-8000-000000000098')<>1 then
    raise exception 'operator mapping was not versioned and audited: %',result;
  end if;
  perform public.create_admin_community_stamp_invitation_content(
    content_admin,content_allowlist,20,content_post,
    pg_catalog.clock_timestamp()-interval '1 second',
    '다음 초대 마일스톤 콘텐츠를 연결합니다.','1a110000-0000-4000-8000-000000000099');
  result:=public.get_mobile_social_stamp_collection(inviter);
  if jsonb_array_length(result#>'{invitation,content}')<>2
    or result#>>'{invitation,content,0,linkUrl}'<>'/c/invitation-qualification-qa/community/'||content_post::text
    or result#>>'{invitation,content,0,imageUrl}'<>'/api/content-assets/'||content_asset::text
    or result#>>'{invitation,content,0,title}'<>'첫 공연에서 함께 만든 응원 순간' then
    raise exception 'configured invitation content was not projected: %',result;
  end if;
  update public.fan_posts set hidden_at=pg_catalog.clock_timestamp(),
    hidden_by_admin_id=content_allowlist,hide_reason='현재 공개 상태 재검증 테스트'
  where id=content_post;
  result:=public.get_mobile_social_stamp_collection(inviter);
  if jsonb_array_length(result#>'{invitation,content}')<>0 then
    raise exception 'hidden invitation content remained visible: %',result;
  end if;
  invitee:='1a110000-0000-4000-8000-000000000101';
  insert into public.social_friendships(
    id,requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,
    created_at,accepted_at
  ) values(
    '1a110000-0000-4000-8003-000000000001',inviter,invitee,creator,
    'accepted','1a110000-0000-4000-8003-000000000001','friend-one',
    '2026-03-11T00:00:00Z','2026-03-12T00:00:00Z'
  );
  update public.social_friendships set status='unfriended',ended_at='2026-04-01T00:00:00Z'
  where id='1a110000-0000-4000-8003-000000000001';
  insert into public.social_friendships(
    id,requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,
    created_at,accepted_at
  ) values(
    '1a110000-0000-4000-8003-000000000002',inviter,invitee,creator,
    'accepted','1a110000-0000-4000-8003-000000000002','friend-again',
    '2026-04-02T00:00:00Z','2026-04-03T00:00:00Z'
  );
  insert into public.mobile_participation_events(
    id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,
    title_ko,title_en,summary_ko,summary_en
  ) values(
    '1a110000-0000-4000-8004-000000000001','friend-shared-event',creator,
    'concert','friend-content-v1','ended','2026-09-18T09:00:00Z',
    '2026-09-18T12:00:00Z','함께한 첫 공연','Our first concert together','',''
  );
  insert into public.mobile_participation_checkins(
    id,event_id,app_user_id,status,source,policy_version,confirmed_at
  ) values
    ('1a110000-0000-4000-8004-000000000002',
      '1a110000-0000-4000-8004-000000000001',inviter,'valid','staff',
      'friend-content-v1','2026-09-18T09:30:00Z'),
    ('1a110000-0000-4000-8004-000000000003',
      '1a110000-0000-4000-8004-000000000001',invitee,'valid','staff',
      'friend-content-v1','2026-09-18T09:31:00Z');
  result:=public.get_mobile_social_stamp_collection(inviter);
  if result#>>'{friendship,count}'<>'1'
    or result#>>'{friendship,nextThreshold}'<>'10'
    or jsonb_array_length(result#>'{friendship,milestones}')<>1
    or (result#>>'{friendship,milestones,0,achievedAt}')::timestamptz
      <>'2026-03-12T00:00:00Z'::timestamptz
    or jsonb_array_length(result#>'{friendship,content}')<>1
    or result#>>'{friendship,content,0,imageUrl}'<>'/qa.webp'
    or result#>>'{friendship,content,0,title}'<>'함께한 첫 공연' then
    raise exception 'friend milestone or shared activity projection is wrong: %',result;
  end if;
  insert into public.user_blocks(app_user_id,blocked_app_user_id)
  values(invitee,inviter);
  result:=public.get_mobile_social_stamp_collection(inviter);
  if result#>>'{friendship,count}'<>'0'
    or jsonb_array_length(result#>'{friendship,content}')<>0 then
    raise exception 'blocked counterpart remained in the social collection: %',result;
  end if;
  delete from public.user_blocks
  where app_user_id=invitee and blocked_app_user_id=inviter;
  if exists(select 1 from public.fan_ticket_ledger
      where app_user_id=inviter and source_type='invitation_milestone') then
    raise exception 'unset production quantity invented a ticket reward';
  end if;

  -- Internal-only reward fixture. Production intentionally inserts no row.
  insert into public.community_stamp_invitation_reward_configs(
    invitation_policy_version,config_version,celebrity_id,ticket_amount,
    reward_policy_version,effective_at)
  values(1,1,creator,7,2,pg_catalog.clock_timestamp()-interval '1 second');
  result:=public.process_community_stamp_invitation_milestone(inviter,1);
  if result->>'state'<>'qualified_reward_issued'
    or (select count(*) from public.fan_ticket_ledger where app_user_id=inviter
      and source_type='invitation_milestone' and amount=7)<>1 then
    raise exception 'configured milestone was not awarded exactly once: %',result;
  end if;
  result:=public.get_mobile_social_stamp_collection(inviter);
  if not exists(
    select 1 from jsonb_array_elements(result#>'{invitation,milestones}') item
    where item->>'threshold'='10' and item->>'status'='awarded'
  ) then
    raise exception 'awarded invitation milestone was not projected: %',result;
  end if;
  result:=public.process_community_stamp_invitation_milestone(inviter,1);
  if result->>'replayed'<>'true'
    or (select count(*) from public.fan_ticket_ledger where app_user_id=inviter
      and source_type='invitation_milestone')<>1 then
    raise exception 'milestone replay duplicated reward: %',result;
  end if;

  invitee:='1a110000-0000-4000-8000-000000000111';
  attempt_id:='1a110000-0000-4000-8001-000000000011';
  pass_id:='1a110000-0000-4000-8002-000000000011';
  insert into public.quiz_attempts(
    id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  values(attempt_id,invitee,creator,quiz,1,attempt_id,'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(pass_id,invitee,creator,attempt_id);
  if (select count(*) from public.community_stamps
      where app_user_id=inviter and kind='invite')<>11 then
    raise exception 'eleventh qualification did not award its inviter Stamp';
  end if;
  if exists(select 1 from public.community_stamp_invitation_milestones
      where inviter_app_user_id=inviter and milestone_number=2) then
    raise exception 'eleventh qualification crossed the next boundary';
  end if;
  -- A second real certification cannot re-qualify the relationship.
  if (select qualified_sequence from public.community_stamp_invitation_relations
      where invitee_app_user_id=invitee)<>11 then
    raise exception 'qualification sequence changed unexpectedly';
  end if;

  insert into public.app_users(id,privy_user_id,verified_email)
    values(late_invitee,'did:privy:invitation-late','invitation-late@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(late_invitee,91342,'0x'||replace(late_invitee::text,'-','')||'00000000','privy','embedded');
  attempt_id:='1a110000-0000-4000-8001-000000000090';
  pass_id:='1a110000-0000-4000-8002-000000000090';
  insert into public.quiz_attempts(
    id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  values(attempt_id,late_invitee,creator,quiz,1,attempt_id,'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(pass_id,late_invitee,creator,attempt_id);
  perform pg_temp.expect_error(format(
    'select public.redeem_community_stamp_invite(%L,%L)',late_invitee,invite_code),
    'COMMUNITY_STAMP_INVITE_INELIGIBLE');

  insert into public.app_users(id,privy_user_id,verified_email)
    values(pending_invitee,'did:privy:invitation-pending','invitation-pending@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(pending_invitee,91342,'0x'||replace(pending_invitee::text,'-','')||'00000000','privy','embedded');
  perform public.redeem_community_stamp_invite(pending_invitee,invite_code);
  select redemption_id into relation_id from public.community_stamp_invitation_relations
    where invitee_app_user_id=pending_invitee;
  perform pg_temp.expect_error(format(
    'select public.issue_community_stamp(%L,null,%L::public.community_stamp_kind,%L)',
    pending_invitee,'invite','invite:'||relation_id::text||':invitee'),
    'COMMUNITY_STAMP_INVITE_NOT_QUALIFIED');

  -- The common account-deletion lock wins before qualification. A deleted
  -- inviter cancels only the pending relation and never blocks the invitee's
  -- real certification.
  insert into public.app_users(id,privy_user_id,verified_email) values
    (deleted_inviter,'did:privy:invitation-deleted-inviter','deleted-inviter@example.test'),
    (deletion_invitee,'did:privy:invitation-deletion-invitee','deletion-invitee@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values
    (deleted_inviter,91342,'0x'||replace(deleted_inviter::text,'-','')||'00000000','privy','embedded'),
    (deletion_invitee,91342,'0x'||replace(deletion_invitee::text,'-','')||'00000000','privy','embedded');
  deleted_code:=public.get_community_stamp_invite_code(deleted_inviter)->>'code';
  perform public.redeem_community_stamp_invite(deletion_invitee,deleted_code);
  perform public.begin_owned_account_deletion('did:privy:invitation-deleted-inviter');
  attempt_id:='1a110000-0000-4000-8001-000000000093';
  pass_id:='1a110000-0000-4000-8002-000000000093';
  insert into public.quiz_attempts(
    id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  values(attempt_id,deletion_invitee,creator,quiz,1,attempt_id,'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(pass_id,deletion_invitee,creator,attempt_id);
  if (select status from public.community_stamp_invitation_relations
      where invitee_app_user_id=deletion_invitee)<>'cancelled'
    or exists(select 1 from public.community_stamps
      where kind='invite' and app_user_id=deletion_invitee) then
    raise exception 'account deletion did not cancel the pending relationship safely';
  end if;

  -- A pre-policy redemption and its paid Stamp stay outside the new relation
  -- and are never re-awarded.
  insert into public.app_users(id,privy_user_id,verified_email)
    values(legacy_invitee,'did:privy:invitation-legacy','invitation-legacy@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(legacy_invitee,91342,'0x'||replace(legacy_invitee::text,'-','')||'00000000','privy','embedded');
  insert into public.community_stamp_invite_redemptions(
    id,inviter_app_user_id,invitee_app_user_id,invite_code,redeemed_at)
  values(legacy_redemption,inviter,legacy_invitee,invite_code,
    (select effective_at-interval '1 second'
      from public.community_stamp_invitation_policy_versions where version=1));
  perform public.issue_community_stamp(legacy_invitee,null,'invite',
    'invite:'||legacy_redemption::text||':invitee');
  if exists(select 1 from public.community_stamp_invitation_relations
      where redemption_id=legacy_redemption)
    or public.get_community_stamp_invite_code(legacy_invitee)->>'redemptionState'
      <>'qualified_reward_issued' then
    raise exception 'legacy redemption was backfilled or lost paid state';
  end if;

  if has_table_privilege('service_role','public.community_stamp_invitation_relations','SELECT')
    or has_table_privilege('authenticated','public.community_stamp_invitation_reward_configs','SELECT')
    or has_function_privilege('authenticated',
      'public.process_community_stamp_invitation_milestone(uuid,bigint)','EXECUTE') then
    raise exception 'invitation qualification internals are exposed';
  end if;
end $$;

rollback;
select 'Mobile invitation qualification, milestone and replay PASS' as result;
