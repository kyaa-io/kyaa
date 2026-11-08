\set ON_ERROR_STOP on
-- Home ranking by day (20261215010000): day-over-day movement, the first seven days without movement, hidden/unlisted pages and sanctioned
-- or blocked people out, creators by fans holding hearts then heart total, no member id in the answer, service role only, and the rollback.
-- Everything runs in one transaction that is rolled back. The ledger is emptied inside it so the shared database's own rows do not change the result.
begin;
do $$
declare
  d1 constant timestamptz := '2099-03-01 12:00+09'; d7 constant timestamptz := '2099-03-07 23:50+09'; d8 constant timestamptz := '2099-03-08 12:00+09';
  shown uuid := extensions.gen_random_uuid(); other uuid := extensions.gen_random_uuid(); anon_cel uuid := extensions.gen_random_uuid(); unlisted uuid := extensions.gen_random_uuid();
  f1 uuid := extensions.gen_random_uuid(); f2 uuid := extensions.gen_random_uuid(); f3 uuid := extensions.gen_random_uuid(); late uuid := extensions.gen_random_uuid();
  sanctioned uuid := extensions.gen_random_uuid(); blocker uuid := extensions.gen_random_uuid(); viewer uuid := extensions.gen_random_uuid(); anon_only uuid := extensions.gen_random_uuid();
  u uuid; c uuid; result jsonb; raised boolean; state text;
  nick text;
