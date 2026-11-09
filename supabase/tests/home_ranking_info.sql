\set ON_ERROR_STOP on
-- Run on the disposable verify-clean-migration-chain database only. Existing sort/tie/movement/weekly/visibility coverage.
\ir home_ranking_metrics.sql
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger;
delete from public.fan_heart_conversions;
delete from public.fan_score_ledger;
delete from public.home_ranking_daily;
delete from public.home_ranking_kind_builds;
delete from public.home_ranking_builds;
set local session_replication_role = origin;
create temporary table info_ids(tag text primary key, id uuid default extensions.gen_random_uuid());
insert into info_ids(tag) values ('ca'),('cb'),('f1'),('f2'),('f3'),('brand'),('live');
create function pg_temp.info_id(t text) returns uuid language sql as $$ select id from info_ids where tag=t $$;
create function pg_temp.info_heart(f text,c text,n int) returns void language sql set session_replication_role=replica as $$
 insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
 select pg_temp.info_id(c),pg_temp.info_id(f),1,'passport_page_claim',extensions.gen_random_uuid(),'2099-08-01 09:00+09' from generate_series(1,n)
$$;
create function pg_temp.info_fan(n text) returns jsonb language sql as $$
 select r from jsonb_array_elements(public.read_home_fan_ranking_v2(null,'hearts',50)->'rows') r where r->>'nickname'='info_'||n
$$;
create function pg_temp.info_creator(n text) returns jsonb language sql as $$
 select r from jsonb_array_elements(public.read_home_creator_ranking_v2('ko','hearts',50)->'rows') r where r->>'slug'='info-'||n
