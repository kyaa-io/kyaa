\set ON_ERROR_STOP on
-- 20261220010000 (TK-RANK-IMPL plan §7.1): the numbered checks below follow the plan. One transaction, rolled back; the heart, point and day
-- tables are emptied inside it, so run it on a disposable database (or a local one you can lose for a moment: nothing stays).
-- Days are in 2099 (after "today") except the late-day check, which uses yesterday and today.
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger;
delete from public.fan_heart_conversions;
delete from public.fan_score_ledger;
delete from public.home_ranking_daily;
delete from public.home_ranking_builds;
delete from public.home_ranking_kind_builds;
delete from public.home_ranking_build_failures;
set local session_replication_role = origin;

-- Fixtures: helpers write ledger rows with triggers off (the 덕질 freeze would turn points into 0 and the FKs want real activities).
create function pg_temp.heart(who uuid, cel uuid, n int, at timestamptz) returns void language sql set session_replication_role = replica as $$
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select cel, who, 1, 'passport_page_claim', extensions.gen_random_uuid(), at from generate_series(1, n)
$$;
create function pg_temp.pts(who uuid, cel uuid, n int, at timestamptz, row_id uuid default extensions.gen_random_uuid()) returns void language sql set session_replication_role = replica as $$
  insert into public.fan_score_ledger(id, adjustment_id, app_user_id, celebrity_id, points, created_at) values (row_id, extensions.gen_random_uuid(), who, cel, n, at)
$$;
create function pg_temp.fan(nick text, metric text default 'hearts', viewer uuid default null) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.read_home_fan_ranking_v2(viewer, metric, 50) -> 'rows') r where r ->> 'nickname' = nick
$$;
create function pg_temp.creator(slug text, metric text default 'fans') returns jsonb language sql as $$
  select r from jsonb_array_elements(public.read_home_creator_ranking_v2('ko', metric, 50) -> 'rows') r where r ->> 'slug' = slug
$$;
create function pg_temp.order_of(metric text) returns text language sql as $$
  select string_agg(r ->> 'nickname', ',' order by (r ->> 'rank')::int) from jsonb_array_elements(public.read_home_fan_ranking_v2(null, metric, 50) -> 'rows') r
$$;
create temporary table ids(tag text primary key, id uuid not null default extensions.gen_random_uuid());
insert into ids(tag) select unnest(array['ca', 'cb', 'cc', 'cx', 'cz', 'h1', 'h2', 'h3', 'p1', 'z1', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'q1', 'q2',
  'fv1', 'fv2', 'fv3', 'fv4', 'fv5', 'fv6', 'sanc', 'blk', 'viewer', 'empty']);
create function pg_temp.id(t text) returns uuid language sql as $$ select id from ids where tag = t $$;
do $$
declare t text;
begin
  foreach t in array array['ca', 'cb', 'cc', 'cx', 'cz'] loop
    insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (pg_temp.id(t), 'hm-' || t, 'published', '/fixture.webp', now(), '{creator}', 'creator');
    insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (pg_temp.id(t), 'ko', '지표 ' || t, '소개', '사진');
    insert into public.group_pages(kind, celebrity_id, name) values ('fan', pg_temp.id(t), t);
  end loop;
  foreach t in array array['h1', 'h2', 'h3', 'p1', 'z1', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'q1', 'q2', 'fv1', 'fv2', 'fv3', 'fv4', 'fv5', 'fv6', 'sanc', 'blk', 'viewer', 'empty'] loop
    insert into public.app_users(id, privy_user_id, verified_email) values (pg_temp.id(t), 'did:privy:hm-' || pg_temp.id(t), pg_temp.id(t) || '@example.test');
    insert into public.user_profiles(app_user_id, nickname, nickname_normalized) values (pg_temp.id(t), 'hm_' || t, 'hm_' || t);
  end loop;
end $$;

