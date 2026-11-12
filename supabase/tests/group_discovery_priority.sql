\set ON_ERROR_STOP on
begin;
\ir group_scope_fixture.sql
do $$
declare r jsonb; t text; ids uuid[]; expected uuid[]; cur text; before_recent jsonb; before_popular jsonb;
begin
 delete from public.group_discovery_priority;
 for i in 1..4 loop
  insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role)
   values('priority-fixture-'||i,'published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
   select id,'ko','Priority fixture '||i,'소개','사진' from public.celebrities where slug='priority-fixture-'||i;
  insert into public.group_pages(id,kind,celebrity_id,name)
   select id,'fan',id,'Priority fixture '||i from public.celebrities where slug='priority-fixture-'||i;
 end loop;
 select array_agg(id order by slug) into expected from public.celebrities where slug like 'priority-fixture-%' and slug<>'priority-fixture-4';
 before_recent:=public.groups_dispatch('directory',null,null,null,'{"sort":"recent","search":"Priority fixture","limit":50}',null);
 before_popular:=public.groups_dispatch('directory',null,null,null,'{"sort":"popular","search":"Priority fixture","limit":50}',null);
 insert into public.group_discovery_priority values('priority-fixture-1',1),('priority-fixture-2',2),('priority-fixture-3',3);
 foreach t in array array['all','fan'] loop
  r:=public.groups_dispatch('directory',null,null,null,jsonb_build_object('sort','discovery','type',t,'search','Priority fixture','limit',2),null);
  select array_agg((v->>'id')::uuid order by n) into ids from jsonb_array_elements(r->'items') with ordinality x(v,n);
  if ids<>expected[1:2] then raise exception 'pin order %: %',t,r; end if;
  cur:=r->>'nextCursor';
  r:=public.groups_dispatch('directory',null,null,null,jsonb_build_object('sort','discovery','type',t,'search','Priority fixture','limit',2,'cursor',cur),null);
  if r#>>'{items,0,id}'<>expected[3]::text then raise exception 'pin cursor %',r; end if;
 end loop;
 if before_recent<>public.groups_dispatch('directory',null,null,null,'{"sort":"recent","search":"Priority fixture","limit":50}',null) then raise exception 'recent changed'; end if;
 if before_popular<>public.groups_dispatch('directory',null,null,null,'{"sort":"popular","search":"Priority fixture","limit":50}',null) then raise exception 'popular changed'; end if;
 if has_table_privilege('authenticated','public.group_discovery_priority','UPDATE') then raise exception 'public write'; end if;
end $$;
rollback;
