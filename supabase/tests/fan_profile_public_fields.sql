\set ON_ERROR_STOP on
-- Fan profile public fields (feedback C2): empty until written, shown only to fans who may see the profile,
-- numbers belong to one creator, anonymous pages show none, and nothing paid, no wallet and no e-mail leaves.
begin;
do $$
declare creator uuid:=extensions.gen_random_uuid();other uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();anon_page uuid:=extensions.gen_random_uuid();
 shown uuid:=extensions.gen_random_uuid();empty_fan uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();outsider uuid:=extensions.gen_random_uuid();
 u uuid;result jsonb;raised boolean;state text;row_json jsonb;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'profile-public-fixture','published','/fixture.webp',now(),'{creator}','creator'),(other,'profile-public-other','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','공개 검증','소개','사진'),(creator,'en','Public fixture','Summary','Photo'),(other,'ko','다른 검증','소개','사진'),(other,'en','Other fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Public fixture');
 insert into public.group_pages(id,kind,name,anonymous)values(anon_page,'hobby','Anonymous fixture',true);
 foreach u in array array[shown,empty_fan,sanctioned,blocker,viewer,outsider] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:profile-public-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,left(u::text,8),left(u::text,8));
  if u<>outsider then insert into public.group_memberships(page_id,app_user_id)values(page,u),(anon_page,u);end if;
 end loop;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);
 set local session_replication_role=replica;
 insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id)values(creator,shown,1,'passport_page_claim',extensions.gen_random_uuid()),(creator,shown,1,'passport_page_claim',extensions.gen_random_uuid());
 insert into public.fan_score_ledger(app_user_id,celebrity_id,activity_id,points)values(shown,creator,extensions.gen_random_uuid(),30),(shown,creator,extensions.gen_random_uuid(),20),(shown,other,extensions.gen_random_uuid(),7);
 insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,fan_action_outbox_id)values(shown,creator,'post','fixture-a:'||shown,extensions.gen_random_uuid()),(shown,creator,'daily_checkin','fixture-b:'||shown,extensions.gen_random_uuid());
 insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,revoked_at,revoked_reason,fan_action_outbox_id)values(shown,creator,'daily_checkin','fixture-c:'||shown,now(),'fixture',extensions.gen_random_uuid());
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'공개 프로필 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;

 -- Empty until written: the owner sees nulls and the creators they may pick.
 result:=public.read_owned_fan_profile_public(empty_fan,'ko');
 if result->'favorite'<>'null'::jsonb or result->'snsUrl'<>'null'::jsonb or result->'bio'<>'null'::jsonb then raise exception 'Not empty by default: %',result;end if;
 if not result->'favoriteOptions' @> '[{"slug":"profile-public-fixture","name":"공개 검증"}]' or result->'favoriteOptions' @> '[{"slug":"profile-public-other"}]' then raise exception 'Options wrong: %',result;end if;

 -- Saving: trims, then refuses a creator they never joined, http, credentials, IP hosts, line breaks and long intros.
 result:=public.set_owned_fan_profile_public(shown,'profile-public-fixture','  https://instagram.com/fixture_fan?x=1  ','  한 줄 소개  ','ko');
 if result->>'snsUrl'<>'https://instagram.com/fixture_fan?x=1' or result->>'bio'<>'한 줄 소개' or result->'favorite'->>'slug'<>'profile-public-fixture' then raise exception 'Save wrong: %',result;end if;
 foreach state in array array['other-creator','http://instagram.com/a','https://user:pw@instagram.com/a','https://127.0.0.1/a','javascript:alert(1)','https://exa mple.com','bio-break','bio-long'] loop
  raised:=false;
  begin
   if state='other-creator' then perform public.set_owned_fan_profile_public(shown,'profile-public-other',null,null,'ko');
   elsif state='bio-break' then perform public.set_owned_fan_profile_public(shown,null,null,E'첫 줄\n둘째 줄','ko');
   elsif state='bio-long' then perform public.set_owned_fan_profile_public(shown,null,null,repeat('가',61),'ko');
   else perform public.set_owned_fan_profile_public(shown,null,state,null,'ko');end if;
  exception when others then raised:=sqlerrm='PROFILE_INVALID_REQUEST';end;
  if not raised then raise exception 'Accepted %',state;end if;
 end loop;
 -- A refused save keeps what was there.
 if public.read_owned_fan_profile_public(shown,'ko')->>'bio'<>'한 줄 소개' then raise exception 'Refused save changed data';end if;
 -- Clearing writes nulls, not empty strings.
 result:=public.set_owned_fan_profile_public(empty_fan,null,'  ','','ko');
 if result->'snsUrl'<>'null'::jsonb or result->'bio'<>'null'::jsonb then raise exception 'Clear wrong: %',result;end if;
 raised:=false;begin perform public.set_owned_fan_profile_public(sanctioned,null,null,'제재 중','ko');exception when others then raised:=sqlerrm='FAN_WEB_ACTIVE_ACCOUNT_REQUIRED';end;
 if not raised then raise exception 'Sanctioned fan saved';end if;

 -- Card from the page: the page's numbers, revoked stamps and other creators' points out, nothing private in it.
 result:=public.read_social_profile_card(viewer,shown,page,'ko');
 if result->'stats'->>'points'<>'50' or result->'stats'->>'stamps'<>'2' or result->'stats'->>'hearts'<>'2' or result->'stats'->'creator'->>'slug'<>'profile-public-fixture' or result->'stats'->>'tier' is null then raise exception 'Card numbers wrong: %',result;end if;
 if result->>'snsUrl'<>'https://instagram.com/fixture_fan?x=1' or result->>'bio'<>'한 줄 소개' or result->'favorite'->>'name'<>'공개 검증' then raise exception 'Card fields wrong: %',result;end if;
 if result::text ~* '(example\.test|privy|email|wallet|amount|payment|balance)' then raise exception 'Card leaks private data: %',result;end if;
 -- Without a page, or from a page the viewer is not in: the chosen favorite's numbers.
 result:=public.read_social_profile_card(outsider,shown,page,'en');
 if result->'stats'->'creator'->>'name'<>'Public fixture' or result->'stats'->>'points'<>'50' then raise exception 'Favorite scope wrong: %',result;end if;
 -- Nothing written and no page: empty, not zeros.
 result:=public.read_social_profile_card(outsider,empty_fan,null,'ko');
 if result->'stats'<>'null'::jsonb or result->'favorite'<>'null'::jsonb or result->'snsUrl'<>'null'::jsonb or result->'bio'<>'null'::jsonb then raise exception 'Empty card wrong: %',result;end if;
 -- Anonymous page: nothing beyond the name.
 result:=public.read_social_profile_card(viewer,shown,anon_page,'ko');
 if result->'stats'<>'null'::jsonb or result->'favorite'<>'null'::jsonb or result->'snsUrl'<>'null'::jsonb or result->'bio'<>'null'::jsonb then raise exception 'Anonymous page card wrong: %',result;end if;
 -- Closed: blocked either way and sanctioned answer null.
 if public.read_social_profile_card(viewer,blocker,page,'ko') is not null or public.read_social_profile_card(blocker,viewer,page,'ko') is not null then raise exception 'Blocked card shown';end if;
 if public.read_social_profile_card(viewer,sanctioned,page,'ko') is not null then raise exception 'Sanctioned card shown';end if;
 raised:=false;begin perform public.read_social_profile_card(sanctioned,shown,page,'ko');exception when others then raised:=sqlerrm='FAN_WEB_ACTIVE_ACCOUNT_REQUIRED';end;
 if not raised then raise exception 'Sanctioned viewer read a card';end if;

 -- Fan list rows: the page's numbers and the favorite name; the sanctioned fan's row and values stay out; anonymous pages carry none.
 result:=public.read_group_people(viewer,page,'members','',null,30,'ko');
 select i into row_json from jsonb_array_elements(result->'items')i where i->>'profileId'=shown::text;
 if row_json->>'fanPoints'<>'50' or row_json->>'stamps'<>'2' or row_json->>'hearts'<>'2' or row_json->'favorite'->>'slug'<>'profile-public-fixture' then raise exception 'Row wrong: %',row_json;end if;
 if row_json ? 'snsUrl' or row_json ? 'bio' then raise exception 'Row carries card-only fields: %',row_json;end if;
 select i into row_json from jsonb_array_elements(result->'items')i where i->>'profileId'=empty_fan::text;
 if row_json->>'fanPoints'<>'0' or row_json->>'stamps'<>'0' or row_json->'favorite'<>'null'::jsonb then raise exception 'Empty row wrong: %',row_json;end if;
 if result::text like '%'||sanctioned::text||'%' or result::text like '%'||blocker::text||'%' then raise exception 'Excluded fan in rows: %',result;end if;
 result:=public.read_group_people(viewer,anon_page,'members','',null,30,'ko');
 if exists(select 1 from jsonb_array_elements(result->'items')i where i->'stamps'<>'null'::jsonb or i->'fanPoints'<>'null'::jsonb or i->'favorite'<>'null'::jsonb)then raise exception 'Anonymous rows carry numbers: %',result;end if;

 -- Only the service role calls them; the table is closed to API roles.
 foreach state in array array['anon','authenticated'] loop
  raised:=false;begin execute format('set local role %I',state);perform public.read_social_profile_card(viewer,shown,page,'ko');exception when others then raised:=sqlstate='42501';end;
  execute 'reset role';
  if not raised then raise exception '% may read the card',state;end if;
  raised:=false;begin execute format('set local role %I',state);perform 1 from public.fan_profile_public_fields;exception when others then raised:=sqlstate='42501';end;
  execute 'reset role';
  if not raised then raise exception '% may read the table',state;end if;
 end loop;
 raise notice 'PASS fan profile public fields';
end $$;
rollback;
