\set ON_ERROR_STOP on
-- dev keeps read_jjinfan_challenge under postgres while the applying role byus_admin owns the campaign table, and postgres is no superuser.
-- The replay runs as a superuser, so it never saw the public read answer permission denied. These roles reproduce that split.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
create role jj_table_owner nosuperuser nologin;
create role jj_fn_bypass nosuperuser bypassrls nologin;
create role jj_fn_plain nosuperuser nobypassrls nologin;
grant usage on schema public to jj_table_owner, jj_fn_bypass, jj_fn_plain;
grant select on public.celebrities, public.jjinfan_titles, public.app_users to jj_fn_bypass, jj_fn_plain;
create policy jj_fn_plain_reads_creators on public.celebrities for select to jj_fn_plain using (true);

insert into public.app_users(id,privy_user_id,verified_email) values('fb120000-0000-4000-8000-000000000001','did:privy:jjowner-admin','jjowner-admin@example.test');
insert into public.admin_allowlist(id,email,role) values('fb120000-0000-4000-8000-000000000002','jjowner-admin@example.test','admin');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('fb120000-0000-4000-8000-000000000011','jjowner-on','draft','/images/x.png',null,'{creator}','singer'),
 ('fb120000-0000-4000-8000-000000000012','jjowner-off','draft','/images/x.png',null,'{creator}','singer'),
 ('fb120000-0000-4000-8000-000000000013','jjowner-unset','draft','/images/x.png',null,'{creator}','singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select c.id,l.locale::public.content_locale,'게이지','게이지 소개','게이지 사진' from public.celebrities c cross join (values('ko'),('en')) l(locale) where c.slug like 'jjowner-%';
update public.celebrities set status='published',published_at=now() where slug like 'jjowner-%';
insert into public.jjinfan_challenge_campaigns(celebrity_id,enabled,title,description,updated_by_admin_allowlist_id) values
 ('fb120000-0000-4000-8000-000000000011',true,'켜진 제목','켜진 설명','fb120000-0000-4000-8000-000000000002'),
 ('fb120000-0000-4000-8000-000000000012',false,'초안 제목','초안 설명','fb120000-0000-4000-8000-000000000002');
alter table public.jjinfan_challenge_campaigns owner to jj_table_owner;

create function pg_temp.read_as_service(p_celebrity uuid) returns jsonb language plpgsql as $$
declare result jsonb;
begin
 set local role service_role;
 result:=public.read_jjinfan_challenge(p_celebrity);
 reset role;
 return result;
exception when others then
 reset role;
 raise;
end $$;
create function pg_temp.expect_refused(label text) returns void language plpgsql as $$
begin
 perform pg_temp.read_as_service('fb120000-0000-4000-8000-000000000012');
 raise exception 'Expected permission denied: %',label;
exception when insufficient_privilege then null;
end $$;
create function pg_temp.expect_reads(label text) returns void language plpgsql as $$
declare v_on jsonb:=pg_temp.read_as_service('fb120000-0000-4000-8000-000000000011');
 v_off jsonb:=pg_temp.read_as_service('fb120000-0000-4000-8000-000000000012');
 v_unset jsonb:=pg_temp.read_as_service('fb120000-0000-4000-8000-000000000013');
begin
 if v_on<>'{"count":0,"target":100,"campaign":{"title":"켜진 제목","description":"켜진 설명"}}'::jsonb then raise exception 'on creator %: %',label,v_on; end if;
 if v_off<>'{"count":0,"target":100,"campaign":null}'::jsonb then raise exception 'off creator %: %',label,v_off; end if;
 if v_unset<>'{"count":0,"target":100,"campaign":null}'::jsonb then raise exception 'unset creator %: %',label,v_unset; end if;
end $$;
create function pg_temp.expect_narrow(role_name text) returns void language plpgsql as $$
begin
 if has_column_privilege(role_name,'public.jjinfan_challenge_campaigns','updated_by_admin_allowlist_id','select') then raise exception 'admin id readable by %',role_name; end if;
 if has_table_privilege(role_name,'public.jjinfan_challenge_campaigns','insert') or has_table_privilege(role_name,'public.jjinfan_challenge_campaigns','update') or has_table_privilege(role_name,'public.jjinfan_challenge_campaigns','delete') then raise exception 'write granted to %',role_name; end if;
 if has_table_privilege('service_role','public.jjinfan_challenge_campaigns','select') then raise exception 'service_role reads the table directly'; end if;
end $$;

-- RLS bypassing owner, the dev shape.
alter function public.read_jjinfan_challenge(uuid) owner to jj_fn_bypass;
select pg_temp.expect_refused('bypass owner before the fix');
\ir ../migrations/20261212081000_jjinfan_campaign_read_owner.sql
select pg_temp.expect_reads('bypass owner');
select pg_temp.expect_narrow('jj_fn_bypass');
do $$ begin
 if exists(select 1 from pg_policy where polrelid='public.jjinfan_challenge_campaigns'::regclass) then raise exception 'A bypassing owner needs no policy'; end if;
end $$;

-- Rollback brings the refusal back and leaves nothing behind.
\ir ../rollback/20261212081000_jjinfan_campaign_read_owner.sql
select pg_temp.expect_refused('bypass owner after rollback');
\ir ../migrations/20261212081000_jjinfan_campaign_read_owner.sql
select pg_temp.expect_reads('bypass owner after reapply');
\ir ../rollback/20261212081000_jjinfan_campaign_read_owner.sql

-- Owner bound by row security: same answers, and a draft stays out of its sight.
alter function public.read_jjinfan_challenge(uuid) owner to jj_fn_plain;
select pg_temp.expect_refused('plain owner before the fix');
\ir ../migrations/20261212081000_jjinfan_campaign_read_owner.sql
select pg_temp.expect_reads('plain owner');
select pg_temp.expect_narrow('jj_fn_plain');
set role jj_fn_plain;
do $$ begin
 if (select count(*) from public.jjinfan_challenge_campaigns)<>1 then raise exception 'Plain owner must see only the enabled row'; end if;
 if exists(select 1 from public.jjinfan_challenge_campaigns where title='초안 제목') then raise exception 'Draft wording visible'; end if;
end $$;
reset role;
\ir ../rollback/20261212081000_jjinfan_campaign_read_owner.sql
do $$ begin
 if exists(select 1 from pg_policy where polrelid='public.jjinfan_challenge_campaigns'::regclass) then raise exception 'Rollback left a policy'; end if;
end $$;
select pg_temp.expect_refused('plain owner after rollback');

-- The applying role owning the function too: nothing to grant, and no error.
alter function public.read_jjinfan_challenge(uuid) owner to jj_table_owner;
\ir ../migrations/20261212081000_jjinfan_campaign_read_owner.sql
do $$ begin raise notice 'PASS jjinfan campaign function owner'; end $$;
