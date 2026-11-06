\set ON_ERROR_STOP on
-- The signed-out fan ranking opens under the same rule as the member one: 100 active fans. No second rule.
begin;
\ir group_scope_fixture.sql
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();anon_creator uuid:=extensions.gen_random_uuid();anon_page uuid:=extensions.gen_random_uuid();hobby uuid:=extensions.gen_random_uuid();
 ids uuid[]:='{}';u uuid;i integer;r jsonb;member jsonb;period date;c uuid;
begin
 foreach c in array array[creator,anon_creator] loop
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(c,'ranking-threshold-'||left(c::text,8),'published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(c,'ko','문턱','소개','사진'),(c,'en','Threshold','Summary','Photo');
 end loop;
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Threshold'),(anon_page,'fan',anon_creator,'Anonymous');
 update public.group_pages set anonymous=true where id=anon_page;
 insert into public.group_pages(id,kind,name)values(hobby,'hobby','Hobby');
 set local session_replication_role=replica;
 for i in 1..100 loop
  u:=extensions.gen_random_uuid();ids:=ids||u;
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:threshold-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'t'||i,'t'||i);
  insert into public.group_memberships(page_id,app_user_id)values(page,u);
 end loop;
 foreach c in array array[creator,anon_creator] loop
  select w.period_start into period from public.ranking_period_window('all',now())w;
  insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)
   select 'fan_contribution',c,'all',period,now(),jsonb_agg(jsonb_build_object('rank',n,'subjectId',ids[n],'score',100-n,'achievedAt',now())order by n)from generate_series(1,3)n;
 end loop;
 -- 99 active fans: closed, though a snapshot with names exists.
 for i in 1..99 loop insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at)values(extensions.gen_random_uuid(),ids[i],creator,extensions.gen_random_uuid(),now());end loop;
 set local session_replication_role=origin;
 member:=public.read_group_people(ids[1],page,'ranking');
 if member#>>'{ranking,available}'<>'false' then raise exception 'Fixture should sit under the member rule: %',member->'ranking';end if;
 r:=public.read_group_public_ranking(null,page);
 if r<>jsonb_build_object('computedAt',null,'rows','[]'::jsonb,'available',false) then raise exception 'Signed-out ranking opened under the member rule: %',r;end if;
 if public.read_group_public_ranking(ids[100],page)<>r then raise exception 'A signed-in visitor saw something else';end if;
 -- The 100th fan opens both together. A response that is open has the same keys as before.
 set local session_replication_role=replica;
 insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at)values(extensions.gen_random_uuid(),ids[100],creator,extensions.gen_random_uuid(),now());
 set local session_replication_role=origin;
 if public.read_group_people(ids[1],page,'ranking')#>>'{ranking,available}'<>'true' then raise exception 'Fixture should open the member rule';end if;
 r:=public.read_group_public_ranking(null,page);
 if r ? 'available' or jsonb_array_length(r->'rows')<>3 then raise exception 'Open ranking changed: %',r;end if;
 -- Answers that were already empty stay as they were, and say nothing about the fan count of an anonymous page.
 r:=public.read_group_public_ranking(null,anon_page);
 if r ? 'available' or jsonb_array_length(r->'rows')<>0 then raise exception 'Anonymous page: %',r;end if;
 r:=public.read_group_public_ranking(null,hobby);
 if r<>jsonb_build_object('computedAt',null,'rows','[]'::jsonb) then raise exception 'Hobby page: %',r;end if;
 raise notice 'PASS public ranking follows the member threshold';
end $$;
rollback;
