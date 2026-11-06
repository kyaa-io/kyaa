-- DEV ONLY. Removes everything doc-261107-dev.sql made, and anything a person did on top of it (views, comments, friend replies).
-- Roots: synthetic users d2611001-*, the test creator and the two test pages, plus marked rows on real pages.
-- It follows every foreign key from the roots, because triggers and FK actions are off in this mode, then checks that no row was left pointing at a removed one.
-- Real rows on elina stay. A person's own points earned on these rows stay; they have no foreign key to follow. Fails closed: any problem rolls everything back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '55s';
do $$begin
 if current_setting('byus.doc261107_dev',true) is distinct from 'SEED_DOC_261107_DEV_ONLY' then raise exception 'DOC261107_CONFIRMATION_REQUIRED';end if;
 if inet_server_addr() is not null and host(inet_server_addr()) !~ '^(10\.40\.|127\.)' then raise exception 'DOC261107_NOT_DEV_SERVER';end if;
 perform pg_advisory_xact_lock(hashtextextended('doc-261107-dev',0));
end $$;
set local session_replication_role = replica;

create temp table doomed(id uuid primary key) on commit drop;
create temp table removed(rel text primary key,n bigint not null) on commit drop;
create temp table touched(rel regclass primary key) on commit drop;
insert into touched values('public.app_users'),('public.celebrities'),('public.group_pages'),('public.blockchain_jobs'),('public.mobile_media_assets'),('public.group_memberships');
create temp table fk_edges on commit drop as
 select c.conrelid child,c.confrelid parent,
  (select a.attname from pg_attribute a where a.attrelid=c.conrelid and a.attnum=c.conkey[array_position(c.confkey,p.attnum)]) child_col,c.oid fk
 from pg_constraint c join pg_attribute p on p.attrelid=c.confrelid and p.attname in('id','app_user_id') and p.attnum=any(c.confkey) and p.atttypid='uuid'::regtype
 where c.contype='f' and c.connamespace='public'::regnamespace and c.confrelid in(select oid from pg_class where relnamespace='public'::regnamespace);

do $$declare e record;grew bigint;total bigint;has_id boolean;begin
 insert into doomed select id from public.app_users where id::text like 'd2611001-%';
 insert into doomed select id from public.celebrities where id='d2611002-0000-4000-8000-000000000001';
 insert into doomed select id from public.group_pages where id in('d2611003-0000-4000-8000-000000000001','d2611003-0000-4000-8000-000000000002');
 loop
  select count(*) into total from doomed;
  for e in select distinct child,child_col from fk_edges loop
   select exists(select 1 from pg_attribute a where a.attrelid=e.child and a.attname='id' and a.atttypid='uuid'::regtype) into has_id;
   if has_id then execute format('insert into doomed select id from %s where %I in(select id from doomed) on conflict do nothing',e.child::regclass,e.child_col);end if;
  end loop;
  -- Media and reports point at their target by value, not by foreign key.
  insert into doomed select id from public.mobile_media_assets where attached_id in(select id from doomed) on conflict do nothing;
  select count(*)-total into grew from doomed;
  exit when grew=0;
 end loop;
end $$;

do $$declare e record;n bigint;t text;begin
 -- Marked membership rows on real pages, whoever they belong to.
 delete from public.group_memberships where answer='doc-261107-fixture';
 get diagnostics n=row_count; insert into removed values('public.group_memberships(marked)',n);
 foreach t in array array['group_reports','content_reports','content_translations'] loop
  if t='group_reports' then execute 'delete from public.group_reports where target_id in(select id from doomed)';
  else execute format('delete from public.%I where target_id in(select id from doomed)',t);end if;
  get diagnostics n=row_count; if n>0 then insert into removed values('public.'||t||'(target)',n);end if;
 end loop;
 delete from public.mobile_media_assets where attached_id in(select id from doomed);
 get diagnostics n=row_count; if n>0 then insert into removed values('public.mobile_media_assets(attached)',n);end if;
 -- Hearts of the test creator may be in the shared creator ranking snapshot if a refresh ran in between.
 -- Only a snapshot this cleanup emptied goes; a period that was already empty is not ours.
 create temp table emptied_snapshots(kind text,scope_id uuid,period text,period_start date) on commit drop;
 with changed as (
  update public.ranking_snapshots s set rows=(select coalesce(jsonb_agg(item order by (item->>'rank')::integer),'[]'::jsonb) from jsonb_array_elements(s.rows) item where (item->>'subjectId')::uuid not in(select id from doomed))
   where exists(select 1 from jsonb_array_elements(s.rows) item where (item->>'subjectId')::uuid in(select id from doomed))
   returning s.kind,s.scope_id,s.period,s.period_start,s.rows
 ) insert into emptied_snapshots select kind,scope_id,period,period_start from changed where kind='creator_hearts' and jsonb_array_length(rows)=0;
 delete from public.ranking_snapshots s where s.scope_id in(select id from doomed)
  or exists(select 1 from emptied_snapshots x where (x.kind,x.scope_id,x.period,x.period_start)=(s.kind,s.scope_id,s.period,s.period_start));
 for e in select distinct child,child_col from fk_edges loop
  execute format('delete from %s where %I in(select id from doomed)',e.child::regclass,e.child_col);
  get diagnostics n=row_count;
  if n>0 then insert into removed values(e.child::regclass::text||'.'||e.child_col,n);insert into touched values(e.child) on conflict do nothing;end if;
 end loop;
 delete from public.blockchain_jobs where operation_key like 'doc-261107:%';
 delete from public.celebrity_localizations where celebrity_id in(select id from doomed);
 delete from public.group_pages where id in(select id from doomed);
 delete from public.celebrities where id in(select id from doomed);
 delete from public.app_users where id in(select id from doomed);
end $$;

-- Every table a row was removed from: nothing may still point at a parent that is gone, including through composite keys.
do $$declare c record;bad boolean;join_on text;not_null text;begin
 for c in select r.oid,r.conrelid,r.confrelid from pg_constraint r where r.contype='f' and r.connamespace='public'::regnamespace
   and r.confrelid in(select rel from touched)
 loop
  select string_agg(format('p.%I=x.%I',pa.attname,ca.attname),' and '),string_agg(format('x.%I is not null',ca.attname),' and ') into join_on,not_null
   from unnest((select conkey from pg_constraint where oid=c.oid),(select confkey from pg_constraint where oid=c.oid)) k(ck,fk)
   join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=k.ck join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=k.fk;
  execute format('select exists(select 1 from %s x where %s and not exists(select 1 from %s p where %s))',c.conrelid::regclass,not_null,c.confrelid::regclass,join_on) into bad;
  if bad then raise exception 'DOC261107_DANGLING_REFERENCE %',c.conrelid::regclass;end if;
 end loop;
 if exists(select 1 from public.app_users where id::text like 'd2611001-%') or exists(select 1 from public.fan_posts where id::text like 'd2611004-%') then raise exception 'DOC261107_LEFTOVER';end if;
end $$;
select jsonb_build_object('fixture','doc-261107-dev','cleanup',(select jsonb_object_agg(rel,n) from removed)) doc261107_cleanup;
commit;
