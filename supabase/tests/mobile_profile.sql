begin;
do $$
declare owner uuid:='78100000-0000-4000-8000-000000000001'; viewer uuid:='78100000-0000-4000-8000-000000000002'; creator uuid:='78100000-0000-4000-8000-000000000010'; quiz uuid:='78100000-0000-4000-8000-000000000011'; attempt uuid:='78100000-0000-4000-8000-000000000012'; pass uuid:='78100000-0000-4000-8000-000000000013'; job uuid:='78100000-0000-4000-8000-000000000014'; passport uuid:='78100000-0000-4000-8000-000000000015'; post_public uuid:='78100000-0000-4000-8000-000000000016'; post_members uuid:='78100000-0000-4000-8000-000000000017'; activity1 uuid:='78100000-0000-4000-8000-000000000018';activity2 uuid:='78100000-0000-4000-8000-000000000019'; brand uuid:='78100000-0000-4000-8000-000000000021'; live uuid:='78100000-0000-4000-8000-000000000022'; reservation uuid:='78100000-0000-4000-8000-000000000023'; live_stamp uuid:='78100000-0000-4000-8000-000000000024'; live_activity uuid:='78100000-0000-4000-8000-000000000025'; stamp_job uuid:='78100000-0000-4000-8000-000000000026'; result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:mobile-profile-owner','mobile-profile-owner@example.test'),(viewer,'did:privy:mobile-profile-viewer','mobile-profile-viewer@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address)values(owner,91342,'0x1111111111111111111111111111111111111111');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(owner,'실제팬','실제팬');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(creator,'profile-creator','draft','/profile.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','프로필 최애','소개','최애'),(creator,'en','Profile Favorite','Summary','Favorite');
  update public.celebrities set status='published',published_at=now() where id=creator;
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(quiz,creator,1,'draft');
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(attempt,owner,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,now());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass,owner,creator,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(job,'passport',passport,'mobile-profile-passport','{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,owner,creator,pass,job);
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
  insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy)values(owner,true,'requests');
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(owner,creator,false);
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id)
    values(activity1,owner,creator,'knowledge','quiz_pass',pass);
  insert into public.fan_score_ledger(activity_id,app_user_id,celebrity_id,points)values(activity1,owner,creator,1);
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)values(brand,'mobile-profile-brand','published','/brand.webp','Brand',now());
  insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at)
    values(live,'mobile-profile-live',creator,brand,'published','scheduled',now()+interval'1 day',now()+interval'25 hours',now()-interval'3 days',now()+interval'12 hours','https://youtube.com/watch?v=mobileprofile','/mobile-profile-live.webp',extensions.crypt('123456',extensions.gen_salt('bf',12)),now()-interval'4 days');
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)values(live,'ko','실제 LIVE','실제 요약','실제 LIVE 이미지'),(live,'en','Real LIVE','Real summary','Real LIVE image');
  insert into public.live_reservations(id,app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key)
    values(reservation,owner,live,creator,passport,extensions.gen_random_uuid());
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id,occurred_at)
    values(live_activity,owner,creator,'reservation','live_reservation',reservation,now()-interval'1 day');
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(stamp_job,'stamp',live_stamp,'byus:stamp:v1:'||live_stamp::text,jsonb_build_object('recipient','0x1111111111111111111111111111111111111111','celebritySlug','profile-creator','issuanceId','0x'||repeat('1',64),'stampType','Reservation'));
  insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id)
    values(live_stamp,owner,creator,passport,live_activity,'reservation',stamp_job);
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values
    (post_public,creator,owner,'공개 기록','public',extensions.gen_random_uuid(),'public',now()),
    (post_members,creator,owner,'회원 기록','members',extensions.gen_random_uuid(),'members',now()-interval'1 second');

  result:=public.read_owned_mobile_profile(owner,'ko');
  if result#>>'{profile,nickname}'<>'실제팬' or result#>'{profile,preferredFavorite}'<>'null'::jsonb or result#>>'{passports,count}'<>'1' or result#>>'{accountLevel,status}'<>'configured' or result#>>'{accountLevel,xp}'<>'1' or result#>>'{accountLevel,tier}'<>'Bronze' then raise exception 'owned summary contract failed: %',result; end if;
  result:=public.read_owned_mobile_passports(owner,'ko');
  if jsonb_array_length(result->'passports')<>2 or not exists(select 1 from jsonb_array_elements(result->'passports') p where p->>'kind'='favorite' and p->>'fanXp'='1') then raise exception 'passport contract failed: %',result; end if;
  result:=public.read_owned_mobile_profile_levels(owner,'ko');
  if result#>>'{accountLevel,ruleVersion}'<>'favorite-xp-sum-v1' or result#>>'{accountLevel,progress,current,key}'<>'bronze-1' or result#>>'{favorites,0,rank}'<>'1' or result#>>'{favorites,0,activityDays}'<>'2' or result#>>'{favorites,0,neighbors,0,isMe}'<>'true' or result#>>'{favorites,0,neighbors,0,nickname}'<>'실제팬' then raise exception 'level contract failed: %',result; end if;
  result:=public.read_owned_mobile_passport_presentation(owner,passport,'ko');
  if jsonb_array_length(result->'liveRecords')<>1 or result#>>'{liveRecords,0,stampId}'<>live_stamp::text or result#>>'{liveRecords,0,title}'<>'실제 LIVE' or result#>>'{liveRecords,0,heroImageUrl}'<>'/mobile-profile-live.webp' or result#>>'{liveRecords,0,stampCount}'<>'1' then raise exception 'passport presentation contract failed: %',result; end if;
  if public.read_owned_mobile_passport_presentation(viewer,passport,'ko') is not null then raise exception 'passport presentation owner isolation failed'; end if;
  result:=public.read_owned_mobile_stamp_presentation(owner,live_stamp,'ko');
  if result#>>'{title}'<>'실제 LIVE' or result#>>'{heroImageUrl}'<>'/mobile-profile-live.webp' or result->'location'<>'null'::jsonb then raise exception 'stamp presentation contract failed: %',result; end if;
  if public.read_owned_mobile_stamp_presentation(viewer,live_stamp,'ko') is not null then raise exception 'stamp presentation owner isolation failed'; end if;
  update public.social_favorite_visibility set visible=true where app_user_id=owner and celebrity_id=creator;
  result:=public.read_social_fan_profile(viewer,owner,'profile-creator','ko');
  if result#>>'{profile,accountLevel,xp}'<>'1' or result#>>'{publicActivityCount}'<>'1' or jsonb_array_length(result->'activities')<>1 or result#>>'{activities,0,target,type}'<>'fan_post' or result::text like '%회원 기록%' then raise exception 'public activity privacy contract failed: %',result; end if;
  if public.read_social_fan_profile(viewer,owner,null,'ko')#>>'{favorite,slug}'<>'profile-creator' then raise exception 'default visible favorite selection failed'; end if;
  perform public.block_social_profile(viewer,owner,'78100000-0000-4000-8000-000000000020');
  if public.read_social_fan_profile(viewer,owner,'profile-creator','ko') is not null then raise exception 'blocked profile leaked'; end if;
  update public.app_users set status='disabled'where id=owner;
  if public.read_social_fan_profile(viewer,owner,'profile-creator','ko') is not null then raise exception 'disabled profile leaked'; end if;
  if has_function_privilege('authenticated','public.read_owned_mobile_profile(uuid,public.content_locale)','EXECUTE') then raise exception 'mobile profile RPC exposed'; end if;
end $$;
rollback;
