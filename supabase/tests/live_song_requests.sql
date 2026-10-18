begin;
create or replace function pg_temp.expect_participation_error(p_sql text,p_marker text)
returns void language plpgsql as $$ begin execute p_sql; raise exception 'expected:%',p_marker;
exception when others then if sqlerrm='expected:'||p_marker or position(p_marker in sqlerrm)=0 then raise; end if; end $$;
do $$
declare
  admin_id uuid:=extensions.gen_random_uuid(); allow_id uuid:=extensions.gen_random_uuid();
  fan uuid:=extensions.gen_random_uuid(); other_fan uuid:=extensions.gen_random_uuid(); creator uuid:=extensions.gen_random_uuid(); draft_creator uuid:=extensions.gen_random_uuid(); live_id uuid:=extensions.gen_random_uuid();
  brand_id uuid:=extensions.gen_random_uuid(); correlation uuid:=extensions.gen_random_uuid(); input jsonb; result jsonb; again jsonb; request_id uuid; suggestion_id uuid; v_schedule_id uuid; submission_id uuid; other_id uuid;
  before_rewards bigint; v_month timestamptz:=date_trunc('month',clock_timestamp());
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_id,'did:privy:participation-admin','participation-admin@example.test'),(fan,'did:privy:participation-fan','participation-fan@example.test'),(other_fan,'did:privy:participation-other','participation-other@example.test');
  insert into public.admin_allowlist(id,email,role,active) values(allow_id,'participation-admin@example.test','operator',true);
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (creator,'participation-qa','published','/images/qa.webp',now(),'{creator}','creator'),(draft_creator,'participation-draft','draft','/images/draft.webp',null,'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','참여 검증','소개','사진'),(creator,'en','Participation QA','Summary','Photo'),(draft_creator,'ko','비공개 초안','소개','사진'),(draft_creator,'en','Private draft','Summary','Photo');
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at) values(brand_id,'participation-brand','published','/images/brand.webp','Brand',now());
  insert into public.brand_localizations(brand_id,locale,name,description) values(brand_id,'ko','검사 브랜드','소개'),(brand_id,'en','QA brand','Description');
  insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at,attendance_valid_from,attendance_valid_until)
  values(live_id,'participation-live',creator,brand_id,'published',now()+interval '2 days',now()+interval '2 days 1 hour',now()-interval '1 day',now()+interval '1 day','https://www.youtube.com/watch?v=abcdefghijk','/images/qa.webp',extensions.crypt('QA1234',extensions.gen_salt('bf',10)),now(),now()+interval '2 days',now()+interval '2 days 1 hour');
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt) values(live_id,'ko','참여 방송','소개','사진'),(live_id,'en','Participation LIVE','Summary','Photo');
  select count(*) into before_rewards from public.fan_activities;

  perform public.fan_web_admin_save_live_submission_settings(admin_id,allow_id,correlation,live_id,0,true,clock_timestamp()+interval '1 day','public');
  result:=public.fan_web_submit_live_submission(fan,'participation-live','question','Legacy private',extensions.gen_random_uuid());
  submission_id:=(result#>>'{item,id}')::uuid;
  if result->'item' ? 'song' or result->'item' ? 'publicVisible' then raise exception 'legacy POST shape changed'; end if;
  input:=jsonb_build_object('provider','spotify','trackId','0123456789012345678901','title',' Original title ','artist','Artist','album','Album','artworkUrl','https://i.scdn.co/image/aabbcc','sourceUrl','https://open.spotify.com/track/0123456789012345678901');
  if public.fan_web_valid_song(input||jsonb_build_object('artworkUrl','https://example.test/image')) or public.fan_web_valid_song(input||jsonb_build_object('provider','manual')) or public.fan_web_valid_song(input||jsonb_build_object('extra',true)) then raise exception 'song metadata validation failed'; end if;
  result:=public.fan_web_submit_live_submission(fan,'participation-live','song',input->>'title',correlation,input,true,true);
  request_id:=(result#>>'{item,id}')::uuid;
  if result#>'{item,song}'<>input or result#>>'{item,publicVisible}'<>'true' then raise exception 'song metadata not stored'; end if;
  if public.fan_web_submit_live_submission(fan,'participation-live','song',input->>'title',correlation,input,true,true)->>'replayed'<>'true' then raise exception 'song retry failed'; end if;
  perform pg_temp.expect_participation_error(format('select public.fan_web_submit_live_submission(%L,%L,%L,%L,%L,%L::jsonb,false,true)',fan,'participation-live','song',input->>'title',correlation,input),'FAN_WEB_IDEMPOTENCY_CONFLICT');
  perform pg_temp.expect_participation_error(format('select public.fan_web_submit_live_submission(%L,%L,%L,%L,%L,%L::jsonb,true,true)',fan,'participation-live','song',input->>'title',correlation,input||jsonb_build_object('artist','Changed')),'FAN_WEB_IDEMPOTENCY_CONFLICT');
  result:=public.fan_web_list_live_submissions(null,'participation-live','ko',null,null,20,true);
  if jsonb_array_length(result->'items')<>1 or result#>>'{items,0,id}'<>request_id::text or result#>>'{items,0,status}'<>'submitted' or result#>'{items,0,selectedAt}'<>'null'::jsonb then raise exception 'public consent or private pending guard failed'; end if;
  if public.fan_web_get_live_submission_target(null,submission_id) is not null then raise exception 'legacy pending exposed'; end if;
  result:=public.fan_web_list_live_submissions(fan,'participation-live','ko',null,null,20);
  if jsonb_array_length(result->'mine')<>1 or result#>'{mine,0}' ? 'song' or jsonb_array_length(result->'items')<>0 then raise exception 'legacy list changed'; end if;
  result:=public.fan_web_admin_list_live_submissions(admin_id,allow_id,correlation,live_id,null,null,null,20);
  if jsonb_array_length(result->'items')<>1 or result#>'{items,0}' ? 'song' then raise exception 'legacy admin list changed'; end if;
  result:=public.fan_web_admin_review_live_submission(admin_id,allow_id,correlation,submission_id,1,'select',null);
  if result ? 'song' or result ? 'publicVisible' then raise exception 'legacy admin PATCH changed'; end if;
  -- The new cursor follows created_at even when moderation changes selected_at.
  update public.live_fan_submissions set created_at=clock_timestamp()-interval '1 minute' where id=submission_id;
  result:=public.fan_web_list_live_submissions(null,'participation-live','ko',null,null,1,true);
  if result#>>'{items,0,id}'<>request_id::text or result->'nextCursor'='null'::jsonb then raise exception 'created cursor first page failed'; end if;
  again:=public.fan_web_list_live_submissions(null,'participation-live','ko',(result#>>'{nextCursor,at}')::timestamptz,(result#>>'{nextCursor,id}')::uuid,1,true);
  if again#>>'{items,0,id}'<>submission_id::text then raise exception 'created cursor continuation failed'; end if;
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(fan,other_fan);
  result:=public.fan_web_list_live_submissions(other_fan,'participation-live','ko',null,null,20,true);
  if jsonb_array_length(result->'items')<>0 then raise exception 'public proposal block bypass'; end if;
  delete from public.user_blocks where app_user_id=fan and blocked_app_user_id=other_fan;
  result:=public.post_content_report(other_fan,'live_submission',request_id,'Song report',extensions.gen_random_uuid());
  other_id:=(result->>'id')::uuid;
  result:=public.resolve_admin_content_report(admin_id,allow_id,correlation,other_id,'resolved',true,'Song report reviewed');
  if result->>'targetHidden'<>'true' or (select status from public.live_fan_submissions where id=request_id)<>'hidden' then raise exception 'report did not hide song'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=request_id::text and action='live_submission.hide') then raise exception 'song hide audit missing'; end if;
  if public.fan_web_get_live_submission_target(other_fan,request_id) is not null then raise exception 'reported song remains public'; end if;
  again:=public.resolve_admin_content_report(admin_id,allow_id,correlation,other_id,'resolved',true,'Song report reviewed');
  if again<>result then raise exception 'song report retry failed'; end if;
  result:=public.fan_web_list_live_submissions(fan,'participation-live','ko',null,null,20,true);
  if result#>'{mine,1,body}'<>'null'::jsonb or result#>'{mine,1,song}'<>'null'::jsonb then raise exception 'hidden metadata leaked'; end if;
  for before_rewards in 1..30 loop perform public.fan_web_authorize_song_search(fan,'participation-live'); end loop;
  perform pg_temp.expect_participation_error(format('select public.fan_web_authorize_song_search(%L,%L)',fan,'participation-live'),'FAN_WEB_RATE_LIMIT');
  perform public.fan_web_authorize_song_search(other_fan,'participation-live');
  update public.live_song_search_limits set window_started_at=clock_timestamp()-interval '2 minutes' where app_user_id=fan;
  perform public.fan_web_authorize_song_search(fan,'participation-live');
  update public.live_fan_submission_settings set visibility='members' where live_event_id=live_id;
  result:=public.fan_web_list_live_submissions(fan,'participation-live','ko',null,null,20,true);
  if jsonb_array_length(result->'items')<>0 or result#>'{mine,0,body}'<>'null'::jsonb or result#>'{mine,1,song}'<>'null'::jsonb then raise exception 'member gate redaction failed'; end if;
  perform pg_temp.expect_participation_error(format('select public.fan_web_authorize_song_search(%L,%L)',fan,'participation-live'),'FAN_WEB_MEMBERS_REQUIRED');
  update public.live_fan_submission_settings set accepting=false where live_event_id=live_id;
  perform pg_temp.expect_participation_error(format('select public.fan_web_authorize_song_search(%L,%L)',fan,'participation-live'),'FAN_WEB_CLOSED');
  update public.app_users set status='disabled' where id=other_fan;
  perform pg_temp.expect_participation_error(format('select public.fan_web_authorize_song_search(%L,%L)',other_fan,'participation-live'),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  if has_function_privilege('anon','public.fan_web_authorize_song_search(uuid,text)','execute') or has_function_privilege('authenticated','public.fan_web_authorize_song_search(uuid,text)','execute') or has_table_privilege('authenticated','public.live_song_search_limits','select') then raise exception 'search guard permission leak'; end if;
end $$;
rollback;