begin
  set local session_replication_role = replica;
  delete from public.creator_heart_ledger;
  delete from public.fan_heart_conversions;
  delete from public.home_ranking_daily;
  foreach c in array array[shown, other, anon_cel, unlisted] loop
    insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (c, 'hrd-' || left(c::text, 8), 'published', '/fixture.webp', now(), '{creator}', 'creator');
    insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '홈 랭킹 ' || left(c::text, 4), '소개', '사진');
  end loop;
  insert into public.group_pages(kind, celebrity_id, name) values ('fan', shown, 'Shown'), ('fan', other, 'Other');
  insert into public.group_pages(kind, celebrity_id, name, anonymous) values ('fan', anon_cel, 'Anonymous', true);
  insert into public.group_pages(kind, celebrity_id, name, listed) values ('fan', unlisted, 'Unlisted', false);
  foreach u in array array[f1, f2, f3, late, sanctioned, blocker, viewer, anon_only] loop
    insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:privy:hrd-' || u, u || '@example.test');
    insert into public.user_profiles(app_user_id, nickname, nickname_normalized) values (u, 'hrd' || left(u::text, 8), 'hrd' || left(u::text, 8));
  end loop;
  insert into public.user_blocks(app_user_id, blocked_app_user_id) values (blocker, viewer);
  insert into public.app_user_moderation_restrictions(app_user_id, report_id, reason, actor_admin_id) values (sanctioned, extensions.gen_random_uuid(), '홈 랭킹 시험용 제재 사유입니다', extensions.gen_random_uuid());
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, updated_by_admin_allowlist_id) values (other, true, '찐팬 100명', extensions.gen_random_uuid());
  -- Day 1: shown f1 5, f2 3, sanctioned 9, blocker 2, viewer 1; other f3 1, f2 1; unlisted f3 1, viewer 1 (an unlisted page still counts for fans,
  -- as in the platform ranking); anon_only only on the anonymous page.
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select x.cel, x.who, 1, 'passport_page_claim', extensions.gen_random_uuid(), d1 - interval '1 hour' * x.n from (values
    (shown, f1, 1), (shown, f1, 2), (shown, f1, 3), (shown, f1, 4), (shown, f1, 5), (shown, f2, 1), (shown, f2, 2), (shown, f2, 3),
    (shown, sanctioned, 1), (shown, sanctioned, 2), (shown, sanctioned, 3), (shown, sanctioned, 4), (shown, sanctioned, 5), (shown, sanctioned, 6), (shown, sanctioned, 7), (shown, sanctioned, 8), (shown, sanctioned, 9),
    (shown, blocker, 1), (shown, blocker, 2), (shown, viewer, 1), (other, f3, 1), (other, f2, 4),
    (anon_cel, anon_only, 1), (anon_cel, anon_only, 2), (unlisted, f3, 2), (unlisted, viewer, 2)) as x(cel, who, n);
  set local session_replication_role = origin;

  perform public.refresh_home_rankings(d1);
  perform public.refresh_home_rankings(d7);
  result := public.read_home_fan_ranking(null, 20);
  if (result ->> 'comparable')::boolean or exists (select 1 from jsonb_array_elements(result -> 'rows') r where r -> 'delta' <> 'null'::jsonb) then raise exception 'Movement before seven days: %', result; end if;

  -- One heart definition: every pair equals passport_hearts, and a one-time stamp conversion counts like ledger hearts.
  if exists (select 1 from public.heart_totals() t where t.hearts <> public.passport_hearts(t.app_user_id, t.celebrity_id)) then raise exception 'heart_totals differs from passport_hearts'; end if;
  if public.creator_jjinfan_count(shown) <> (select count(*) from public.app_users u where u.status = 'active' and public.passport_hearts(u.id, shown) > 0) then raise exception 'jjinfan count differs'; end if;

  -- Day 8: f2 passes f1 (f2 4+3=7 > f1 5), late enters.
  set local session_replication_role = replica;
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select shown, x.who, 1, 'passport_page_claim', extensions.gen_random_uuid(), d8 - interval '1 minute' * x.n from (values (f2, 1), (f2, 2), (f2, 3), (late, 4)) as x(who, n);
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d8);


  result := public.read_home_fan_ranking(null, 20);
  if not (result ->> 'comparable')::boolean or result ->> 'day' <> '2099-03-08' then raise exception 'Day 8 not comparable: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['characterId', 'delta', 'isMe', 'nickname', 'rank', 'score', 'tier'])
    then raise exception 'Fan row has other keys: %', result; end if;
  foreach u in array array[f1, f2, f3, late, sanctioned, blocker, viewer, anon_only] loop
    if result::text like '%' || u::text || '%' then raise exception 'A member id is in the answer: %', result; end if;
  end loop;
  if result::text like '%hrd' || left(sanctioned::text, 8) || '%' then raise exception 'Sanctioned fan listed: %', result; end if;
  if result::text like '%hrd' || left(anon_only::text, 8) || '%' then raise exception 'Hidden-page hearts counted: %', result; end if;
  if result -> 'rows' -> 0 ->> 'nickname' <> 'hrd' || left(f2::text, 8) or (result -> 'rows' -> 0 ->> 'score')::int <> 7 or (result -> 'rows' -> 0 ->> 'delta')::int <> 1
    then raise exception 'Climber wrong: %', result; end if;
  if result -> 'rows' -> 1 ->> 'nickname' <> 'hrd' || left(f1::text, 8) or (result -> 'rows' -> 1 ->> 'score')::int <> 5 or (result -> 'rows' -> 1 ->> 'delta')::int <> -1
    then raise exception 'Faller wrong: %', result; end if;
  if (select r -> 'delta' from jsonb_array_elements(result -> 'rows') r where r ->> 'nickname' = 'hrd' || left(late::text, 8)) <> 'null'::jsonb then raise exception 'New entry has a delta: %', result; end if;
  if (select (r ->> 'delta')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'nickname' = 'hrd' || left(blocker::text, 8)) <> 0 then raise exception 'Unchanged row not 0: %', result; end if;
  if result -> 'me' <> 'null'::jsonb then raise exception 'Signed-out answer has me: %', result; end if;

  result := public.read_home_fan_ranking(viewer, 20);
  if result::text like '%hrd' || left(blocker::text, 8) || '%' then raise exception 'Blocked fan listed: %', result; end if;
  if (select count(*) from jsonb_array_elements(result -> 'rows') r where (r ->> 'isMe')::boolean) <> 1 or not (result -> 'me' ->> 'inTop')::boolean then raise exception 'Own row: %', result; end if;
  -- Ranks close up after the read-time filter: no gap where the blocker was.
  if (select array_agg((r ->> 'rank')::int order by (r ->> 'rank')::int) from jsonb_array_elements(result -> 'rows') r) <> (select array_agg(i) from generate_series(1, jsonb_array_length(result -> 'rows')) i)
    then raise exception 'Ranks have a gap: %', result; end if;
  result := public.read_home_fan_ranking(viewer, 1);
  if jsonb_array_length(result -> 'rows') <> 1 or (result -> 'me' ->> 'inTop')::boolean then raise exception 'Limit or me.inTop wrong: %', result; end if;
  if jsonb_array_length(public.read_home_fan_ranking(null, 500) -> 'rows') > 20 then raise exception 'Limit above 20'; end if;

  -- Creators: fans holding hearts, then hearts. shown 6 fans and 24 hearts; other 2 fans; anonymous and unlisted pages are not named.
  result := public.read_home_creator_ranking('ko', 20);
  if result::text like '%hrd-' || left(anon_cel::text, 8) || '%' or result::text like '%hrd-' || left(unlisted::text, 8) || '%' then raise exception 'Hidden page named: %', result; end if;
  if result -> 'rows' -> 0 ->> 'slug' <> 'hrd-' || left(shown::text, 8) or (result -> 'rows' -> 0 ->> 'score')::int <> 6 or (result -> 'rows' -> 0 ->> 'hearts')::int <> 24
    then raise exception 'Creator score wrong: %', result; end if;
  if (result -> 'rows' -> 1 ->> 'score')::int <> 2 or not (result -> 'rows' -> 1 ->> 'challenge')::boolean or (result -> 'rows' -> 0 ->> 'challenge')::boolean
    then raise exception 'Second creator or challenge flag wrong: %', result; end if;
  if (result -> 'rows' -> 0 ->> 'delta')::int <> 0 then raise exception 'Creator delta wrong: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['challenge', 'delta', 'hearts', 'imageUrl', 'name', 'rank', 'score', 'slug'])
    then raise exception 'Creator row has other keys: %', result; end if;
  set local session_replication_role = replica;
  -- f3 converted stamps into 2 hearts on other: f3 = 1 (other) + 1 (unlisted) + 2 = 4, other keeps 2 fans and gains 2 hearts.
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at) values (f3, other, 18, 2, 0, d8);
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d8);
  if (select score from public.home_ranking_daily where kind = 'fan_hearts' and day = '2099-03-08' and subject_id = f3) <> 4 then raise exception 'Conversion hearts not in the fan score'; end if;
  if exists (select 1 from public.home_ranking_daily d where d.kind = 'fan_hearts' and d.day = '2099-03-08'
              and d.score <> (select sum(public.passport_hearts(d.subject_id, c.id)) from public.celebrities c where public.platform_fan_heart_counted(c.id))) then raise exception 'Fan score is not the passport_hearts sum'; end if;
  if (public.read_home_creator_ranking('ko', 20) -> 'rows' -> 1 ->> 'hearts')::int <> 4 then raise exception 'Conversion hearts not in the creator total'; end if;
  -- A page made unlisted after the write leaves at read time.
  update public.group_pages set listed = false where celebrity_id = shown;
  if public.read_home_creator_ranking('ko', 20)::text like '%hrd-' || left(shown::text, 8) || '%' then raise exception 'Unlisted at read time still shown'; end if;
  update public.group_pages set listed = true where celebrity_id = shown;

  -- Unlisted slugs for the home rail: the unlisted page only, not the anonymous or listed ones.
  if not ('hrd-' || left(unlisted::text, 8) = any (public.list_unlisted_creator_slugs())) or ('hrd-' || left(shown::text, 8) = any (public.list_unlisted_creator_slugs()))
    then raise exception 'Unlisted slugs wrong: %', public.list_unlisted_creator_slugs(); end if;

  -- Read-time build: a day with no scores is still marked, so the second reader does not build again.
  set local session_replication_role = replica; delete from public.creator_heart_ledger; delete from public.fan_heart_conversions; set local session_replication_role = origin;
  if (public.ensure_home_rankings('2099-04-01 12:00+09') ->> 'built')::boolean is not true then raise exception 'Missing day not built'; end if;
  if (public.ensure_home_rankings('2099-04-01 18:00+09') ->> 'built')::boolean then raise exception 'Built twice'; end if;
  if not exists (select 1 from public.home_ranking_builds where day = '2099-04-01') or exists (select 1 from public.home_ranking_daily where day = '2099-04-01') then raise exception 'Empty day mark wrong'; end if;
  if public.read_home_fan_ranking(null, 20) ->> 'builtDay' <> '2099-04-01' then raise exception 'builtDay missing: %', public.read_home_fan_ranking(null, 20); end if;
  -- A past or test day never removes the real days: retention follows the clock.
  if not exists (select 1 from public.home_ranking_daily where day = '2099-03-08') then raise exception 'Retention removed by p_now'; end if;

  -- Reads never count hearts: the readers use the stored rows only (review M4).
  if pg_get_functiondef('public.read_home_fan_ranking(uuid,integer)'::regprocedure) ~ 'heart_totals|creator_heart_ledger|get_fan_effective_tier'
     or pg_get_functiondef('public.read_home_creator_ranking(text,integer)'::regprocedure) ~ 'heart_totals|creator_heart_ledger' then raise exception 'A reader counts hearts'; end if;
  -- A failed build leaves a mark: readers wait five minutes instead of retrying the whole count each time.
  alter table public.fan_heart_conversions rename to fan_heart_conversions_hidden;
  if (public.ensure_home_rankings('2099-04-02 12:00+09') ->> 'failed')::boolean is not true then raise exception 'Failed build not reported'; end if;
  if (public.ensure_home_rankings('2099-04-02 12:01+09') ->> 'waiting')::boolean is not true then raise exception 'No backoff after a failed build'; end if;
  alter table public.fan_heart_conversions_hidden rename to fan_heart_conversions;
  if exists (select 1 from public.home_ranking_daily where day = '2099-04-02') then raise exception 'Failed build left rows'; end if;

  -- Empty table: no rows, nothing comparable.
  delete from public.home_ranking_daily;
  result := public.read_home_fan_ranking(null, 20);
  if jsonb_array_length(result -> 'rows') <> 0 or (result ->> 'comparable')::boolean then raise exception 'Empty answer wrong: %', result; end if;

  raised := false; begin execute 'set local role anon'; perform public.read_home_fan_ranking(null, 10); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'anon may read: %', state; end if;
  raised := false; begin execute 'set local role authenticated'; perform public.ensure_home_rankings(); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'authenticated may build: %', state; end if;
  raised := false; begin execute 'set local role authenticated'; perform public.refresh_home_rankings(); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'authenticated may refresh: %', state; end if;
  execute 'set local role service_role';
  perform public.read_home_creator_ranking('ko', 20);
  execute 'reset role';
  raise notice 'PASS home ranking daily';
