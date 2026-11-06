\set ON_ERROR_STOP on
-- AWS mixes owners. A definer owner that is neither superuser nor BYPASSRLS sees no row of a FORCE RLS table with no policy for it,
-- so a filter on such a table passes everyone silently. This moves the definers onto such an owner and pins that the reads work and still exclude people.
begin;
\ir group_scope_fixture.sql
\ir group_public_ranking_open_fixture.sql
create role public_dir_owner_fixture nologin nosuperuser nobypassrls;
grant usage on schema public,extensions to public_dir_owner_fixture;
create function pg_temp.sig() returns text[] language sql as $$ select array['public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)','public.read_group_public_rooms(uuid,uuid)','public.read_group_public_ranking(uuid,uuid)','public.group_public_visible_page(uuid,uuid)','public.social_profile_is_public(uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)'] $$;
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();anon_page uuid:=extensions.gen_random_uuid();
 shown uuid:=extensions.gen_random_uuid();private_row uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();
 u uuid;period date;f text;state text;msg text;result jsonb;raised boolean;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'group-public-owner-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','소유자 검증','소개','사진'),(creator,'en','Owner fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Owner fixture');
 insert into public.group_pages(id,kind,name,anonymous)values(anon_page,'hobby','Anonymous owner fixture',true);
 foreach u in array array[shown,private_row,sanctioned,blocker,viewer] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:group-owner-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'o'||left(u::text,8),'o'||left(u::text,8));
  insert into public.group_memberships(page_id,app_user_id)values(page,u);
 end loop;
 insert into public.group_memberships(page_id,app_user_id)values(anon_page,shown);
 insert into public.social_profile_settings(app_user_id,profile_visible)values(shown,true),(sanctioned,true),(blocker,true),(viewer,true),(private_row,false);
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'소유자 시험용 제재 사유입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 select w.period_start into period from public.ranking_period_window('all',now())w;
 perform pg_temp.open_fan_ranking(creator);
 insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)values('fan_contribution',creator,'all',period,now(),(select jsonb_agg(jsonb_build_object('rank',n,'subjectId',x,'score',100-n,'achievedAt',now())order by n)from unnest(array[shown,sanctioned,blocker])with ordinality t(x,n)));

 -- Move the definers, and the block check, onto the ordinary owner. The moved block function must not be able to lift a block.
 foreach f in array pg_temp.sig() loop execute format('alter function %s owner to public_dir_owner_fixture',f);end loop;
 alter function public.fan_web_blocked(uuid,uuid) owner to public_dir_owner_fixture;
 alter function public.group_scope_visible(uuid,uuid) owner to public_dir_owner_fixture;

 -- Before access is set up the gap check fails instead of letting the migration pass quietly.
 raised:=false;begin perform public.group_public_directory_owner_check();exception when others then raised:=sqlerrm like 'PUBLIC_DIRECTORY_OWNER_GAP%';end;
 if not raised then raise exception 'Owner gap not reported';end if;
 raised:=false;begin execute 'set local role service_role';perform public.read_group_public_people(null,page);exception when others then get stacked diagnostics state=returned_sqlstate;raised:=state='42501';end;
 execute 'reset role';
 if not raised then raise exception 'Expected 42501 without access, got %',state;end if;

 perform public.group_public_directory_owner_access();
 perform public.group_public_directory_owner_check();
 if exists(select 1 from pg_policy p join pg_roles r on r.oid=any(p.polroles) where p.polname like 'public_directory_owner_%' and r.rolname in('anon','authenticated','service_role'))then raise exception 'Policy granted to a client role';end if;

 execute 'set local role service_role';
 result:=public.read_group_public_people(null,page);
 execute 'reset role';
 if jsonb_array_length(result->'items')<>4 then raise exception 'Signed-out list wrong under an ordinary owner: %',result;end if;
 if result::text like '%'||left(sanctioned::text,8)||'%' then raise exception 'Excluded member listed under an ordinary owner: %',result;end if;
 execute 'set local role service_role';
 result:=public.read_group_public_people(viewer,page);
 execute 'reset role';
 if result::text like '%'||left(blocker::text,8)||'%' or jsonb_array_length(result->'items')<>3 then raise exception 'Block lifted under an ordinary owner: %',result;end if;
 execute 'set local role service_role';
 result:=public.read_group_public_people(null,anon_page);
 execute 'reset role';
 if jsonb_array_length(result->'items')<>0 then raise exception 'Anonymous page named members under an ordinary owner';end if;
 execute 'set local role service_role';
 result:=public.read_group_public_rooms(null,page);
 execute 'reset role';
 if (result->>'roomCount')::integer<3 then raise exception 'Rooms missing under an ordinary owner: %',result;end if;
 execute 'set local role service_role';
 result:=public.read_group_public_ranking(viewer,page);
 execute 'reset role';
 if (select array_agg((v->>'rank')::integer)from jsonb_array_elements(result->'rows')v) is distinct from array[1] then raise exception 'Ranking exclusions failed under an ordinary owner: %',result;end if;
 -- The page ranking itself must not lift a block or a sanction under this owner.
 execute 'set local role service_role';
 result:=public.read_page_ranking(creator,'fan_contribution','all',viewer);
 execute 'reset role';
 if (select array_agg((v->>'rank')::integer)from jsonb_array_elements(result->'rows')v) is distinct from array[1] then raise exception 'Page ranking exclusions failed under an ordinary owner: %',result->'rows';end if;
 raise notice 'PASS group public directory owner';
end $$;
rollback;
