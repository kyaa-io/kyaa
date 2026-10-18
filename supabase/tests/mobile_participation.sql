begin;

create or replace function pg_temp.expect_participation_error(statement text,marker text)returns void language plpgsql as $$begin execute statement;raise exception'expected %',marker;exception when others then if sqlerrm not like'%'||marker||'%'then raise;end if;end$$;

do $$
declare
  owner uuid:='5a000000-0000-4000-8000-000000000001';other_user uuid:='5a000000-0000-4000-8000-000000000002';admin_user uuid:='5a000000-0000-4000-8000-000000000003';viewer_user uuid:='5a000000-0000-4000-8000-000000000004';
  creator uuid:='5a000000-0000-4000-8000-000000000010';admin_allow uuid:='5a000000-0000-4000-8000-000000000011';viewer_allow uuid:='5a000000-0000-4000-8000-000000000012';
  concert_event uuid:='5a000000-0000-4000-8000-000000000020';day_event uuid:='5a000000-0000-4000-8000-000000000021';concert_album uuid:='5a000000-0000-4000-8000-000000000030';day_album uuid:='5a000000-0000-4000-8000-000000000031';
  post_id uuid;day_post uuid;asset uuid:='5a000000-0000-4000-8000-000000000040';disable_asset uuid:='5a000000-0000-4000-8000-000000000045';vote_id uuid:='5a000000-0000-4000-8000-000000000050';option_a uuid:='5a000000-0000-4000-8000-000000000051';option_b uuid:='5a000000-0000-4000-8000-000000000052';
  activity uuid:='5a000000-0000-4000-8000-000000000060';activity_source uuid:='5a000000-0000-4000-8000-000000000062';activity_session_id uuid;session_version integer;qr jsonb;stamp_qr jsonb;resolved jsonb;result jsonb;target jsonb;report jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:participation-owner','participation-owner@example.test'),(other_user,'did:privy:participation-other','participation-other@example.test'),(admin_user,'did:privy:participation-admin','participation-admin@example.test'),(viewer_user,'did:privy:participation-viewer','participation-viewer@example.test');
  insert into public.admin_allowlist(id,email,role,active)values(admin_allow,'participation-admin@example.test','operator',true),(viewer_allow,'participation-viewer@example.test','viewer',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(creator,'participation-source','draft','/test.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','참여 테스트','설명','이미지'),(creator,'en','Participation test','Summary','Image');update public.celebrities set status='published',published_at=clock_timestamp()where id=creator;

  result:=public.read_owned_mobile_participation_events(owner,'ko',null,null,20);
  if(result->>'configured')::boolean or jsonb_array_length(result->'items')<>0 then raise exception'unconfigured event source must be explicit: %',result;end if;

  result:=public.upsert_admin_mobile_participation_event(admin_user,admin_allow,null,null,'participation-concert',creator,'concert','concert-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours','공연','Concert','','',null,'공연 정책을 게시합니다.',extensions.gen_random_uuid());concert_event:=(result->>'id')::uuid;
  result:=public.upsert_admin_mobile_participation_event(admin_user,admin_allow,null,null,'participation-day',creator,'byus_day','day-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours','데이','Day','','',null,'데이 정책을 게시합니다.',extensions.gen_random_uuid());day_event:=(result->>'id')::uuid;
  perform pg_temp.expect_participation_error(format($q$select public.upsert_admin_mobile_participation_event(%L,%L,null,null,'viewer-event',%L,'general','v1','draft',clock_timestamp(),clock_timestamp()+interval'1 hour','행사','Event','','',null,'뷰어는 작성할 수 없습니다.',%L)$q$,viewer_user,viewer_allow,creator,extensions.gen_random_uuid()),'viewer is read-only');

  insert into public.mobile_participation_contexts(id,context_type,source_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at,require_checkin,album_kind)values
    (concert_album,'album',concert_event,creator,'participation-concert-album','album-concert-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours',true,'concert'),
    (day_album,'album',day_event,creator,'participation-day-album','album-day-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'2 hours',true,'byus_day');
  insert into public.mobile_participation_checkins(event_id,app_user_id,status,source,policy_version)values(concert_event,owner,'valid','linked_web','concert-v1'),(day_event,owner,'valid','linked_web','day-v1'),(day_event,other_user,'valid','linked_web','day-v1');
  if public.mobile_participation_context_access(owner,concert_album,false)then raise exception'concert album unlocked without first valid record';end if;
  if not public.mobile_participation_context_access(owner,concert_album,true)then raise exception'concert participant cannot create first record';end if;
  if not public.mobile_participation_context_access(owner,day_album,false)then raise exception'ByUs Day stamp must unlock independently';end if;

  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash,ready_at)values(asset,owner,'image','participation','image/webp',100,100,owner::text||'/'||asset::text||'/original.webp',owner::text||'/'||asset::text||'/thumbnail.webp','ready',100,100,extensions.gen_random_uuid(),md5('asset'),clock_timestamp());
  result:=public.save_owned_mobile_participation_post(owner,'album',concert_album,null,'photo','첫 공연 기록',array[asset],null,'5a000000-0000-4000-8000-000000000041');post_id:=(result->>'id')::uuid;
  if not public.mobile_participation_context_access(owner,concert_album,false)or public.authorize_mobile_media_read(owner,asset,'original')is null then raise exception'valid record did not unlock protected album/media';end if;
  result:=public.read_owned_mobile_participation_context(owner,'album',concert_album,null,null,20);
  if result#>>'{access,allowed}'<>'true'or result->>'pollAfterMs'<>'2000'or jsonb_array_length(result->'items')<>1 or result#>>'{items,0,author,nickname}' is null or result#>>'{items,0,author,avatarUrl}' is null or (result#>'{items,0}')?'authorId' then raise exception'album feed projection invalid or private author id exposed: %',result;end if;
  perform public.post_owned_mobile_participation_comment(owner,post_id,'댓글','5a000000-0000-4000-8000-000000000042');perform public.set_owned_mobile_participation_reaction(owner,'post',post_id,'heart');
  result:=public.read_owned_mobile_participation_context(owner,'album',concert_album,null,null,20);
  if result#>>'{items,0,comments,0,author,nickname}' is null or (result#>'{items,0,comments,0}')?'authorId' then raise exception'comment public author projection invalid: %',result;end if;

  target:=public.fan_web_content_target(owner,'participation_post',post_id,'ko');
  if target->>'body'<>'첫 공연 기록'or target->>'sourceHash'is null then raise exception'common translation target missing: %',target;end if;
  perform public.save_content_translation(owner,'participation_post',post_id,'en','ko',(target->>'revision')::integer,target->>'sourceHash','First concert memory','ko');
  if public.read_content_translation(owner,'participation_post',post_id,'en','ko')->>'translatedText'<>'First concert memory'then raise exception'common translation cache failed';end if;
  report:=public.post_content_report(owner,'participation_post',post_id,'검수 요청','5a000000-0000-4000-8000-000000000043');if report->>'status'<>'open'then raise exception'common report failed: %',report;end if;

  perform public.remove_owned_mobile_participation_post(owner,post_id,1);
  if public.mobile_participation_context_access(owner,concert_album,false)or public.authorize_mobile_media_read(owner,asset,'original')is not null then raise exception'last valid concert record deletion did not relock';end if;
  result:=public.save_owned_mobile_participation_post(owner,'album',day_album,null,'memory','Day 기록','{}',null,'5a000000-0000-4000-8000-000000000044');day_post:=(result->>'id')::uuid;perform public.remove_owned_mobile_participation_post(owner,day_post,1);if not public.mobile_participation_context_access(owner,day_album,false)then raise exception'Day album incorrectly used first-post condition';end if;
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash,ready_at)values(disable_asset,owner,'image','participation','image/webp',100,100,owner::text||'/'||disable_asset::text||'/original.webp',owner::text||'/'||disable_asset::text||'/thumbnail.webp','ready',100,100,extensions.gen_random_uuid(),md5('disable-asset'),clock_timestamp());
  perform public.save_owned_mobile_participation_post(owner,'album',day_album,null,'photo','탈퇴 정리 대상',array[disable_asset],null,'5a000000-0000-4000-8000-000000000046');

  insert into public.mobile_participation_votes(id,context_id,policy_version,question,state,opens_at,closes_at,max_selections,change_allowed,result_visibility)values(vote_id,day_album,'vote-v1','한 곡을 골라 주세요','published',clock_timestamp()-interval'1 minute',clock_timestamp()+interval'1 hour',1,false,'after_vote');
  result:=public.read_owned_mobile_participation_event(owner,day_event,'ko');
  if not exists(select 1 from jsonb_array_elements(result->'contexts')x where x->>'id'=day_album::text and x->>'votePolicyId'=vote_id::text and x->'activityPolicyId'='null'::jsonb)then raise exception'active vote policy discovery invalid: %',result;end if;
  insert into public.mobile_participation_vote_options(id,vote_id,label,display_order)values(option_a,vote_id,'A',1),(option_b,vote_id,'B',2);
  result:=public.submit_owned_mobile_participation_vote(owner,vote_id,array[option_a],'5a000000-0000-4000-8000-000000000053','vote-v1');
  if result->>'revision'<>'1'or public.read_owned_mobile_participation_vote(owner,vote_id)#>>'{vote,resultsVisible}'<>'true'then raise exception'vote result invalid: %',result;end if;
  perform pg_temp.expect_participation_error(format($q$select public.submit_owned_mobile_participation_vote(%L,%L,array[%L::uuid],%L,'vote-v1')$q$,owner,vote_id,option_b,'5a000000-0000-4000-8000-000000000054'),'MOBILE_PARTICIPATION_VOTE_DUPLICATE');
  perform pg_temp.expect_participation_error(format($q$select public.submit_owned_mobile_participation_vote(%L,%L,array[%L::uuid],%L,'stale')$q$,other_user,vote_id,option_a,'5a000000-0000-4000-8000-000000000055'),'MOBILE_PARTICIPATION_POLICY_CHANGED');
  update public.mobile_participation_votes set closes_at=clock_timestamp()-interval'1 second'where id=vote_id;
  perform pg_temp.expect_participation_error(format($q$select public.submit_owned_mobile_participation_vote(%L,%L,array[%L::uuid],%L,'vote-v1')$q$,other_user,vote_id,option_a,'5a000000-0000-4000-8000-000000000056'),'MOBILE_PARTICIPATION_VOTE_CLOSED');

  insert into public.mobile_participation_activity_sources(id,source_kind,playback_url,duration_ms,state,created_by_admin_id)values(activity_source,'video','https://media.byus.test/activity.webm',60000,'active',admin_allow);
  insert into public.mobile_participation_activity_policies(id,context_id,source_id,policy_version,activity_kind,state,opens_at,closes_at,completion_seconds,max_heartbeat_gap_seconds)values(activity,day_album,activity_source,'activity-v1','video','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour',3,10);
  result:=public.read_owned_mobile_participation_event(owner,day_event,'ko');
  if not exists(select 1 from jsonb_array_elements(result->'contexts')x where x->>'id'=day_album::text and x->'votePolicyId'='null'::jsonb and x->>'activityPolicyId'=activity::text)then raise exception'active activity policy discovery or closed vote removal invalid: %',result;end if;
  result:=public.start_owned_mobile_participation_activity(owner,activity,'5a000000-0000-4000-8000-000000000061');activity_session_id:=(result->>'id')::uuid;update public.mobile_participation_activity_sessions set last_heartbeat_at=clock_timestamp()-interval'5 seconds',last_client_monotonic_ms=1000,last_position_ms=0 where id=activity_session_id;
  result:=public.heartbeat_owned_mobile_participation_activity(owner,activity_session_id,1,true,true,5000,6000);if(result->>'watchedSeconds')::integer<3 then raise exception'verified playback was not counted: %',result;end if;
  result:=public.claim_mobile_participation_activity_completion(10);if jsonb_array_length(result->'items')<>1 then raise exception'completion claim missing: %',result;end if;session_version:=(result#>>'{items,0,version}')::integer;
  result:=public.finish_mobile_participation_activity_completion(activity_session_id,session_version,true,null);if result->>'state'<>'completed'or result->>'rewardStatus'<>'awarded'then raise exception'completion finish invalid: %',result;end if;
  update public.app_users set status='disabled'where id=owner;if(select s.state from public.mobile_participation_activity_sessions s where s.id=activity_session_id)<>'deleted'or(select r.status from public.mobile_participation_activity_rewards r where r.session_id=activity_session_id)<>'revoked'or(select a.state from public.mobile_media_assets a where a.id=disable_asset)<>'cancelled'then raise exception'account disable did not lock completion/reward/media';end if;
  perform pg_temp.expect_participation_error(format($q$select public.finish_mobile_participation_activity_completion(%L,%s,true,null)$q$,activity_session_id,session_version),'MOBILE_PARTICIPATION_CONFLICT');
  update public.app_users set status='active'where id=owner;

  qr:=public.issue_admin_mobile_participation_qr(admin_user,admin_allow,'event_checkin','event',concert_event,other_user,null,'/participation/events/'||concert_event::text,'concert-v1',clock_timestamp()+interval'1 hour',true,true,'현장 확인 QR을 발급합니다.',extensions.gen_random_uuid());
  resolved:=public.resolve_owned_mobile_participation_qr(other_user,qr->>'rawCode','5a000000-0000-4000-8000-000000000070');if resolved->>'status'<>'resolved'or resolved->>'purpose'<>'event_checkin'or resolved->>'staffConfirmationRequired'<>'true'then raise exception'QR resolve invalid: %',resolved;end if;
  result:=public.confirm_admin_mobile_participation_qr(admin_user,admin_allow,(resolved->>'requestId')::uuid,'현장 담당자가 참여를 확인했습니다.',extensions.gen_random_uuid());if result->>'status'<>'consumed'or not exists(select 1 from public.mobile_participation_checkins where event_id=concert_event and app_user_id=other_user and status='valid')then raise exception'staff QR confirm invalid: %',result;end if;
  if public.confirm_admin_mobile_participation_qr(admin_user,admin_allow,(resolved->>'requestId')::uuid,'동일 요청 확인 결과를 조회합니다.',extensions.gen_random_uuid())->>'replayed'<>'true'then raise exception'QR confirm replay was not stable';end if;
  result:=public.resolve_owned_mobile_participation_qr(other_user,'unknown-code','5a000000-0000-4000-8000-000000000071');if result->>'status'<>'unknown'or result->'effect'<>'null'::jsonb or result->'consumedAt'<>'null'::jsonb then raise exception'unknown QR leaked private effect state: %',result;end if;if public.resolve_owned_mobile_participation_qr(other_user,'unknown-code','5a000000-0000-4000-8000-000000000071')->>'replayed'<>'true'then raise exception'unknown QR same-request retry not stable';end if;
  if public.read_owned_mobile_participation_qr_request(other_user,'5a000000-0000-4000-8000-000000000071')->>'status'<>'unknown'then raise exception'QR request status recovery failed';end if;
  stamp_qr:=public.issue_admin_mobile_participation_qr(admin_user,admin_allow,'stamp','event',concert_event,owner,null,'/my/activity','concert-v1',clock_timestamp()+interval'1 hour',true,false,'공연 스탬프 QR을 발급합니다.',extensions.gen_random_uuid());
  result:=public.resolve_owned_mobile_participation_qr(owner,stamp_qr->>'rawCode','5a000000-0000-4000-8000-000000000072');
  if result->>'status'<>'fan_verification_required'or result->>'destinationPath'<>'/my/activity'or result->'effect'<>'null'::jsonb or result->'consumedAt'<>'null'::jsonb or exists(select 1 from public.mobile_participation_qr_stamps where app_user_id=owner and source_id=concert_event)then raise exception'unverified fan received a stamp or private effect: %',result;end if;
  result:=public.resolve_owned_mobile_participation_qr(owner,stamp_qr->>'rawCode','5a000000-0000-4000-8000-000000000073');if result->>'status'<>'fan_verification_required'or exists(select 1 from public.mobile_participation_qr_stamps where app_user_id=owner and source_id=concert_event)then raise exception'unverified stamp retry changed state: %',result;end if;
  perform pg_temp.expect_participation_error(format($q$select public.issue_admin_mobile_participation_qr(%L,%L,'event_checkin','event',%L,%L,null,'/participation/events/%s','concert-v1',clock_timestamp()+interval'1 hour',false,true,'재사용 가능한 현장 확인 QR은 발급할 수 없습니다.',%L)$q$,admin_user,admin_allow,concert_event,other_user,concert_event,extensions.gen_random_uuid()),'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID');
  update public.mobile_participation_events set policy_version='day-v2'where id=day_event;if public.mobile_participation_context_access(other_user,day_album,false)then raise exception'stale checkin unlocked a new event policy';end if;
end$$;

rollback;