end $$;

rollback;

-- The rollback, run inside a transaction that is rolled back too (the rollback file's own begin/commit would end this one). Body = the rollback file.
begin;
set local lock_timeout = '5s';
do $cron$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'home-ranking-daily';
  end if;
end $cron$;
drop function public.ensure_home_rankings(timestamptz);
drop function public.list_unlisted_creator_slugs();
drop function public.read_home_creator_ranking(text, integer);
drop function public.read_home_fan_ranking(uuid, integer);
drop function public.home_ranking_days(text);
drop function public.creator_jjinfan_count(uuid);
drop function public.heart_totals();
drop function public.refresh_home_rankings(timestamptz);
do $policies$
declare r record;
begin
  for r in select p.polname, c.relname from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid
            where c.relnamespace = 'public'::regnamespace and p.polname like 'r4b\_read\_%' loop
    execute format('drop policy %I on public.%I', r.polname, r.relname);
  end loop;
end $policies$;
drop table public.home_ranking_daily;
drop table public.home_ranking_builds;
drop table public.home_ranking_build_failures;
do $$ begin
  if to_regclass('public.home_ranking_daily') is not null then raise exception 'Rollback left the table'; end if;
  perform public.refresh_ranking_snapshots();
  raise notice 'PASS home ranking daily rollback';
end $$;
rollback;
