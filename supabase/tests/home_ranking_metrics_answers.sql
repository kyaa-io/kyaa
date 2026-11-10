-- 20261220150000: the real v2 answers the home route contract test reads (apps/web/app/api/rankings/home/v2-answers.fixture.json).
-- First built day, a second day, an empty day and a late day (today's build missing, a failure mark), every metric. Rolled back.
-- Run on a disposable database with every migration: psql -v out=<file> -f supabase/tests/home_ranking_metrics_answers.sql
begin;
set local client_min_messages = warning;
set local session_replication_role = replica;
delete from public.creator_heart_ledger; delete from public.fan_heart_conversions; delete from public.fan_score_ledger;
delete from public.home_ranking_daily; delete from public.home_ranking_builds; delete from public.home_ranking_kind_builds; delete from public.home_ranking_build_failures;
create temporary table fx(tag text, id uuid default extensions.gen_random_uuid());
insert into fx(tag) values ('ca'), ('cb'), ('f1'), ('f2'), ('f3');
insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) select id, 'contract-' || tag, 'published', '/images/groups/nchive-pencil.jpg', now(), '{creator}', 'creator' from fx where tag like 'c%';
insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) select id, 'ko', '계약 ' || tag, 's', 'a' from fx where tag like 'c%';
insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) select id, 'en', 'Contract ' || tag, 's', 'a' from fx where tag = 'ca';
insert into public.group_pages(kind, celebrity_id, name) select 'fan', id, tag from fx where tag like 'c%';
insert into public.app_users(id, privy_user_id, verified_email) select id, 'did:privy:contract-' || id, id || '@example.test' from fx where tag like 'f%';
insert into public.user_profiles(app_user_id, nickname, nickname_normalized) select id, '계약팬' || tag, '계약팬' || tag from fx where tag like 'f%';
insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id) select f.id, c.id from fx f, fx c where f.tag = 'f2' and c.tag = 'cb';
create temporary table ans(name text, body jsonb);
create function pg_temp.h(f text, c text, n int, ago interval) returns void language sql as $$
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select (select id from fx where tag = c), (select id from fx where tag = f), 1, 'passport_page_claim', extensions.gen_random_uuid(), now() - ago from generate_series(1, n) $$;
create function pg_temp.p(f text, c text, n int, ago interval) returns void language sql as $$
  insert into public.fan_score_ledger(adjustment_id, app_user_id, celebrity_id, points, created_at)
  values (extensions.gen_random_uuid(), (select id from fx where tag = f), (select id from fx where tag = c), n, now() - ago) $$;
create function pg_temp.snap(label text) returns void language sql as $$
  insert into ans values (label || ':fans:hearts', public.read_home_fan_ranking_v2(null, 'hearts', 20)), (label || ':fans:points', public.read_home_fan_ranking_v2(null, 'points', 20)),
    (label || ':creators:fans', public.read_home_creator_ranking_v2('ko', 'fans', 20)), (label || ':creators:hearts', public.read_home_creator_ranking_v2('ko', 'hearts', 20)) $$;
select pg_temp.h('f1', 'ca', 3, '2 days'), pg_temp.h('f2', 'cb', 1, '2 days'), pg_temp.p('f1', 'ca', 40, '2 days'), pg_temp.p('f3', 'cb', 90, '2 days');
select public.refresh_home_rankings(now() - interval '1 day');
select pg_temp.snap('first');
select pg_temp.h('f2', 'cb', 4, '1 hour'), pg_temp.h('f3', 'ca', 1, '1 hour'), pg_temp.p('f2', 'cb', 20, '1 hour');
select public.refresh_home_rankings(now());
select pg_temp.snap('ready');
insert into ans values ('ready:fans:points:viewer', public.read_home_fan_ranking_v2((select id from fx where tag = 'f1'), 'points', 20));
set local session_replication_role = replica;
delete from public.creator_heart_ledger; delete from public.fan_score_ledger;
set local session_replication_role = origin;
select public.refresh_home_rankings(now());
select pg_temp.snap('empty');
delete from public.home_ranking_kind_builds where day = (now() at time zone 'Asia/Seoul')::date;
delete from public.home_ranking_daily where day = (now() at time zone 'Asia/Seoul')::date;
delete from public.home_ranking_builds where day = (now() at time zone 'Asia/Seoul')::date;
insert into public.home_ranking_build_failures values ((now() at time zone 'Asia/Seoul')::date, now());
select pg_temp.snap('stale');
\o :out
select jsonb_pretty(jsonb_object_agg(name, body)) from ans;
\o
rollback;