$$;
do $$ declare t text; r jsonb; begin
 foreach t in array array['ca','cb'] loop
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(pg_temp.info_id(t),'info-'||t,'published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(pg_temp.info_id(t),'ko',t,'s','a');
  insert into public.group_pages(kind,celebrity_id,name) values('fan',pg_temp.info_id(t),t);
 end loop;
 foreach t in array array['f1','f2','f3'] loop
  insert into public.app_users(id,privy_user_id,verified_email) values(pg_temp.info_id(t),'did:privy:info-'||t,t||'@info.example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(pg_temp.info_id(t),'info_'||t,'info_'||t);
 end loop;
 perform pg_temp.info_heart('f1','ca',4),pg_temp.info_heart('f2','ca',2);
 perform public.refresh_home_rankings('2099-08-01 12:00+09');
 r:=pg_temp.info_fan('f1');
 if r->>'fans'<>'1' or r->>'hearts'<>'4' or r->>'isNew'<>'false' or r->'delta'<>'null'::jsonb or r->'weekGain'<>'null'::jsonb then raise exception 'INFO first/unknown: %',r; end if;
 if pg_temp.info_creator('ca')->>'isNew'<>'false' then raise exception 'INFO initial creator cohort'; end if;
 perform pg_temp.info_heart('f2','cb',4),pg_temp.info_heart('f3','cb',1);
 perform public.refresh_home_rankings('2099-08-02 12:00+09');
 r:=pg_temp.info_fan('f2');
 if r->>'fans'<>'2' or r->>'hearts'<>'6' or r->>'rank'<>'1' or r->>'delta'<>'1' or r->>'weekGain'<>'4' or r->>'isNew'<>'false' then raise exception 'INFO f2 sort/move/gain/count: %',r; end if;
 r:=pg_temp.info_fan('f1');
 if r->>'rank'<>'2' or r->>'delta'<>'-1' or r->>'weekGain'<>'0' then raise exception 'INFO f1 down/zero: %',r; end if;
 r:=pg_temp.info_fan('f3');
 if r->>'isNew'<>'true' or r->'delta'<>'null'::jsonb or r->>'weekGain'<>'1' then raise exception 'INFO new fan: %',r; end if;
 if pg_temp.info_creator('cb')->>'isNew'<>'true' then raise exception 'INFO new creator'; end if;
 perform public.refresh_home_rankings('2099-08-03 12:00+09');
 r:=pg_temp.info_fan('f2');
 if r->>'delta'<>'0' then raise exception 'INFO unchanged rank: %',r; end if;
 -- Retain NEW across subsequent daily snapshots, then expire it after seven days.
 if pg_temp.info_fan('f3')->>'isNew'<>'true' then raise exception 'INFO new expires too soon'; end if;
 perform public.refresh_home_rankings('2099-08-09 12:00+09');
 if pg_temp.info_fan('f3')->>'isNew'<>'false' then raise exception 'INFO new did not expire'; end if;
 r:=public.read_home_fan_ranking_v2(null,'hearts',50);
 if r::text ~ '(subject_id|subjectId|app_user_id|appUserId)' or r->'me'<>'null'::jsonb or r::text like '%'||pg_temp.info_id('f1')||'%' then raise exception 'INFO identifier exposure'; end if;
 raise notice 'PASS rank info: sorting, up/down/zero/null, weekly gain/zero/null, fan count, recent-entry window, no member identifiers';
end $$;
-- Existing LIVE source: public event interval, effective override, cancellation and publication.
insert into public.brands(id,slug,status,logo_url,logo_alt,published_at) values(pg_temp.info_id('brand'),'info-brand','published','/fixture.webp','brand',now());
set local session_replication_role = replica;
insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,external_live_url,approved_hero_url,fan_code_hash,published_at,attendance_valid_from,attendance_valid_until)
values(pg_temp.info_id('live'),'info-live',pg_temp.info_id('ca'),pg_temp.info_id('brand'),'published',now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 days',now()-interval '1 day','https://www.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','/fixture.webp',extensions.crypt('INFO1234',extensions.gen_salt('bf',10)),now(),now()-interval '1 hour',now()+interval '1 hour');
set local session_replication_role = origin;
do $$ declare r jsonb; begin
 if not public.home_ranking_live_now(pg_temp.info_id('ca')) or pg_temp.info_creator('ca')->>'liveNow'<>'true' then raise exception 'INFO live interval'; end if;
 -- f1's fallback favorite is ca; no member presence or identifier is involved.
 if pg_temp.info_fan('f1')->>'liveNow'<>'true' then raise exception 'INFO favorite live'; end if;
 set local session_replication_role=replica;
 update public.live_events set publication_status='draft',published_at=null where id=pg_temp.info_id('live');
 if public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO draft event exposed'; end if;
 update public.live_events set publication_status='published',published_at=now(),content_status='cancelled' where id=pg_temp.info_id('live');
 if public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO cancelled live'; end if;
 update public.live_events set content_status='scheduled',ends_at=now()-interval '1 minute' where id=pg_temp.info_id('live');
 if public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO ended live'; end if;
 -- An effective override can make the ended schedule live; cancellation still wins.
 insert into public.live_status_overrides(live_event_id,effective_status,effective_from,effective_until,reason,actor_admin_allowlist_id)
 values(pg_temp.info_id('live'),'live',now()-interval '30 minutes',now()+interval '30 minutes','fixture',extensions.gen_random_uuid());
 if not public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO effective live override'; end if;
 update public.live_events set content_status='cancelled' where id=pg_temp.info_id('live');
 if public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO override bypassed cancellation'; end if;
 update public.live_events set content_status='scheduled',archived_at=now(),archived_by_admin_allowlist_id=extensions.gen_random_uuid(),archive_reason='Archived test fixture' where id=pg_temp.info_id('live');
 if public.home_ranking_live_now(pg_temp.info_id('ca')) then raise exception 'INFO archived live'; end if;
 set local session_replication_role=origin;
 raise notice 'PASS rank info: existing public LIVE interval, fan favorite, draft/cancelled/ended excluded';
end $$;
-- The client roles cannot use the helpers to probe identifiers.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'public.home_ranking_live_now(uuid)','execute') or has_function_privilege(r,'public.home_ranking_recent_entry(text,uuid,date)','execute') or has_table_privilege(r,'public.home_ranking_daily','select') then raise exception 'INFO client privilege %',r; end if;
 end loop;
 raise notice 'PASS rank info: helper and snapshot privileges';
end $$;
rollback;
