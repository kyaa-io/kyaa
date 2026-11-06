\set ON_ERROR_STOP on
-- 2026-11-06 user decision: there is no public or private profile any more. profile_visible stays stored and unread so this can be reversed.
begin;
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();
 viewer uuid:=extensions.gen_random_uuid();no_row uuid:=extensions.gen_random_uuid();off_row uuid:=extensions.gen_random_uuid();blocked uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();gone uuid:=extensions.gen_random_uuid();
 u uuid;r jsonb;raised boolean;post uuid;leftover text[];
 p_passport uuid;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'all-public-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','전체 공개','소개','사진'),(creator,'en','All public','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'All public');
 foreach u in array array[viewer,no_row,off_row,blocked,sanctioned,gone] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:all-public-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'p'||left(u::text,8),'p'||left(u::text,8));
  insert into public.group_memberships(page_id,app_user_id)values(page,u);
 end loop;
 insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy)values(off_row,false,'requests');
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocked,viewer);
 update public.app_users set status='disabled' where id=gone;
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'전체 공개 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;

 -- No function decides anything from the stored setting any more.
 select array_agg(p.oid::regprocedure::text)into leftover from pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ '(^|[^_])profile_visible|\.profile_visible';
 if leftover is not null then raise exception 'Functions still read profile_visible: %',leftover;end if;
 select array_agg(n)into leftover from unnest(array['issue_admin_mobile_participation_qr','resolve_owned_mobile_participation_qr','mobile_content_clip_json','mobile_fan_public_support','read_group_public_people','read_group_public_ranking','read_owned_social_settings','read_public_mobile_profile_activities','read_social_fan_profile','read_social_fan_profile_before_mobile_profile','request_social_dm','request_social_friend'])n
  where not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=n and p.prosrc like '%social_profile_is_public%');
 if leftover is not null then raise exception 'Not routed through social_profile_is_public: %',leftover;end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='social_profile_settings' and column_name='profile_visible')then raise exception 'Column must stay for rollback';end if;

 -- Public list: members without a row and members who had it off are both listed. Fields stay the same.
 r:=public.read_group_public_people(null,page);
 if jsonb_array_length(r->'items')<>4 then raise exception 'Public list should hold viewer, no_row, off_row and blocked: %',r;end if;
 if (select array_agg(k order by k)from jsonb_object_keys(r#>'{items,0}')k)<>array['avatarUrl','nickname','tier'] then raise exception 'Public fields widened: %',r;end if;
 if r::text like '%@example.test%' or r::text like '%'||no_row||'%' then raise exception 'Identity leaked: %',r;end if;
 if jsonb_array_length(public.read_group_public_people(viewer,page)->'items')<>3 then raise exception 'Block no longer applied in the list';end if;

 -- Profile read and friend request open for someone who never turned it on, and for someone who turned it off.
 foreach u in array array[no_row,off_row] loop
  r:=public.read_social_fan_profile(viewer,u,null,'ko');
  if r is null or r#>>'{profile,id}'<>u::text then raise exception 'Profile closed for %',u;end if;
  if r#>>'{capabilities,canRequestFriend}'<>'true' then raise exception 'Friend request not offered for %',u;end if;
  if r::text like '%@example.test%' or r::text ~* 'wallet|verified_email|proof' then raise exception 'Private field in the profile: %',r;end if;
  r:=public.request_social_friend(viewer,u,null,extensions.gen_random_uuid());
  if r->>'status'<>'pending' then raise exception 'Friend request refused for %: %',u,r;end if;
 end loop;

 -- Activities, with the profile setting off. Public posts show for a favorite that member chose to show; a hidden favorite still shows nothing.
 insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(creator,off_row,'공개 글','public',extensions.gen_random_uuid(),repeat('a',64))returning id into post;
 r:=public.read_public_mobile_profile_activities(viewer,off_row,'all-public-fixture','ko',null,null,null,12);
 if r is null then raise exception 'Activity read closed by the profile setting';end if;
 if jsonb_array_length(r->'items')<>0 then raise exception 'Hidden favorite exposed activity: %',r;end if;
 insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(off_row,creator,true);
 r:=public.read_public_mobile_profile_activities(viewer,off_row,'all-public-fixture','ko',null,null,null,12);
 if jsonb_array_length(r->'items')<>1 or r#>>'{items,0,kind}'<>'fan_post' then raise exception 'Public post not shown: %',r;end if;

 -- Message requests also lost the profile condition.
 insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(viewer,creator,true);

 -- Blocks, sanctions and closed accounts still close the profile and the request.
 if public.read_social_fan_profile(viewer,blocked,null,'ko') is not null then raise exception 'Blocked profile opened';end if;
 raised:=false;begin perform public.request_social_friend(viewer,blocked,null,extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_BLOCKED';end;
 if not raised then raise exception 'Blocked friend request allowed';end if;
 if public.read_social_fan_profile(viewer,sanctioned,null,'ko') is not null then raise exception 'Sanctioned profile opened';end if;
 raised:=false;begin perform public.request_social_friend(viewer,sanctioned,null,extensions.gen_random_uuid());exception when others then raised:=true;end;
 if not raised or exists(select 1 from public.social_friendships where addressee_id=sanctioned) then raise exception 'Sanctioned friend request allowed';end if;
 if public.read_social_fan_profile(viewer,gone,null,'ko') is not null then raise exception 'Disabled profile opened';end if;
 raised:=false;begin perform public.request_social_friend(viewer,gone,null,extensions.gen_random_uuid());exception when others then raised:=true;end;
 if not raised then raise exception 'Disabled friend request allowed';end if;

 -- Old clients: reading says public, saving a false neither fails nor changes the stored value. Other settings still save.
 if public.read_owned_social_settings(off_row)->>'profileVisible'<>'true' then raise exception 'Settings still report private';end if;
 r:=public.set_owned_social_settings(off_row,false,array[]::text[],'friends');
 if r->>'profileVisible'<>'true' or r->>'dmPolicy'<>'friends' then raise exception 'Save response wrong: %',r;end if;
 if (select profile_visible from public.social_profile_settings where app_user_id=off_row) then raise exception 'Stored value changed';end if;
 perform public.set_owned_social_settings(no_row,true,array[]::text[],'requests');
 if (select profile_visible from public.social_profile_settings where app_user_id=no_row) then raise exception 'Old true was written to the stored value';end if;

 -- Rollback is one function body: restoring it brings back the stored setting everywhere.
 create or replace function public.social_profile_is_public(p_app_user_id uuid)returns boolean language sql stable security definer set search_path='' as $f$
  select coalesce((select s.profile_visible from public.social_profile_settings s where s.app_user_id=p_app_user_id),false)
 $f$;
 if public.read_social_fan_profile(viewer,no_row,null,'ko') is not null then raise exception 'Rollback did not close the profile';end if;
 if jsonb_array_length(public.read_group_public_people(null,page)->'items')<>0 then raise exception 'Rollback did not close the list';end if;
 raise notice 'PASS social profile all public';
end $$;
rollback;
