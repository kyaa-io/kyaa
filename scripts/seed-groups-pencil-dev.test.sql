\set ON_ERROR_STOP on
-- Invoked by verify-clean-migration-chain.sh in its disposable local database.
create temp table seed_protected_before as select
 (select count(*) from public.blockchain_jobs) chain_jobs,
 (select count(*) from public.fan_action_outbox) chain_outbox,
 (select count(*) from public.fan_ticket_ledger) ticket_ledger,
 (select count(*) from public.mobile_fan_economy_ledger) economy_ledger,
 (select count(*) from public.telegram_alert_outbox) alerts,
 (select count(*) from public.fan_web_notification_intents) notification_intents,
 (select count(*) from public.group_raffles) raffles;
set byus.groups_pencil_dev = 'SEED_GROUPS_PENCIL_DEV_ONLY';
\ir fixtures/groups-pencil-dev.sql
update public.group_applications set status='reviewing' where id='f1710000-0000-4000-8000-000000000001';
create temp table seed_application_before as select jsonb_agg(to_jsonb(a) order by id) records from public.group_applications a where id::text like 'f1710000-%';
create temp table seed_counts_before as select
 (select count(*)from public.app_users) actors,
 (select count(*)from public.group_pages) pages,
 (select count(*)from public.group_memberships) memberships,
 (select count(*)from public.group_posts) posts,
 (select count(*)from public.group_events) events,
 (select count(*)from public.group_event_registrations) registrations,
 (select count(*)from public.group_mission_submissions) submissions;
\ir fixtures/groups-pencil-dev.sql
do $$declare before_row record;after_row record;begin
 select *into before_row from seed_counts_before;
 select (select count(*)from public.app_users) actors,(select count(*)from public.group_pages) pages,
 (select count(*)from public.group_memberships) memberships,(select count(*)from public.group_posts) posts,
 (select count(*)from public.group_events) events,(select count(*)from public.group_event_registrations) registrations,
 (select count(*)from public.group_mission_submissions) submissions into after_row;
 if to_jsonb(before_row)<>to_jsonb(after_row)then raise exception 'Fixture rerun duplicated data';end if;
 select *into before_row from seed_protected_before;
 select (select count(*)from public.blockchain_jobs) chain_jobs,(select count(*)from public.fan_action_outbox) chain_outbox,
 (select count(*)from public.fan_ticket_ledger) ticket_ledger,(select count(*)from public.mobile_fan_economy_ledger) economy_ledger,
 (select count(*)from public.telegram_alert_outbox) alerts,(select count(*)from public.fan_web_notification_intents) notification_intents,(select count(*)from public.group_raffles) raffles into after_row;
 if to_jsonb(before_row)<>to_jsonb(after_row)then raise exception 'Fixture changed protected records';end if;
 if (select count(*)from public.group_applications where id::text like 'f1710000-%')<>4 then raise exception 'Expected four application review fixtures';end if;
 if (select records from seed_application_before) is distinct from (select jsonb_agg(to_jsonb(a) order by id)from public.group_applications a where id::text like 'f1710000-%')then raise exception 'Seed overwrote application review state';end if;
 if (select count(*)from public.group_pages where id::text like 'f1630000-%'and status='published')<>14 then raise exception 'Expected 14 pages';end if;
 if (select array_agg(total order by page_id) from (select page_id,count(*)::int total from public.group_memberships where page_id between 'f1630000-0000-4000-8000-000000000001' and 'f1630000-0000-4000-8000-000000000008' group by page_id) counts)<>array[1280,356,84,2450,128,96,214,173] then raise exception 'Pencil membership counts differ';end if;
 if (select count(*)from public.group_memberships where app_user_id='f1610000-0000-4000-8000-000000000002')<>4 then raise exception 'Expected 4 joined pages';end if;
 if (select array_agg(name order by id)from public.group_pages where id between 'f1630000-0000-4000-8000-000000000001'and'f1630000-0000-4000-8000-000000000008')<>array['엔카이브 팬페이지','엘리나 팬페이지','한강 러닝 크루','RUN&MUSIC FESTIVAL','사진 산책 모임','주말 독서 모임','인디 음악 모임','공연 기록 모임']then raise exception 'Pencil group labels differ';end if;
 if (select description from public.group_pages where id='f1630000-0000-4000-8000-000000000001')<>'공식 영상과 LIVE 소식'then raise exception 'Pencil description differs';end if;
 if (select image_url from public.celebrities where id='f1620000-0000-4000-8000-000000000001')<>'/images/groups/nchive-pencil.jpg'then raise exception 'Pencil creator image differs';end if;
 if (select count(*) from public.published_celebrities where slug in ('groups-pencil-dev-1','groups-pencil-dev-2') and locale='ko')<>2 then raise exception 'Seeded creator detail routes are unavailable';end if;
 if (select array_agg(fan_count order by slug) from public.published_celebrities where slug in ('groups-pencil-dev-1','groups-pencil-dev-2') and locale='ko')<>array[1280,356]::bigint[] then raise exception 'Published creator counts differ';end if;
 if (select nickname from public.user_profiles where app_user_id='f1610000-0000-4000-8000-000000000002')<>'하늘'then raise exception 'Pencil nickname differs';end if;
 if exists(select 1 from public.group_pages where id::text like'f1630000-%'and description~'개발|예시|groups-pencil')or exists(select 1 from public.group_posts where id::text like'f1640000-%'and(title||body)~'개발|예시|groups-pencil')then raise exception 'Visible helper copy remained';end if;
 if not exists(select 1 from public.group_rooms where status='readonly')or not exists(select 1 from public.group_mission_submissions where status='completed'and reward_ledger_id is null)then raise exception 'Missing fixture states';end if;
end $$;
