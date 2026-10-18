-- Run after 20261109000000_mobile_invitation_overview.sql on a disposable DB.
begin;
do $$ declare
  inviter constant uuid:='79100000-0000-4000-8000-000000000001';
  pending_user constant uuid:='79100000-0000-4000-8000-000000000002';
  qualified_user constant uuid:='79100000-0000-4000-8000-000000000003';
  other_user constant uuid:='79100000-0000-4000-8000-000000000004';
  celebrity constant uuid:='79100000-0000-4000-8000-000000000010';
  quiz constant uuid:='79100000-0000-4000-8000-000000000011';
  attempt constant uuid:='79100000-0000-4000-8000-000000000012';
  quiz_pass constant uuid:='79100000-0000-4000-8000-000000000013';
  invite_code text;overview jsonb;entry jsonb;paid_before bigint;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (inviter,'did:privy:invitation-overview-test-inviter','invitation-overview-test-inviter@example.test'),
    (pending_user,'did:privy:invitation-overview-test-pending','invitation-overview-test-pending@example.test'),
    (qualified_user,'did:privy:invitation-overview-test-qualified','invitation-overview-test-qualified@example.test'),
    (other_user,'did:privy:invitation-overview-test-other','invitation-overview-test-other@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
  select fixture.id,91342,'0x'||replace(fixture.id::text,'-','')||'00000000','privy','embedded'
  from (values(inviter),(pending_user),(qualified_user)) fixture(id);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(celebrity,'invitation-overview-test','draft','/invitation-overview-test.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (celebrity,'ko','초대 현황 테스트','초대 현황 테스트','초대 현황 테스트'),
    (celebrity,'en','Invitation overview test','Invitation overview test','Invitation overview test');
  update public.celebrities set status='published',published_at=clock_timestamp()
    where id=celebrity;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)
    values(quiz,celebrity,1,'draft',null);

  invite_code:=public.get_community_stamp_invite_code(inviter)->>'code';
  perform public.redeem_community_stamp_invite(pending_user,invite_code);
  perform public.redeem_community_stamp_invite(qualified_user,invite_code);
  insert into public.quiz_attempts(
    id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  values(attempt,qualified_user,celebrity,quiz,1,attempt,'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(quiz_pass,qualified_user,celebrity,attempt);
  select count(*) into paid_before from public.community_stamps
    where app_user_id in(inviter,qualified_user) and kind='invite';

  overview:=public.get_community_stamp_invitation_overview(inviter);
  if overview->>'registeredCount'<>'2' or overview->>'pendingCount'<>'1'
    or overview->>'qualifiedCount'<>'1' or jsonb_array_length(overview->'history')<>2 then
    raise exception 'owner invitation overview is incorrect: %',overview;
  end if;
  for entry in select value from jsonb_array_elements(overview->'history') loop
    if entry ?| array['inviteeAppUserId','nickname','email','phone','contact'] then
      raise exception 'owner overview exposed invitee identity: %',entry;
    end if;
  end loop;
  overview:=public.get_community_stamp_invitation_overview(other_user);
  if overview->>'registeredCount'<>'0' or jsonb_array_length(overview->'history')<>0 then
    raise exception 'another owner received relationship history: %',overview;
  end if;
  if (select count(*) from public.community_stamps
      where app_user_id in(inviter,qualified_user) and kind='invite')<>paid_before then
    raise exception 'reading invitation overview changed paid Stamps';
  end if;
  if has_function_privilege('authenticated',
      'public.get_community_stamp_invitation_overview(uuid)','execute')
    or has_table_privilege('service_role','public.community_stamp_invitation_relations','select') then
    raise exception 'invitation history bypasses owner API boundary';
  end if;
end $$;
rollback;
select 'Mobile invitation overview owner scope and privacy PASS' as result;
