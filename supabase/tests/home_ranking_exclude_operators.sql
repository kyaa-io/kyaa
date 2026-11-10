\set ON_ERROR_STOP on
-- Local-only synthetic fixture; all rows roll back. An active admin_allowlist user with the most hearts is not listed and the others rank up.
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger;
delete from public.home_ranking_daily;
delete from public.home_ranking_builds;
delete from public.home_ranking_kind_builds;
delete from public.home_ranking_build_failures;
set local session_replication_role = origin;
create temporary table ex_ids(tag text primary key, id uuid default extensions.gen_random_uuid());
insert into ex_ids(tag) values ('creator'),('admin'),('fan1'),('fan2');
create function pg_temp.ex_id(t text) returns uuid language sql as $$ select id from ex_ids where tag=t $$;
create function pg_temp.ex_rank(f text, metric text) returns int language sql as $$
  select (r->>'rank')::int from jsonb_array_elements(public.read_home_fan_ranking_v2(null,metric,50)->'rows') r where r->>'nickname'='ex_'||f
$$;
do $$ declare f text; before_rank int; begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(pg_temp.ex_id('creator'),'ex-fixture','published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(pg_temp.ex_id('creator'),'ko','Ex fixture','fixture','fixture');
  insert into public.group_pages(kind,celebrity_id,name) values('fan',pg_temp.ex_id('creator'),'Ex fixture');
  foreach f in array array['admin','fan1','fan2'] loop
    insert into public.app_users(id,privy_user_id,verified_email) values(pg_temp.ex_id(f),'did:privy:ex-'||f,f||'@ex-rank.example.test');
    insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(pg_temp.ex_id(f),'ex_'||f,'ex_'||f);
  end loop;
  set local session_replication_role = replica;
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
  select pg_temp.ex_id('creator'),pg_temp.ex_id(f),n,'passport_page_claim',extensions.gen_random_uuid(),'2099-11-10 23:59:00+09'
    from (values ('admin',30),('fan1',20),('fan2',10)) v(f,n);
  set local session_replication_role = origin;
  perform public.refresh_home_rankings('2099-11-10 14:59:59+00');
  if pg_temp.ex_rank('admin','hearts') <> 1 or pg_temp.ex_rank('fan1','hearts') <> 2 then raise exception 'precondition: admin should lead before allowlisting'; end if;
  insert into public.admin_allowlist(email,role,active) values ('admin@ex-rank.example.test','admin',true);
  if pg_temp.ex_rank('admin','hearts') is not null then raise exception 'allowlisted admin is listed'; end if;
  if pg_temp.ex_rank('fan1','hearts') <> 1 or pg_temp.ex_rank('fan2','hearts') <> 2 then raise exception 'ranks did not shift up'; end if;
end $$;
rollback;
