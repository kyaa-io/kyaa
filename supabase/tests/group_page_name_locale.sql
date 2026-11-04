-- Disposable cluster only: builds stand-in tables and a stand-in groups_dispatch carrying the real search filter text,
-- applies migration 20261209080000, and asserts names per locale. Run: psql -v ON_ERROR_STOP=1 -d byus_name_locale -f this file.
do $$begin if current_database()<>'byus_name_locale' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_name_locale required';end if;end $$;
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create type public.content_locale as enum('ko','en');
create table public.celebrities(id uuid primary key,slug text not null);
create table public.celebrity_localizations(celebrity_id uuid references public.celebrities,locale public.content_locale,name text,primary key(celebrity_id,locale));
create table public.app_users(id uuid primary key,status text);
create table public.group_pages(id uuid primary key,kind text,celebrity_id uuid,name text,description text,image_url text,question text,anonymous boolean default false);
create table public.group_memberships(page_id uuid,app_user_id uuid);
create function public.group_page_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'name',g.name,'old',true) from public.group_pages g where g.id=p_id $$;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_operation='directory' then
  return (select coalesce(jsonb_agg(public.group_page_json(gp.id) order by gp.name),'[]'::jsonb) from public.group_pages gp where (p_input->>'search') is null or gp.name ilike '%'||(p_input->>'search')||'%');
 end if;
 return public.group_page_json(p_page_id);
end $$;

\i ../migrations/20261209080000_group_page_name_locale.sql

begin;
insert into public.celebrities values('a0000000-0000-4000-8000-000000000001','nchive'),('a0000000-0000-4000-8000-000000000002','elina'),('a0000000-0000-4000-8000-000000000003','solo');
insert into public.celebrity_localizations values('a0000000-0000-4000-8000-000000000001','ko','엔카이브'),('a0000000-0000-4000-8000-000000000001','en','NCHIVE'),('a0000000-0000-4000-8000-000000000002','ko','엘리나');
insert into public.group_pages(id,kind,celebrity_id,name) values
 ('b0000000-0000-4000-8000-000000000001','fan','a0000000-0000-4000-8000-000000000001','엔카이브 팬페이지'),
 ('b0000000-0000-4000-8000-000000000002','fan','a0000000-0000-4000-8000-000000000002','엘리나 팬페이지'),
 ('b0000000-0000-4000-8000-000000000003','fan','a0000000-0000-4000-8000-000000000003',''),
 ('b0000000-0000-4000-8000-000000000004','hobby',null,'한강 러닝 크루'),
 ('b0000000-0000-4000-8000-000000000005','brand','a0000000-0000-4000-8000-000000000001','NCHIVE 브랜드 모임');
create function pg_temp.ok(c boolean,m text) returns void language plpgsql as $$begin if c is distinct from true then raise exception 'FAIL %',m;end if;end $$;
do $$declare n1 uuid:='b0000000-0000-4000-8000-000000000001';n2 uuid:='b0000000-0000-4000-8000-000000000002';n3 uuid:='b0000000-0000-4000-8000-000000000003';h uuid:='b0000000-0000-4000-8000-000000000004';b uuid:='b0000000-0000-4000-8000-000000000005';
 names text;
begin
 -- no locale: stored name unchanged, one-argument call still resolves
 perform pg_temp.ok(public.group_page_json(n1)->>'name'='엔카이브 팬페이지','no locale keeps stored name');
 perform pg_temp.ok(public.group_page_name(n1)='엔카이브 팬페이지','name function without locale');
 -- per-locale names
 perform pg_temp.ok(public.group_page_name(n1,'ko')='엔카이브','ko localization');
 perform pg_temp.ok(public.group_page_name(n1,'en')='NCHIVE','en localization');
 perform pg_temp.ok(public.group_page_name(n1,'ja')='NCHIVE' and public.group_page_name(n1,'ru')='NCHIVE','other locales use en');
 -- fallback: requested -> en -> ko row -> stored name -> slug
 perform pg_temp.ok(public.group_page_name(n2,'ru')='엘리나','missing en falls back to ko localization row');
 perform pg_temp.ok(public.group_page_name(n2,'ko')='엘리나','ko row used when present');
 perform pg_temp.ok(public.group_page_name(n3,'en')='solo','empty stored name falls back to slug');
 -- user-authored and brand pages stay verbatim
 perform pg_temp.ok(public.group_page_name(h,'ru')='한강 러닝 크루' and public.group_page_name(b,'en')='NCHIVE 브랜드 모임','non-fan pages verbatim');
 -- json uses the same function
 perform pg_temp.ok(public.group_page_json(n1,'ja')->>'name'='NCHIVE','json name follows locale');
 -- dispatch: locale in input drives list and detail; setting is cleared afterwards
 perform pg_temp.ok((public.groups_dispatch('detail',null,n1,null,'{"locale":"ru"}'))->>'name'='NCHIVE','detail with locale');
 perform pg_temp.ok(coalesce(current_setting('app.group_locale',true),'')='','locale setting cleared');
 perform pg_temp.ok((public.groups_dispatch('detail',null,n1,null,'{}'))->>'name'='엔카이브 팬페이지','detail without locale unchanged');
 select string_agg(x->>'name',',' order by x->>'name') into names from jsonb_array_elements(public.groups_dispatch('directory',null,null,null,'{"locale":"en"}')) x;
 perform pg_temp.ok(names like '%NCHIVE%' and names not like '%엔카이브 팬페이지%','list names follow locale');
 -- search matches shown name and stored name
 perform pg_temp.ok(jsonb_array_length(public.groups_dispatch('directory',null,null,null,'{"locale":"en","search":"NCHIVE"}'))=2,'search by shown en name (fan + brand)');
 perform pg_temp.ok(jsonb_array_length(public.groups_dispatch('directory',null,null,null,'{"locale":"en","search":"엔카이브"}'))=1,'search by stored ko name');
 perform pg_temp.ok(jsonb_array_length(public.groups_dispatch('directory',null,null,null,'{"search":"한강"}'))=1,'search without locale');
 -- invalid locale string is ignored
 perform pg_temp.ok((public.groups_dispatch('detail',null,n1,null,'{"locale":"x; drop"}'))->>'name'='엔카이브 팬페이지','invalid locale ignored');
 -- old one-argument signature is gone
 perform pg_temp.ok((select count(*) from pg_proc p where p.proname='group_page_json' and p.pronamespace='public'::regnamespace)=1,'single group_page_json overload');
end $$;
rollback;
select 'group_page_name_locale ok' as result;
