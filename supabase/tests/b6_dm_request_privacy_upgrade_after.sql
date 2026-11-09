\set ON_ERROR_STOP on
-- Runs just after 20261220040000: S6d, S9c, S15, S6f answers are unchanged, and no rejected row became a declined one.
set b6.phase='after';
\ir b6_dm_request_privacy_upgrade_probe.sql
do $$
declare diff text;
begin
 select string_agg(coalesce(b.call,a.call)||': '||coalesce(b.answer,'<none>')||' -> '||coalesce(a.answer,'<none>'),E'\n') into diff
  from (select * from public.b6_upgrade_probe where phase='before') b full join (select * from public.b6_upgrade_probe where phase='after') a on a.call=b.call
  where a.answer is distinct from b.answer;
 if diff is not null then raise exception 'B6 upgrade changed answers:%',E'\n'||diff; end if;
 if exists(select 1 from public.social_dm_conversations where declined_at is not null) then raise exception 'B6 upgrade moved rejected rows (H1)'; end if;
 if (select count(*) from public.b6_upgrade_probe where phase='after')<13 then raise exception 'B6 upgrade probe incomplete'; end if;
 if (select count(*) from public.social_dm_request_log l join public.social_dm_messages m on m.id=l.message_id where m.created_at>now()-interval '24 hours')=0 then raise exception 'B6 limit backfill'; end if;
end $$;
drop table public.b6_upgrade_probe;
\echo PASS b6_dm_request_privacy_upgrade