do $$
declare d0 constant timestamptz := '2099-06-01 12:00+09'; r jsonb; one jsonb; i int; first text; t text;
  ca uuid := pg_temp.id('ca'); cb uuid := pg_temp.id('cb'); cc uuid := pg_temp.id('cc'); cx uuid := pg_temp.id('cx'); cz uuid := pg_temp.id('cz');
begin
  -- History of the existing fan kind only (an older database): two built days before 06-01, nobody ranked.
  insert into public.home_ranking_kind_builds values ('fan_hearts', '2099-05-29', d0 - interval '3 days', 0), ('fan_hearts', '2099-05-31', d0 - interval '1 day', 0);

  -- Day 06-01. Hearts: h1 5 (ca), h2 3 (cb), h3 1 (ca), p1 1 (cb). Points: p1 500 (ca), z1 50 (cb, no hearts), h1 0.
  perform pg_temp.heart(pg_temp.id('h1'), ca, 5, d0 - interval '5 hours'), pg_temp.heart(pg_temp.id('h2'), cb, 3, d0 - interval '4 hours'),
          pg_temp.heart(pg_temp.id('h3'), ca, 1, d0 - interval '3 hours'), pg_temp.heart(pg_temp.id('p1'), cb, 1, d0 - interval '2 hours');
  perform pg_temp.pts(pg_temp.id('p1'), ca, 500, d0 - interval '5 hours'), pg_temp.pts(pg_temp.id('z1'), cb, 50, d0 - interval '5 hours');
  -- Ties (6): pair 1 at 100, pair 2 at 200 (deduction then reached again), pair 3 at 300 (went over, then deducted).
  perform pg_temp.pts(pg_temp.id('a1'), ca, 100, d0 - interval '10 hours'), pg_temp.pts(pg_temp.id('b1'), ca, 100, d0 - interval '9 hours');
  perform pg_temp.pts(pg_temp.id('a2'), ca, 200, d0 - interval '10 hours'), pg_temp.pts(pg_temp.id('a2'), ca, -10, d0 - interval '8 hours'), pg_temp.pts(pg_temp.id('a2'), ca, 10, d0 - interval '7 hours'),
          pg_temp.pts(pg_temp.id('b2'), ca, 200, d0 - interval '9 hours');
  perform pg_temp.pts(pg_temp.id('a3'), ca, 300, d0 - interval '10 hours'), pg_temp.pts(pg_temp.id('a3'), ca, 10, d0 - interval '8 hours'), pg_temp.pts(pg_temp.id('a3'), ca, -10, d0 - interval '7 hours'),
          pg_temp.pts(pg_temp.id('b3'), ca, 300, d0 - interval '9 hours');
  -- (6 ④) q1 and q2 reach 400 with rows at the same instant; the id breaks the tie inside a fan's rows.
  perform pg_temp.pts(pg_temp.id('q1'), ca, 400, d0 - interval '6 hours', '00000000-0000-4000-8000-000000000001'), pg_temp.pts(pg_temp.id('q1'), ca, -100, d0 - interval '6 hours', '00000000-0000-4000-8000-000000000002'),
          pg_temp.pts(pg_temp.id('q1'), ca, 100, d0 - interval '6 hours', '00000000-0000-4000-8000-000000000003'), pg_temp.pts(pg_temp.id('q2'), ca, 400, d0 - interval '6 hours');
  perform public.refresh_home_rankings(d0);

  -- 1 / 4: first record of the new kinds: nothing to compare, everyone new, no week gain. The older kind compares (with an empty day: all new).
  r := public.read_home_fan_ranking_v2(null, 'points', 50);
  if r ->> 'state' <> 'ready' or (r -> 'comparable')::boolean or r -> 'previousDay' <> 'null'::jsonb or r -> 'weekGainDays' <> 'null'::jsonb then raise exception '1/4 points head: %', r; end if;
  if exists (select 1 from jsonb_array_elements(r -> 'rows') x where x -> 'delta' <> 'null'::jsonb or x -> 'weekGain' <> 'null'::jsonb) then raise exception '1/4 points rows: %', r; end if;
  r := public.read_home_fan_ranking_v2(null, 'hearts', 50);
  if not (r -> 'comparable')::boolean or r ->> 'previousDay' <> '2099-05-31' or (r ->> 'weekGainDays')::int <> 3 then raise exception '4 hearts keeps its history: %', r; end if;
  if exists (select 1 from jsonb_array_elements(r -> 'rows') x where x -> 'delta' <> 'null'::jsonb) then raise exception '4 previous record was empty, so everyone is new: %', r; end if;
  r := public.read_home_creator_ranking_v2('ko', 'hearts', 50);
  if (r -> 'comparable')::boolean then raise exception '1 creator hearts first record: %', r; end if;

  -- 5: metrics apart. p1: hearts rank 4 (1 heart), points rank 1. z1 only in points (no hearts), h1 only in hearts (0 points).
  if (pg_temp.fan('hm_p1', 'points') ->> 'rank')::int <> 1 or (pg_temp.fan('hm_p1', 'hearts') ->> 'rank')::int <> 4 then raise exception '5 p1: % / %', pg_temp.fan('hm_p1', 'points'), pg_temp.fan('hm_p1', 'hearts'); end if;
  one := pg_temp.fan('hm_z1', 'points');
  if one is null or pg_temp.fan('hm_z1', 'hearts') is not null or (one ->> 'hearts')::int <> 0 or one -> 'tier' <> 'null'::jsonb or (one ->> 'points')::int <> 50 then raise exception '5 z1: %', one; end if;
  if pg_temp.fan('hm_h1', 'points') is not null then raise exception '5 h1 has no points'; end if;
  one := pg_temp.fan('hm_h1', 'hearts');
  if (one ->> 'hearts')::int <> 5 or one -> 'points' <> '0'::jsonb then raise exception '5 named values on hearts: %', one; end if;

  -- 6 ①②③④: pairs. a1 before b1 (earlier), b2 before a2 (a2 reached 200 again later), a3 before b3 (held 300 since its first row).
  first := pg_temp.order_of('points');
  if position('hm_a1' in first) > position('hm_b1' in first) or position('hm_b2' in first) > position('hm_a2' in first) or position('hm_a3' in first) > position('hm_b3' in first)
    then raise exception '6 tie order: %', first; end if;
  -- q1: 400 (id 1) -> 300 (id 2) -> 400 (id 3) at one instant; q2 400 at the same instant: reached at the same time, the member id decides. Stable below.
  -- 6 ① 0-point activity (here: rows of 0 points) moves nobody.
  for i in 1..10 loop perform pg_temp.pts(pg_temp.id('b1'), ca, 0, d0 - interval '1 hour'), pg_temp.pts(pg_temp.id('a1'), ca, 0, d0 - interval '1 hour'); end loop;
  perform public.refresh_home_rankings(d0);
  if pg_temp.order_of('points') <> first then raise exception '6 ① zero rows moved the order: % -> %', first, pg_temp.order_of('points'); end if;
  -- 6 ⑤ ten rebuilds, one order.
  for i in 1..10 loop
    perform public.refresh_home_rankings(d0);
    if pg_temp.order_of('points') <> first then raise exception '6 ⑤ rebuild % changed the order', i; end if;
  end loop;

  -- 16: the old readers answer the old metric: creator score = 찐팬 of creator_jjinfan, fan score = hearts; at most 20 rows.
  r := public.read_home_creator_ranking('ko', 50);
  if r ->> 'metric' <> 'fans' or exists (select 1 from jsonb_array_elements(r -> 'rows') x join public.celebrities c on c.slug = x ->> 'slug'
      where (x ->> 'score')::bigint <> (select h.score from public.home_ranking_daily h where h.kind = 'creator_jjinfan' and h.day = '2099-06-01' and h.subject_id = c.id)
         or (x ->> 'score')::bigint <> public.creator_jjinfan_count(c.id)) then raise exception '16 creator default: %', r; end if;
  r := public.read_home_fan_ranking(null, 50);
  if r ->> 'metric' <> 'hearts' or (select (x ->> 'score')::int from jsonb_array_elements(r -> 'rows') x where x ->> 'nickname' = 'hm_h1') <> 5 then raise exception '16 fan default: %', r; end if;
  -- Creator by hearts: cb has 2 fans (h2 3, p1 1) = 4 hearts, ca has 2 fans (h1 5, h3 1) = 6 hearts. fans and hearts named on both metrics.
  one := pg_temp.creator('hm-ca', 'hearts');
  if (one ->> 'rank')::int <> 1 or (one ->> 'score')::int <> 6 or (one ->> 'hearts')::int <> 6 or (one ->> 'fans')::int <> 2 then raise exception 'creator hearts ca: %', one; end if;
  one := pg_temp.creator('hm-cb', 'fans');
  if (one ->> 'fans')::int <> 2 or (one ->> 'hearts')::int <> 4 or (one ->> 'score')::int <> 2 then raise exception 'creator fans cb: %', one; end if;

  -- 1 / 2: day 06-02 (cc gains h3 5 hearts, a newcomer). 06-03 skipped. 06-04 compares with 06-02.
  perform pg_temp.heart(pg_temp.id('h3'), cc, 5, d0 + interval '20 hours');
  perform public.refresh_home_rankings(d0 + interval '1 day');
  r := public.read_home_creator_ranking_v2('ko', 'fans', 50);
  if not (r -> 'comparable')::boolean or r ->> 'previousDay' <> '2099-06-01' then raise exception '1 second day: %', r; end if;
  if pg_temp.creator('hm-cc', 'fans') -> 'delta' <> 'null'::jsonb then raise exception '1 newcomer is new: %', pg_temp.creator('hm-cc'); end if;
  if jsonb_typeof(pg_temp.creator('hm-ca', 'fans') -> 'delta') <> 'number' then raise exception '1 kept row moves: %', pg_temp.creator('hm-ca'); end if;
  -- h3 6 hearts now: hearts order h3, h1, h2, p1 -> h3 went up 2 (rank 3 -> 1).
  if (pg_temp.fan('hm_h3', 'hearts') ->> 'delta')::int <> 2 then raise exception '1 fan delta: %', pg_temp.fan('hm_h3', 'hearts'); end if;
  perform public.refresh_home_rankings(d0 + interval '3 days');
  if public.read_home_fan_ranking_v2(null, 'points', 5) ->> 'previousDay' <> '2099-06-02' then raise exception '2 skipped day'; end if;

  -- 7: weekGain from the oldest record within seven days; points: p1 gained nothing, z1 +25 since 06-01.
  perform pg_temp.pts(pg_temp.id('z1'), cb, 25, d0 + interval '3 days 1 hour');
  perform public.refresh_home_rankings(d0 + interval '4 days');
  if (pg_temp.fan('hm_z1', 'points') ->> 'weekGain')::int <> 25 or (pg_temp.fan('hm_p1', 'points') ->> 'weekGain')::int <> 0 then raise exception '7 points week gain: %', pg_temp.fan('hm_z1', 'points'); end if;
  if (public.read_home_fan_ranking_v2(null, 'points', 5) ->> 'weekGainDays')::int <> 4 then raise exception '7 points days'; end if;
  if (public.read_home_fan_ranking_v2(null, 'hearts', 5) ->> 'weekGainDays')::int <> 7 then raise exception '7 hearts days (05-29 base)'; end if;

  -- 15: favorite (D-4), both fan kinds. Hearts to cb for every case so the most-hearts rule would name cb.
  --   fv1 named ca, most hearts cb -> ca. fv2 named cz (no hearts there) -> cz. fv3 named cx, then cx unlisted -> null (not cb).
  --   fv4 named nobody -> cb. fv5 points only: named ca -> ca. fv6 points only, named nobody -> null.
  perform pg_temp.heart(pg_temp.id(u.tag), cb, 2, d0 + interval '4 days 1 hour') from unnest(array['fv1', 'fv2', 'fv3', 'fv4']) u(tag);
  perform pg_temp.pts(pg_temp.id(u.tag), cb, 7, d0 + interval '4 days 1 hour') from unnest(array['fv5', 'fv6']) u(tag);
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id) values (pg_temp.id('fv1'), ca), (pg_temp.id('fv2'), cz), (pg_temp.id('fv3'), cx), (pg_temp.id('fv5'), ca)
    on conflict (app_user_id) do update set favorite_celebrity_id = excluded.favorite_celebrity_id;
  update public.group_pages set listed = false where celebrity_id = cx;
  perform public.refresh_home_rankings(d0 + interval '5 days');
  if pg_temp.fan('hm_fv1') -> 'favorite' ->> 'slug' <> 'hm-ca' then raise exception '15 ① %', pg_temp.fan('hm_fv1'); end if;
  if pg_temp.fan('hm_fv2') -> 'favorite' ->> 'slug' <> 'hm-cz' then raise exception '15 ② %', pg_temp.fan('hm_fv2'); end if;
  if pg_temp.fan('hm_fv3') -> 'favorite' <> 'null'::jsonb then raise exception '15 ③ %', pg_temp.fan('hm_fv3'); end if;
  if pg_temp.fan('hm_fv4') -> 'favorite' ->> 'slug' <> 'hm-cb' then raise exception '15 ④ %', pg_temp.fan('hm_fv4'); end if;
  if pg_temp.fan('hm_fv5', 'points') -> 'favorite' ->> 'slug' <> 'hm-ca' or pg_temp.fan('hm_fv6', 'points') -> 'favorite' <> 'null'::jsonb then raise exception '15 ⑤ % %', pg_temp.fan('hm_fv5', 'points'), pg_temp.fan('hm_fv6', 'points'); end if;
  if pg_temp.fan('hm_fv1', 'points') is not null then raise exception '15 fv1 has no points'; end if;
  -- The profile card names the MY favorite with fan_profile_favorite_json: same slug for ① ② ⑤. ③: the card still names cx (it does not read
  -- the listed flag), the ranking row names nobody (recorded difference).
  if (select public.fan_profile_favorite_json(favorite_celebrity_id, 'ko') ->> 'slug' from public.fan_profile_public_fields where app_user_id = pg_temp.id('fv1')) <> 'hm-ca'
     or (select public.fan_profile_favorite_json(favorite_celebrity_id, 'ko') ->> 'slug' from public.fan_profile_public_fields where app_user_id = pg_temp.id('fv2')) <> 'hm-cz'
     or (select public.fan_profile_favorite_json(favorite_celebrity_id, 'ko') ->> 'slug' from public.fan_profile_public_fields where app_user_id = pg_temp.id('fv5')) <> 'hm-ca' then raise exception '15 card differs'; end if;
  raise notice '15 ③ card favorite of fv3: % (ranking row: null)', (select public.fan_profile_favorite_json(favorite_celebrity_id, 'ko') ->> 'slug' from public.fan_profile_public_fields where app_user_id = pg_temp.id('fv3'));
  -- After the build: ca unlisted -> read-time null; fv1 switches to cz -> next build cz.
  update public.group_pages set listed = false where celebrity_id = ca;
  if pg_temp.fan('hm_fv1') -> 'favorite' <> 'null'::jsonb then raise exception '15 read-time unlisted: %', pg_temp.fan('hm_fv1'); end if;
  update public.group_pages set listed = true where celebrity_id = ca;
  update public.fan_profile_public_fields set favorite_celebrity_id = cz where app_user_id = pg_temp.id('fv1');
  perform public.refresh_home_rankings(d0 + interval '5 days');
  if pg_temp.fan('hm_fv1') -> 'favorite' ->> 'slug' <> 'hm-cz' then raise exception '15 changed favorite: %', pg_temp.fan('hm_fv1'); end if;

  -- 10: cb goes unlisted after the build: it leaves both creator lists at read time and the rest close up; a favorite naming it reads null.
  update public.group_pages set listed = false where celebrity_id = cb;
  if pg_temp.creator('hm-cb', 'fans') is not null or pg_temp.creator('hm-cb', 'hearts') is not null then raise exception '10 unlisted creator listed'; end if;
  if exists (select 1 from jsonb_array_elements(public.read_home_creator_ranking_v2('ko', 'hearts', 50) -> 'rows') with ordinality as x(v, n) where (v ->> 'rank')::int <> n) then raise exception '10 ranks not closed up'; end if;
  if pg_temp.fan('hm_fv4') -> 'favorite' <> 'null'::jsonb then raise exception '10 favorite of an unlisted page'; end if;
  update public.group_pages set listed = true where celebrity_id = cb;
  -- An anonymous fan page: its hearts and points leave the sums at the next build (z1's points are all on cb).
  update public.group_pages set anonymous = true where celebrity_id = cb and kind = 'fan';
  perform public.refresh_home_rankings(d0 + interval '6 days');
  if pg_temp.fan('hm_z1', 'points') is not null or pg_temp.fan('hm_h2', 'hearts') is not null or pg_temp.creator('hm-cb', 'fans') is not null then raise exception '10 anonymous page still counted'; end if;
  update public.group_pages set anonymous = false where celebrity_id = cb and kind = 'fan';

  -- 11: sanctioned members leave both fan kinds; a block with the viewer hides the row from that viewer only. No id, email or amount key leaves.
  perform pg_temp.heart(pg_temp.id('sanc'), ca, 9, d0 + interval '6 days'), pg_temp.pts(pg_temp.id('sanc'), ca, 900, d0 + interval '6 days'),
          pg_temp.heart(pg_temp.id('blk'), ca, 8, d0 + interval '6 days'), pg_temp.pts(pg_temp.id('blk'), ca, 800, d0 + interval '6 days'),
          pg_temp.heart(pg_temp.id('viewer'), ca, 1, d0 + interval '6 days');
  set local session_replication_role = replica;
  insert into public.app_user_moderation_restrictions(app_user_id, report_id, reason, actor_admin_id) values (pg_temp.id('sanc'), extensions.gen_random_uuid(), '지표 시험용 제재 사유입니다', extensions.gen_random_uuid());
  insert into public.user_blocks(app_user_id, blocked_app_user_id) values (pg_temp.id('blk'), pg_temp.id('viewer'));
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d0 + interval '7 days');
  if pg_temp.fan('hm_sanc', 'hearts') is not null or pg_temp.fan('hm_sanc', 'points') is not null then raise exception '11 sanctioned listed'; end if;
  if pg_temp.fan('hm_blk', 'points') is null or pg_temp.fan('hm_blk', 'points', pg_temp.id('viewer')) is not null or pg_temp.fan('hm_blk', 'hearts', pg_temp.id('viewer')) is not null then raise exception '11 block'; end if;
  foreach t in array array['hearts', 'points'] loop
    r := public.read_home_fan_ranking_v2(pg_temp.id('viewer'), t, 50);
    -- Only the approved signed-in profileRef may carry an identifier; all other fields stay private.
    one := jsonb_set(r, '{rows}', (select jsonb_agg(e - 'profileRef') from jsonb_array_elements(r->'rows') e));
    if one::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' or one::text like '%@example.test%' or jsonb_path_exists(one, 'strict $.**.amount') or jsonb_path_exists(one, 'strict $.**.appUserId') or jsonb_path_exists(one, 'strict $.**.subjectId')
      then raise exception '11 keys: %', r; end if;
    one := public.read_home_fan_ranking_v2(null, t, 50);
    if one::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' or jsonb_path_exists(one, 'strict $.**.profileRef') or jsonb_path_exists(one, 'strict $.**.profileId') then raise exception '11 guest keys'; end if;
    if (r -> 'me' ->> 'rank') is null and t = 'hearts' then raise exception '11 viewer me: %', r; end if;
  end loop;
  r := public.read_home_fan_ranking_v2(pg_temp.id('viewer'), 'hearts', 50);
  if (select array_agg(k order by k) from jsonb_object_keys(r -> 'me') k) <> array['delta', 'hearts', 'inTop', 'points', 'rank', 'score'] then raise exception '11 me keys: %', r -> 'me'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['builtDay', 'comparable', 'computedAt', 'day', 'failedAt', 'me', 'metric', 'previousDay', 'rows', 'state', 'today', 'weekGainDays'] then raise exception '11 head keys: %', r; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r -> 'rows' -> 0) k) <> array['characterId', 'dayGain', 'delta', 'fans', 'favorite', 'hearts', 'isMe', 'isNew', 'nickname', 'points', 'profileRef', 'rank', 'score', 'tier', 'weekGain'] then raise exception '11 row keys: %', r -> 'rows' -> 0; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(public.read_home_creator_ranking_v2('ko', 'fans', 5) -> 'rows' -> 0) k) <> array['challenge', 'dayGain', 'delta', 'fans', 'hearts', 'imageUrl', 'isNew', 'liveNow', 'name', 'points', 'rank', 'score', 'slug', 'weekGain'] then raise exception '11 creator row keys'; end if;

  -- 14: a member with nothing (no hearts, points, friends or talks) as viewer: me null, rows as for anyone.
  r := public.read_home_fan_ranking_v2(pg_temp.id('empty'), 'points', 50);
  if r -> 'me' <> 'null'::jsonb or jsonb_array_length(r -> 'rows') = 0 then raise exception '14 empty viewer: %', r; end if;

  -- 3 ①②: 06-09 nobody holds a heart: the hearts list is empty on that day (not 06-08's rows). 06-10 two fans: previous 06-09, all new.
  set local session_replication_role = replica;
  delete from public.creator_heart_ledger;
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d0 + interval '8 days');
  r := public.read_home_fan_ranking_v2(null, 'hearts', 50);
  if r ->> 'state' <> 'empty' or r ->> 'day' <> '2099-06-09' or jsonb_array_length(r -> 'rows') <> 0 then raise exception '3 ① empty day: %', r; end if;
  if public.read_home_creator_ranking_v2('ko', 'hearts', 50) ->> 'state' <> 'empty' then raise exception '3 ① creators empty'; end if;
  if public.read_home_fan_ranking_v2(null, 'points', 50) ->> 'state' <> 'ready' then raise exception '3 ① points still ready'; end if;
  perform pg_temp.heart(pg_temp.id('h1'), ca, 1, d0 + interval '8 days 2 hours'), pg_temp.heart(pg_temp.id('h2'), ca, 2, d0 + interval '8 days 2 hours');
  perform public.refresh_home_rankings(d0 + interval '9 days');
  r := public.read_home_fan_ranking_v2(null, 'hearts', 50);
  if r ->> 'previousDay' <> '2099-06-09' or not (r -> 'comparable')::boolean or exists (select 1 from jsonb_array_elements(r -> 'rows') x where x -> 'delta' <> 'null'::jsonb) then raise exception '3 ② %', r; end if;

  -- 8: midnight. 23:59:59.999 and 00:00 KST are two days; the second compares with the first.
  perform public.refresh_home_rankings('2099-06-20 23:59:59.999+09'), public.refresh_home_rankings('2099-06-21 00:00:00+09');
  if (select count(*) from public.home_ranking_kind_builds where kind = 'fan_hearts' and day in ('2099-06-20', '2099-06-21')) <> 2
     or public.read_home_fan_ranking_v2(null, 'hearts', 5) ->> 'previousDay' <> '2099-06-20' then raise exception '8 midnight'; end if;
  raise notice 'PASS home ranking metrics 1-2, 3①②, 4-8, 10-11, 14-16';
