\set ON_ERROR_STOP on
-- Real SQL answers for the fan profile card, the owned fields and the fan list rows (feedback C2).
-- apps/web/server/social/fan-profile-sql-responses.test.ts parses them with the route schemas.
-- Regenerate: psql -X -q -At -f supabase/tests/fan_profile_public_sql_responses.sql > apps/web/server/social/fan-profile-sql-responses.json
begin;
create temp table fan_profile_answers(name text primary key,value jsonb) on commit drop;
do $$
declare creator uuid:='7d000000-0000-4000-8000-0000000000c1';page uuid:='7d000000-0000-4000-8000-0000000000a1';anon_page uuid:='7d000000-0000-4000-8000-0000000000a2';
 filled uuid:='7d000000-0000-4000-8000-000000000001';empty_fan uuid:='7d000000-0000-4000-8000-000000000002';viewer uuid:='7d000000-0000-4000-8000-000000000003';u uuid;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'profile-answer-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','응답 검증','소개','사진'),(creator,'en','Answer fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Answer fixture');
 insert into public.group_pages(id,kind,name,anonymous)values(anon_page,'hobby','Anonymous answer',true);
 foreach u in array array[filled,empty_fan,viewer] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:profile-answer-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'n'||right(u::text,1),'n'||right(u::text,1));
  insert into public.group_memberships(page_id,app_user_id,joined_at)values(page,u,'2026-12-01'::timestamptz+(right(u::text,1)::integer||' minutes')::interval),(anon_page,u,now());
 end loop;
 set local session_replication_role=replica;
 insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id)values(creator,filled,1,'passport_page_claim','7d000000-0000-4000-8000-0000000000e1'),(creator,filled,1,'passport_page_claim','7d000000-0000-4000-8000-0000000000e2');
 insert into public.fan_score_ledger(app_user_id,celebrity_id,activity_id,points)values(filled,creator,'7d000000-0000-4000-8000-0000000000f1',40);
 insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,fan_action_outbox_id)values(filled,creator,'post','answer-a','7d000000-0000-4000-8000-0000000000d1');
 set local session_replication_role=origin;
 insert into fan_profile_answers values('owned_empty',public.read_owned_fan_profile_public(empty_fan,'ko'));
 insert into fan_profile_answers values('owned_filled',public.set_owned_fan_profile_public(filled,'profile-answer-fixture','https://www.instagram.com/answer_fan','무대 끝나면 후기 올려요','ko'));
 insert into fan_profile_answers values('card_page',public.read_social_profile_card(viewer,filled,page,'ko'));
 insert into fan_profile_answers values('card_favorite',public.read_social_profile_card(viewer,filled,null,'en'));
 insert into fan_profile_answers values('card_empty',public.read_social_profile_card(viewer,empty_fan,page,'ko'));
 insert into fan_profile_answers values('card_empty_no_page',public.read_social_profile_card(viewer,empty_fan,null,'ko'));
 insert into fan_profile_answers values('card_anonymous',public.read_social_profile_card(viewer,filled,anon_page,'ko'));
 insert into fan_profile_answers values('rows_page',public.read_group_people(viewer,page,'members','',null,30,'ko'));
 insert into fan_profile_answers values('rows_anonymous',public.read_group_people(viewer,anon_page,'members','',null,30,'ko'));
end $$;
select jsonb_pretty(jsonb_object_agg(name,value)) from fan_profile_answers;
rollback;
