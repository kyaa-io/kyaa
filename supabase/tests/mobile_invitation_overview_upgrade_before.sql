do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Invitation overview upgrade tests require disposable local byus_clean';
  end if;
end $$;
begin;
do $$ declare
  inviter constant uuid:='79000000-0000-4000-8000-000000000001';
  pending_user constant uuid:='79000000-0000-4000-8000-000000000002';
  qualified_user constant uuid:='79000000-0000-4000-8000-000000000003';
  other_user constant uuid:='79000000-0000-4000-8000-000000000004';
  celebrity constant uuid:='79000000-0000-4000-8000-000000000010';
  quiz constant uuid:='79000000-0000-4000-8000-000000000011';
  attempt constant uuid:='79000000-0000-4000-8000-000000000012';
  quiz_pass constant uuid:='79000000-0000-4000-8000-000000000013';
  invite_code text;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (inviter,'did:privy:invitation-overview-inviter','invitation-overview-inviter@example.test'),
    (pending_user,'did:privy:invitation-overview-pending','invitation-overview-pending@example.test'),
    (qualified_user,'did:privy:invitation-overview-qualified','invitation-overview-qualified@example.test'),
    (other_user,'did:privy:invitation-overview-other','invitation-overview-other@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
  select fixture.id,91342,'0x'||replace(fixture.id::text,'-','')||'00000000','privy','embedded'
  from (values(inviter),(pending_user),(qualified_user)) fixture(id);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(celebrity,'invitation-overview-upgrade','draft','/invitation-overview.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (celebrity,'ko','초대 현황 업그레이드','초대 현황 업그레이드','초대 현황 업그레이드'),
    (celebrity,'en','Invitation overview upgrade','Invitation overview upgrade','Invitation overview upgrade');
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

  create table public.invitation_overview_upgrade_snapshot as
  select inviter inviter_id,other_user other_id,
    (select count(*) from public.community_stamps
      where app_user_id in(inviter,qualified_user) and kind='invite') paid_stamp_count,
    (select count(*) from public.community_stamp_invitation_relations
      where inviter_app_user_id=inviter) relation_count;
end $$;
commit;
