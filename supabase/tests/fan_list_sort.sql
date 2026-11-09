\set ON_ERROR_STOP on
begin;
create role fan_list_owner nologin nosuperuser nobypassrls;
grant usage on schema public,extensions to fan_list_owner;
create temp table original_fan_readers as select oid,pg_get_functiondef(oid)def from pg_proc where oid in(
 'public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure,
 'public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)'::regprocedure);
do $$
declare creator uuid:=extensions.gen_random_uuid(); page uuid:=extensions.gen_random_uuid(); hidden_page uuid:=extensions.gen_random_uuid();
 ids uuid[]:=array['a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000004','a9000000-0000-4000-8000-000000000005','a9000000-0000-4000-8000-000000000006','a9000000-0000-4000-8000-000000000007','a9000000-0000-4000-8000-000000000008'];
 i integer;r jsonb;page_result jsonb;position jsonb;names text[];raised boolean;before_result jsonb;all_rows jsonb:='[]';
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'fan-list-sort-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','정렬 시험','소개','사진'),(creator,'en','Sort fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Sort fixture');
 insert into public.group_pages(id,kind,name,anonymous)values(hidden_page,'hobby','Anonymous fixture',true);
 for i in 1..8 loop
  insert into public.app_users(id,privy_user_id,verified_email)values(ids[i],'did:privy:fan-sort-'||i,'sort-'||i||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(ids[i],'sort-'||i,'sort-'||i);
  insert into public.group_memberships(page_id,app_user_id,joined_at)values(page,ids[i],'2026-10-01'),(hidden_page,ids[i],'2026-10-01');
  insert into public.social_profile_settings(app_user_id,profile_visible)values(ids[i],i<>7);
 end loop;
 -- 1: zero, 2: one heart/no stamp, 3: one heart/one stamp, 4,5: same values+activity (UUID tie), 6: two hearts.
 -- Replica mode only in this rolled-back fixture, to seed immutable reward ledgers and unrelated source FKs.
 set local session_replication_role=replica;
 update public.app_users set status='disabled' where id=ids[7];
 for i in 2..8 loop
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)values(creator,ids[i],1,'passport_page_claim',extensions.gen_random_uuid(),'2026-10-05');
 end loop;
 insert into public.fan_heart_conversions(app_user_id,celebrity_id,stamps_counted,hearts,remainder,cutoff_at,converted_at)values(ids[6],creator,9,1,0,'2026-10-01','2026-10-02');
 for i in 3..5 loop
  insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,blockchain_job_id,issued_at)values(ids[i],creator,'daily_checkin','sort-test-'||i,extensions.gen_random_uuid(),case when i=3 then '2026-10-06'::timestamptz else '2026-10-07'::timestamptz end);
 end loop;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(ids[8],extensions.gen_random_uuid(),'팬 목록 정렬 시험 제재입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 r:=public.read_group_fans(null,page);
 select array_agg(x->>'nickname')into names from jsonb_array_elements(r->'items')x;
 if names<>array['sort-6','sort-4','sort-5','sort-3','sort-2','sort-1'] then raise exception 'ORDER/tie-break: %',r;end if;
 if r#>>'{items,0,first_jjinfan_at}' is null or (r#>>'{items,0,first_jjinfan_at}')::timestamptz<>'2026-10-02'::timestamptz then raise exception 'MIN conversion timestamp: %',r;end if;
 if (r#>>'{items,1,first_jjinfan_at}')::timestamptz<>'2026-10-05'::timestamptz then raise exception 'MIN ledger timestamp';end if;
 if r#>'{items,5,hearts}'<>'0'::jsonb or r#>'{items,5,stamps}'<>'0'::jsonb or r#>'{items,5,first_jjinfan_at}'<>'null'::jsonb then raise exception 'ZERO fields: %',r;end if;
 if exists(select 1 from jsonb_array_elements(r->'items')x where (select array_agg(k order by k)from jsonb_object_keys(x)k)<>array['avatarUrl','first_jjinfan_at','hearts','last_active_at','nickname','stamps','tier'])then raise exception 'ROW PRIVACY: %',r;end if;
 -- Every cursor key uses stored values, so deleting the anchor membership cannot lose the next page.
 position:=null;
 loop
  page_result:=public.read_group_fans(null,page,'members','',position,2);
  all_rows:=all_rows||(page_result->'items');
  position:=nullif(page_result->'nextCursor','null'::jsonb);
  exit when position is null;
 end loop;
 if all_rows<>r->'items' then raise exception 'CURSOR missing/duplicate rows: %',all_rows;end if;
 page_result:=public.read_group_fans(null,page,'members','',null,2);
 position:=page_result->'nextCursor';
 delete from public.group_memberships where page_id=page and app_user_id=ids[4];
 if public.read_group_fans(null,page,'members','',position,2)#>>'{items,0,nickname}'<>'sort-5' then raise exception 'Deleted cursor anchor lost rows';end if;
 insert into public.group_memberships(page_id,app_user_id,joined_at)values(page,ids[4],'2026-10-01');
 if jsonb_array_length(public.read_group_fans(null,page,'jjinfans')->'items')<>5 then raise exception 'JJINFAN filter';end if;
 if public.read_group_fans(null,page,'jjinfans','sort-1')->'items'<>'[]'::jsonb then raise exception 'Search applied after limit/filter';end if;
 if public.read_group_fans(null,page,'members','sort-1',null,1)#>>'{items,0,nickname}'<>'sort-1' then raise exception 'Search before pagination';end if;
 if public.read_group_fans(null,hidden_page)->'items'<>'[]'::jsonb then raise exception 'Anonymous names';end if;
 raised:=false;begin perform public.read_group_fans(null,page,'friends');exception when others then raised:=sqlerrm='GROUPS_FORBIDDEN';end;
 if not raised then raise exception 'Anonymous friends allowed';end if;
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash)values(ids[1],ids[2],'accepted',extensions.gen_random_uuid(),'fixture');
 if public.read_group_fans(ids[1],page,'friends')#>>'{items,0,nickname}'<>'sort-2' then raise exception 'Friends filter';end if;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(ids[2],ids[1]);
 if public.read_group_fans(ids[1],page,'friends')->'items'<>'[]'::jsonb then raise exception 'Blocked friend named';end if;
 before_result:=public.read_group_fans(ids[1],page);
 -- Ordinary owner + FORCE RLS: same result, and missing permissions fail explicitly.
 alter function public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale)owner to fan_list_owner;
 alter function public.heart_totals()owner to fan_list_owner;
 raised:=false;begin perform public.group_public_directory_owner_check();exception when others then raised:=sqlerrm like 'PUBLIC_DIRECTORY_OWNER_GAP%';end;
 if not raised then raise exception 'OWNER_GAP missing';end if;
 perform public.group_public_directory_owner_access();perform public.group_public_directory_owner_check();
 if not has_table_privilege('fan_list_owner','public.creator_heart_ledger','select') or not has_table_privilege('fan_list_owner','public.community_stamps','select') then raise exception 'OWNER grants missing';end if;
 execute 'set local role service_role';r:=public.read_group_fans(ids[1],page);execute 'reset role';
 if r<>before_result then raise exception 'OWNER result changed: %',r;end if;
 raised:=false;begin execute 'set local role anon';perform public.read_group_fans(null,page);exception when insufficient_privilege then raised:=true;end;execute 'reset role';
 if not raised then raise exception 'anon direct RPC';end if;
 raise notice 'PASS fan_list_sort: order, tie-break, keyset, deleted anchor, filter, first heart, zeros, privacy, block, owner';
end $$;
rollback;
\ir ../rollback/20261220090000_fan_list_sort.sql
do $$begin
 if to_regprocedure('public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale)') is not null then raise exception 'rollback left reader';end if;
 if to_regprocedure('public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)') is null then raise exception 'rollback removed legacy';end if;
 raise notice 'PASS fan_list_sort rollback';
end $$;
\ir ../migrations/20261220090000_fan_list_sort.sql
