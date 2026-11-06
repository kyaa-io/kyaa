\set ON_ERROR_STOP on
begin;
\ir group_scope_fixture.sql
\ir group_public_ranking_open_fixture.sql
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();hobby uuid:=extensions.gen_random_uuid();
 shown uuid:=extensions.gen_random_uuid();private_row uuid:=extensions.gen_random_uuid();no_row uuid:=extensions.gen_random_uuid();gone uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();outsider uuid:=extensions.gen_random_uuid();
 anon_page uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();period date;wave uuid;result jsonb;item jsonb;i integer;u uuid;before_count bigint;custom uuid;raised boolean;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'group-public-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','공개 검증','소개','사진'),(creator,'en','Public fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Public fixture'),(hobby,'hobby',null,'Hobby fixture');
 foreach u in array array[shown,private_row,no_row,gone,blocker,viewer,outsider,sanctioned] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:group-public-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'n'||left(u::text,8),'n'||left(u::text,8));
 end loop;
 update public.user_profiles set nickname='공개 팬',nickname_normalized='공개 팬' where app_user_id=shown;
 insert into public.group_memberships(page_id,app_user_id,joined_at)select page,x,now()from unnest(array[shown,private_row,no_row,gone,blocker,viewer,sanctioned])x;
 insert into public.group_pages(id,kind,name,anonymous)values(anon_page,'hobby','Anonymous fixture',true);
 insert into public.group_memberships(page_id,app_user_id,role)values(anon_page,shown,'owner'),(anon_page,viewer,'member');
 insert into public.social_profile_settings(app_user_id,profile_visible)values(shown,true),(private_row,false),(gone,true),(blocker,true),(outsider,true),(sanctioned,true);
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'공개 목록 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 update public.app_users set status='disabled' where id=gone;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);

 -- Signed-out reads: only opted-in active members, and only the whitelisted fields.
 result:=public.read_group_public_people(null,page);
 if jsonb_array_length(result->'items')<>5 then raise exception 'Public list must hold active unsanctioned members: %',result;end if;
 for item in select value from jsonb_array_elements(result->'items') loop
  if (select array_agg(k order by k) from jsonb_object_keys(item) k)<>array['avatarUrl','nickname','tier'] then raise exception 'Field whitelist broken: %',item;end if;
 end loop;
 if (select array_agg(k order by k) from jsonb_object_keys(result) k)<>array['items','nextOffset'] then raise exception 'Envelope whitelist broken: %',result;end if;
 if result::text ~ (left(shown::text,8)||'-') or result::text like '%@example.test%' then raise exception 'Identifier leaked: %',result;end if;
 if not exists(select 1 from jsonb_array_elements(result->'items')v where v->>'nickname'='공개 팬') then raise exception 'Opted-in fan missing: %',result;end if;

 -- A signed-in viewer never sees a person in a bilateral block, on either side.
 result:=public.read_group_public_people(viewer,page);
 if jsonb_array_length(result->'items')<>4 or result::text like '%'||left(blocker::text,8)||'%' then raise exception 'Blocked member shown to viewer: %',result;end if;

 -- Sanctioned members and every member of an anonymous page stay out, signed in or not.
 if public.read_group_public_people(null,page)::text like '%'||left(sanctioned::text,8)||'%' then raise exception 'Sanctioned member listed';end if;
 result:=public.read_group_public_people(null,anon_page);
 if jsonb_array_length(result->'items')<>0 or result->>'nextOffset' is not null then raise exception 'Anonymous page named members: %',result;end if;
 if jsonb_array_length(public.read_group_public_people(viewer,anon_page)->'items')<>0 then raise exception 'Anonymous page named members to a signed-in viewer';end if;

 -- The fan ranking tab gets the same exclusions from a published snapshot. Ranks stay as computed, ids stay out.
 perform pg_temp.open_fan_ranking(creator);
 select w.period_start into period from public.ranking_period_window('all',now())w;
 insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)values('fan_contribution',creator,'all',period,now(),(select jsonb_agg(jsonb_build_object('rank',n,'subjectId',x,'score',100-n,'achievedAt',now())order by n)from unnest(array[private_row,shown,sanctioned,gone,blocker])with ordinality t(x,n)));
 result:=public.read_group_public_ranking(null,page);
 if (select array_agg((v->>'rank')::integer order by (v->>'rank')::integer)from jsonb_array_elements(result->'rows')v)<>array[1,2,5] then raise exception 'Ranking exclusions wrong: %',result;end if;
 if (select array_agg(k order by k)from jsonb_object_keys(result#>'{rows,0}')k)<>array['characterId','nickname','rank','score'] then raise exception 'Ranking field whitelist broken: %',result;end if;
 if (select array_agg(k order by k)from jsonb_object_keys(result)k)<>array['computedAt','rows'] then raise exception 'Ranking envelope broken: %',result;end if;
 if result::text ~ left(shown::text,8) then raise exception 'Ranking leaked an id: %',result;end if;
 result:=public.read_group_public_ranking(viewer,page);
 if (select array_agg((v->>'rank')::integer order by (v->>'rank')::integer)from jsonb_array_elements(result->'rows')v)<>array[1,2] then raise exception 'Ranking showed a blocked person: %',result;end if;
 update public.group_pages set anonymous=true where id=page;
 if jsonb_array_length(public.read_group_public_ranking(null,page)->'rows')<>0 then raise exception 'Anonymous page ranking named fans';end if;
 update public.group_pages set anonymous=false where id=page;
 if jsonb_array_length(public.read_group_public_ranking(null,hobby)->'rows')<>0 or public.read_group_public_ranking(null,hobby)->>'computedAt' is not null then raise exception 'Hobby ranking invented rows';end if;

 -- Bounds are enforced in SQL too, not only by the route.
 foreach i in array array[0,31,-1] loop
  raised:=false;begin perform public.read_group_public_people(null,page,0,i);exception when others then raised:=sqlerrm='GROUPS_INVALID_REQUEST';end;
  if not raised then raise exception 'Limit % accepted',i;end if;
 end loop;
 foreach i in array array[-1,271] loop
  raised:=false;begin perform public.read_group_public_people(null,page,i,30);exception when others then raised:=sqlerrm='GROUPS_INVALID_REQUEST';end;
  if not raised then raise exception 'Offset % accepted',i;end if;
 end loop;

 -- Paging walks the list once and stops at the published ceiling.
 for i in 1..305 loop
  u:=extensions.gen_random_uuid();
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:group-public-bulk-'||u,u||'@example.test');
    insert into public.group_memberships(page_id,app_user_id,joined_at)values(page,u,now()+i*interval'1 second');
 end loop;
 result:=public.read_group_public_people(null,page,0,1);
 if jsonb_array_length(result->'items')<>1 or (result->>'nextOffset')::integer<>1 then raise exception 'First page invalid: %',result;end if;
 result:=public.read_group_public_people(null,page,270,30);
 if jsonb_array_length(result->'items')<>30 or result->>'nextOffset' is not null then raise exception 'Ceiling not enforced: %',result->>'nextOffset';end if;

 -- Rooms: name, count and minimum tier only. Reading must not create the default rooms.
 select count(*)into before_count from public.group_rooms where page_id=page;
 result:=public.read_group_public_rooms(null,page);
 if (select count(*)from public.group_rooms where page_id=page)<>before_count then raise exception 'Public room read wrote rows';end if;
 if (result->>'roomCount')::integer<>3 or jsonb_array_length(result->'items')<>3 then raise exception 'Default rooms missing: %',result;end if;
 if (select array_agg(k order by k) from jsonb_object_keys(result#>'{items,0}') k)<>array['minimumTier','name'] then raise exception 'Room field whitelist broken: %',result;end if;
 if not exists(select 1 from jsonb_array_elements(result->'items')v where v->>'name'='자유 소통방' and v->'minimumTier'='null'::jsonb) then raise exception 'Free room shape invalid: %',result;end if;

 insert into public.group_rooms(page_id,name,minimum_tier)values(page,'비밀 시험방','Gold')returning id into custom;
 insert into public.group_messages(room_id,author_id,body)values(custom,shown,'방 안의 비밀 글');
 insert into public.group_rooms(page_id,name,minimum_tier,status)values(page,'닫힌 방','Gold','closed');
 insert into public.group_rooms(page_id,name,minimum_tier,closes_at)values(page,'끝난 방','Gold',now()-interval'1 day');
 result:=public.read_group_public_rooms(null,page);
 if (result->>'roomCount')::integer<>4 then raise exception 'Closed rooms counted: %',result;end if;
 if result::text like '%비밀 글%' or result::text like '%닫힌 방%' or result::text like '%끝난 방%' or result::text like '%'||custom||'%' then raise exception 'Room internals leaked: %',result;end if;
 if not exists(select 1 from jsonb_array_elements(result->'items')v where v->>'name'='비밀 시험방' and v->>'minimumTier'='Gold') then raise exception 'Custom room missing: %',result;end if;

 -- Pages with no default rooms stay empty rather than inventing any.
 result:=public.read_group_public_rooms(null,hobby);
 if (result->>'roomCount')::integer<>0 or jsonb_array_length(result->'items')<>0 then raise exception 'Hobby rooms invented: %',result;end if;

 -- Hidden pages stay hidden for both reads.
 wave:=pg_temp.group_scope_fixture(viewer,false);
 update public.group_pages set status='hidden' where id=hobby;
 foreach u in array array[wave,hobby,extensions.gen_random_uuid()] loop
  raised:=false;begin perform public.read_group_public_people(null,u);exception when others then raised:=sqlerrm='GROUPS_NOT_FOUND';end;
  if not raised then raise exception 'Hidden page % listed fans',u;end if;
  raised:=false;begin perform public.read_group_public_rooms(null,u);exception when others then raised:=sqlerrm='GROUPS_NOT_FOUND';end;
  if not raised then raise exception 'Hidden page % listed rooms',u;end if;
  raised:=false;begin perform public.read_group_public_ranking(null,u);exception when others then raised:=sqlerrm='GROUPS_NOT_FOUND';end;
  if not raised then raise exception 'Hidden page % listed a ranking',u;end if;
 end loop;

 -- A checked-in viewer still reaches the wave page, so the inlined rule matches group_scope_visible.
 perform pg_temp.group_scope_fixture(viewer,true);
 perform public.read_group_public_rooms(viewer,wave);
 if not public.group_scope_visible(viewer,wave) then raise exception 'Fixture wave check-in did not apply';end if;

 -- Only the service role may call these; the route is the sole public door.
 foreach item in array array['"anon"'::jsonb,'"authenticated"'::jsonb] loop
  if has_function_privilege(item#>>'{}','public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)','execute')
   or has_function_privilege(item#>>'{}','public.read_group_public_rooms(uuid,uuid)','execute') then raise exception 'Role % may execute',item;end if;
 end loop;
 if not has_function_privilege('service_role','public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)','execute')
  or not has_function_privilege('service_role','public.read_group_public_rooms(uuid,uuid)','execute') then raise exception 'Service role cannot execute';end if;
 raise notice 'PASS group public directory';
end $$;
rollback;
