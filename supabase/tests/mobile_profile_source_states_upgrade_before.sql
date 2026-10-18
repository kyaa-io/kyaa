do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Mobile profile source-state upgrade tests require disposable local byus_clean';
  end if;
end $$;

do $$ declare
  owner constant uuid:='7d130000-0000-4000-8000-000000000001';
  favorite constant uuid:='7d130000-0000-4000-8000-000000000002';
  quiz constant uuid:='7d130000-0000-4000-8000-000000000003';
  attempt constant uuid:='7d130000-0000-4000-8000-000000000004';
  quiz_pass constant uuid:='7d130000-0000-4000-8000-000000000005';
  passport constant uuid:='7d130000-0000-4000-8000-000000000006';
  passport_job constant uuid:='7d130000-0000-4000-8000-000000000007';
  brand constant uuid:='7d130000-0000-4000-8000-000000000008';
  live constant uuid:='7d130000-0000-4000-8000-000000000009';
  reservation constant uuid:='7d130000-0000-4000-8000-000000000010';
  activity constant uuid:='7d130000-0000-4000-8000-000000000011';
  stamp constant uuid:='7d130000-0000-4000-8000-000000000012';
  stamp_job constant uuid:='7d130000-0000-4000-8000-000000000013';
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    values(owner,'did:privy:profile-source-upgrade','profile-source-upgrade@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address)
    values(owner,91342,'0x1313131313131313131313131313131313131313');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(favorite,'profile-source-upgrade','draft','/profile-source-upgrade.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (favorite,'ko','소스 상태 업그레이드','업그레이드 검증','최애 이미지'),
    (favorite,'en','Source state upgrade','Upgrade proof','Favorite image');
  update public.celebrities set status='published',published_at='2026-09-01T00:00:00Z'
    where id=favorite;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)
    values(quiz,favorite,1,'draft');
  insert into public.quiz_attempts(
    id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at
  ) values(attempt,owner,favorite,quiz,1,attempt,'passed',3,'2026-09-01T01:00:00Z');
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(quiz_pass,owner,favorite,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values(passport_job,'passport',passport,'profile-source-upgrade-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(
    id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at
  ) values(passport,owner,favorite,quiz_pass,passport_job,'2026-09-01T02:00:00Z');
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)
    values(brand,'profile-source-upgrade-brand','published','/brand.webp','Brand','2026-09-01T00:00:00Z');
  insert into public.brand_localizations(brand_id,locale,name,description) values
    (brand,'ko','소스 상태 브랜드','업그레이드 검증 브랜드'),
    (brand,'en','Source state brand','Upgrade proof brand');
  insert into public.live_events(
    id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,
    reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at
  ) values(
    live,'profile-source-upgrade-live',favorite,brand,'published','scheduled',
    '2026-10-01T10:00:00Z','2026-10-01T12:00:00Z','2026-09-01T00:00:00Z',
    '2026-10-01T09:00:00Z','https://youtube.com/watch?v=profilesourceupgrade',
    '/profile-source-live.webp',extensions.crypt('131313',extensions.gen_salt('bf',12)),
    '2026-09-01T00:00:00Z'
  );
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt) values
    (live,'ko','기존 소스 LIVE','기존 소스 요약','기존 소스 이미지'),
    (live,'en','Existing source LIVE','Existing source summary','Existing source image');
  insert into public.live_reservations(
    id,app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,reserved_at
  ) values(reservation,owner,live,favorite,passport,reservation,'2026-09-02T00:00:00Z');
  insert into public.fan_activities(
    id,app_user_id,celebrity_id,activity_type,source_type,source_id,occurred_at,created_at
  ) values(
    activity,owner,favorite,'reservation','live_reservation',reservation,
    '2026-09-02T00:00:00Z','2026-09-02T00:00:01Z'
  );
  insert into public.fan_score_ledger(
    id,activity_id,app_user_id,celebrity_id,points,created_at
  ) values(
    '7d130000-0000-4000-8000-000000000014',activity,owner,favorite,1,
    '2026-09-02T00:00:02Z'
  );
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values(stamp_job,'stamp',stamp,'byus:stamp:v1:'||stamp::text,jsonb_build_object(
      'recipient','0x1313131313131313131313131313131313131313',
      'celebritySlug','profile-source-upgrade','issuanceId','0x'||repeat('1',64),
      'stampType','Reservation'
    ));
  insert into public.stamps(
    id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,
    blockchain_job_id,issued_at,updated_at
  ) values(
    stamp,owner,favorite,passport,activity,'reservation',stamp_job,
    '2026-09-02T00:00:03Z','2026-09-02T00:00:03Z'
  );

  create table public.mobile_profile_source_states_upgrade_snapshot as
  select owner owner_id,favorite favorite_id,live live_id,activity activity_id,stamp stamp_id,
    to_jsonb(a) activity_row,to_jsonb(s) stamp_row,to_jsonb(score) score_row,
    public.read_owned_mobile_stamp_presentation(owner,stamp,'ko') presentation
  from public.fan_activities a
  join public.stamps s on s.activity_id=a.id
  join public.fan_score_ledger score on score.activity_id=a.id
  where a.id=activity;
end $$;