end $$;

-- 3 ③ and 9 ①: a day that is late (yesterday's snapshot, today's first build failed) and the ten-minute rebuild. Real days.
do $$
declare r jsonb; e jsonb; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  delete from public.home_ranking_kind_builds where day > today - 2;
  delete from public.home_ranking_daily where day > today - 2;
  delete from public.home_ranking_builds where day > today - 2;
  perform public.refresh_home_rankings(now() - interval '1 day');
  create function pg_temp.boom() returns trigger language plpgsql as $f$ begin raise exception 'test build failure'; end $f$;
  create trigger home_ranking_boom before insert on public.home_ranking_daily for each row execute function pg_temp.boom();
  e := public.ensure_home_rankings();
  if not coalesce((e ->> 'failed')::boolean, false) then raise exception '3 ③ ensure: %', e; end if;
  r := public.read_home_fan_ranking_v2(null, 'hearts', 50);
  if r ->> 'state' <> 'stale' or (r ->> 'day')::date <> today - 1 or r -> 'failedAt' = 'null'::jsonb or jsonb_array_length(r -> 'rows') = 0 then raise exception '3 ③ stale: %', r; end if;
  -- Within five minutes nobody tries again.
  e := public.ensure_home_rankings();
  if not coalesce((e ->> 'waiting')::boolean, false) then raise exception '3 ③ retry within five minutes: %', e; end if;
  drop trigger home_ranking_boom on public.home_ranking_daily;
  delete from public.home_ranking_build_failures;
  -- 9 ①: today written 11 minutes ago is rebuilt; 9 minutes ago is not.
  perform public.refresh_home_rankings(now() - interval '11 minutes');
  e := public.ensure_home_rankings();
  if not (e ->> 'built')::boolean then raise exception '9 ① 11 minutes: %', e; end if;
  perform public.refresh_home_rankings(now() - interval '9 minutes');
  e := public.ensure_home_rankings();
  if (e ->> 'built')::boolean or e ? 'busy' then raise exception '9 ① 9 minutes: %', e; end if;
  r := public.read_home_fan_ranking_v2(null, 'hearts', 50);
  if r ->> 'state' <> 'ready' or (r ->> 'previousDay')::date <> today - 1 or r -> 'failedAt' <> 'null'::jsonb then raise exception '9 today head: %', r; end if;
  raise notice 'PASS home ranking metrics 3③ 9①';
