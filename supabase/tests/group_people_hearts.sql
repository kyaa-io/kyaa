\set ON_ERROR_STOP on
-- Hearts in the fan lists: the plain signed-out reader keeps its exact shape for the deployed web, the new reader adds only hearts,
-- and every exclusion holds under an ordinary definer owner too. Replay runs as a superuser, so the ordinary owner is built here.
begin;
\ir group_scope_fixture.sql
create role people_hearts_owner nologin nosuperuser nobypassrls;
grant usage on schema public,extensions to people_hearts_owner;
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();hobby uuid:=extensions.gen_random_uuid();anon_page uuid:=extensions.gen_random_uuid();
 shown uuid:=extensions.gen_random_uuid();empty_fan uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();hidden_fan uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();
 u uuid;result jsonb;raised boolean;state text;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'people-hearts-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','하트 검증','소개','사진'),(creator,'en','Hearts fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Hearts fixture');
 insert into public.group_pages(id,kind,name)values(hobby,'hobby','Hobby hearts');
 insert into public.group_pages(id,kind,name,anonymous)values(anon_page,'hobby','Anonymous hearts',true);
 foreach u in array array[shown,empty_fan,sanctioned,hidden_fan,blocker,viewer] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:people-hearts-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,left(u::text,8),left(u::text,8));
  insert into public.group_memberships(page_id,app_user_id)values(page,u),(hobby,u),(anon_page,u);
  insert into public.social_profile_settings(app_user_id,profile_visible)values(u,u<>hidden_fan);
 end loop;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);
 set local session_replication_role=replica;
 insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id)values
  (creator,shown,1,'passport_page_claim',extensions.gen_random_uuid()),(creator,shown,1,'passport_page_claim',extensions.gen_random_uuid()),
  (creator,sanctioned,1,'passport_page_claim',extensions.gen_random_uuid());
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'하트 목록 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;

 -- The deployed web parses this reader strictly: exactly these keys, forever.
 result:=public.read_group_public_people(null,page);
 if exists(select 1 from jsonb_array_elements(result->'items')i where (select array_agg(k order by k)from jsonb_object_keys(i)k)<>array['avatarUrl','nickname','tier'])then raise exception 'Plain reader changed shape: %',result;end if;

 result:=public.read_group_public_people_hearts(null,page);
 if exists(select 1 from jsonb_array_elements(result->'items')i where (select array_agg(k order by k)from jsonb_object_keys(i)k)<>array['avatarUrl','hearts','nickname','tier'])then raise exception 'New reader has other keys: %',result;end if;
 if (select(i->>'hearts')::integer from jsonb_array_elements(result->'items')i where i->>'nickname'=left(shown::text,8))<>2 then raise exception 'Hearts wrong: %',result;end if;
 -- A fan with no hearts is 0, not null, so the row still draws.
 if (select(i->>'hearts')::integer from jsonb_array_elements(result->'items')i where i->>'nickname'=left(empty_fan::text,8))<>0 then raise exception 'Empty fan not 0: %',result;end if;
 if result::text like '%'||left(sanctioned::text,8)||'%' then raise exception 'Excluded fan listed: %',result;end if;
 if jsonb_array_length(public.read_group_public_people_hearts(viewer,page)->'items')<>jsonb_array_length(result->'items')-1 then raise exception 'Block not applied';end if;
 if public.read_group_public_people_hearts(viewer,page)::text like '%'||left(blocker::text,8)||'%' then raise exception 'Blocked fan listed';end if;
 -- Hobby pages have no grade and no hearts, anonymous pages name nobody.
 if exists(select 1 from jsonb_array_elements(public.read_group_public_people_hearts(null,hobby)->'items')i where i->'hearts'<>'null'::jsonb)then raise exception 'Hobby page has hearts';end if;
 if jsonb_array_length(public.read_group_public_people_hearts(null,anon_page)->'items')<>0 then raise exception 'Anonymous page named members';end if;

 -- Signed-in list: the key only. A member of an anonymous page learns nobody's hearts.
 result:=public.read_group_people(shown,page,'members','',null,30,'ko');
 if (select(i->>'hearts')::integer from jsonb_array_elements(result->'items')i where i->>'nickname'=left(shown::text,8))<>2 then raise exception 'Member list hearts wrong: %',result;end if;
 if result::text like '%'||left(sanctioned::text,8)||'%' then raise exception 'Sanctioned fan in member list: %',result;end if;
 result:=public.read_group_people(shown,anon_page,'members','',null,30,'ko');
 if exists(select 1 from jsonb_array_elements(result->'items')i where i->'hearts'<>'null'::jsonb)then raise exception 'Anonymous page gave hearts: %',result;end if;

 -- Only the service role calls it.
 raised:=false;begin execute 'set local role anon';perform public.read_group_public_people_hearts(null,page);exception when others then get stacked diagnostics state=returned_sqlstate;raised:=state='42501';end;
 execute 'reset role';
 if not raised then raise exception 'anon may read: %',state;end if;

 -- An ordinary owner: reports the gap, then works the same after the access step, with the exclusions intact.
 alter function public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale) owner to people_hearts_owner;
 alter function public.passport_hearts(uuid,uuid) owner to people_hearts_owner;
 alter function public.fan_web_blocked(uuid,uuid) owner to people_hearts_owner;
 alter function public.group_scope_visible(uuid,uuid) owner to people_hearts_owner;
 raised:=false;begin perform public.group_public_directory_owner_check();exception when others then raised:=sqlerrm like 'PUBLIC_DIRECTORY_OWNER_GAP%';end;
 if not raised then raise exception 'Owner gap not reported';end if;
 perform public.group_public_directory_owner_access();
 perform public.group_public_directory_owner_check();
 execute 'set local role service_role';
 result:=public.read_group_public_people_hearts(viewer,page);
 execute 'reset role';
 if (select(i->>'hearts')::integer from jsonb_array_elements(result->'items')i where i->>'nickname'=left(shown::text,8))<>2 then raise exception 'Hearts lost under an ordinary owner: %',result;end if;
 if result::text like '%'||left(sanctioned::text,8)||'%' or result::text like '%'||left(blocker::text,8)||'%' then raise exception 'Exclusion lost under an ordinary owner: %',result;end if;
 raise notice 'PASS group people hearts';
end $$;
rollback;

-- The rollback stands on the current definitions, and the plain reader and the member list go back to their old shape.
\ir ../rollback/20261213040000_group_people_hearts.sql
do $$
begin
 if to_regprocedure('public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale)') is not null then raise exception 'Rollback left the reader';end if;
 if pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure) like '%passport_hearts%' then raise exception 'Rollback left member hearts';end if;
 raise notice 'PASS group people hearts rollback';
end $$;
