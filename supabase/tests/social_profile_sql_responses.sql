\set ON_ERROR_STOP on
-- Real answers of the two functions behind /api/me/social/profiles/{id}, for each relationship. Fixed ids, so the output is stable.
-- scripts/verify-social-profile-sql.sh sends them through the real route and compares them with the committed copy.
\set QUIET on
begin;
do $$
declare viewer uuid:='7c000000-0000-4000-8000-000000000001';page uuid:='7c000000-0000-4000-8000-0000000000aa';u uuid;d uuid;
begin
 insert into public.group_pages(id,kind,name)values(page,'hobby','Response page');
 for u in select('7c000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,8)n loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:sql-response-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'n'||right(u::text,1),'n'||right(u::text,1));
 end loop;
 -- 2 same page, no setting; 3 nothing in common; 4 friend, no conversation; 5 saved friends only; 6 saved off; 7 accepted conversation; 8 waiting request.
 insert into public.group_memberships(page_id,app_user_id)select page,('7c000000-0000-4000-8000-00000000000'||n)::uuid from unnest(array[1,2,5,6,7,8])n;
 insert into public.social_friendships(id,requester_id,addressee_id,status,request_id,payload_hash)values('7c000000-0000-4000-8000-0000000000f4',viewer,'7c000000-0000-4000-8000-000000000004','accepted',extensions.gen_random_uuid(),'fixture');
 insert into public.social_profile_settings(app_user_id,dm_policy)values('7c000000-0000-4000-8000-000000000005','friends'),('7c000000-0000-4000-8000-000000000006','none');
 insert into public.social_dm_conversations(id,user_low_id,user_high_id,requester_id,status,request_id,payload_hash)values
  ('7c000000-0000-4000-8000-0000000000b7',viewer,'7c000000-0000-4000-8000-000000000007',viewer,'accepted',extensions.gen_random_uuid(),'fixture'),
  ('7c000000-0000-4000-8000-0000000000b8',viewer,'7c000000-0000-4000-8000-000000000008',viewer,'pending',extensions.gen_random_uuid(),'fixture');
end $$;
\t on
\a
select jsonb_pretty(jsonb_object_agg(c.name,jsonb_build_object(
  'profile',public.read_social_fan_profile('7c000000-0000-4000-8000-000000000001',c.id,null,'ko',null,null,null,12),
  'reach',public.read_social_profile_reach('7c000000-0000-4000-8000-000000000001',c.id))))
 from(values('self','7c000000-0000-4000-8000-000000000001'::uuid),('same_page_no_setting','7c000000-0000-4000-8000-000000000002'),('nothing_in_common','7c000000-0000-4000-8000-000000000003'),('friend_no_conversation','7c000000-0000-4000-8000-000000000004'),('saved_friends_only','7c000000-0000-4000-8000-000000000005'),('saved_off','7c000000-0000-4000-8000-000000000006'),('accepted_conversation','7c000000-0000-4000-8000-000000000007'),('waiting_request','7c000000-0000-4000-8000-000000000008'))c(name,id);
rollback;