end $$;

-- 12: grants. anon and authenticated may call nothing and read no table; the service role calls the readers and ensure only.
do $$
declare f text; r text; ok boolean;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    foreach f in array array['refresh_home_rankings()', 'ensure_home_rankings()', 'home_ranking_days(''fan_hearts'')', 'heart_totals()',
        'read_home_fan_ranking_v2(null, ''hearts'', 5)', 'read_home_creator_ranking_v2(''ko'', ''fans'', 5)', 'read_home_fan_ranking(null, 5)', 'read_home_creator_ranking(''ko'', 5)',
        'home_ranking_daily', 'home_ranking_builds', 'home_ranking_build_failures', 'home_ranking_kind_builds'] loop
      begin
        execute format('set local role %I', r);
        if f like '%(%' then execute 'select public.' || f; else execute 'select count(*) from public.' || f; end if;
        ok := true;
      exception when insufficient_privilege then ok := false;
      end;
      execute 'reset role';
      if ok <> (r = 'service_role' and f in ('ensure_home_rankings()', 'read_home_fan_ranking_v2(null, ''hearts'', 5)', 'read_home_creator_ranking_v2(''ko'', ''fans'', 5)', 'read_home_fan_ranking(null, 5)', 'read_home_creator_ranking(''ko'', 5)'))
        then raise exception '12 % on %: allowed=%', r, f, ok; end if;
    end loop;
  end loop;
  begin perform public.read_home_fan_ranking_v2(null, 'stamps', 5); raise exception '12 bad metric accepted'; exception when invalid_parameter_value then null; end;
  raise notice 'PASS home ranking metrics 12 (grants)';
end $$;
rollback;
