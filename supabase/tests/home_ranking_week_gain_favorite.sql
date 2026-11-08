\set ON_ERROR_STOP on
-- 20261216020000: creators' weekGain over a rolling seven days (null on the first day, from 0 for a creator not ranked then, fewer days in the first
-- week), and fans' favorite = the creator given the most hearts (ties to the earlier achieved_at), only a listed public page, dropped at read time
-- once the page is unlisted. Keys of both answers, no member id, and the rollback. One transaction, rolled back; the ledger is emptied inside it.
begin;
do $$
declare
  d1 constant timestamptz := '2099-05-01 12:00+09'; d3 constant timestamptz := '2099-05-03 12:00+09'; d9 constant timestamptz := '2099-05-09 12:00+09';
  a uuid := extensions.gen_random_uuid(); b uuid := extensions.gen_random_uuid(); hidden uuid := extensions.gen_random_uuid(); late_cel uuid := extensions.gen_random_uuid();
  f1 uuid := extensions.gen_random_uuid(); f2 uuid := extensions.gen_random_uuid(); f3 uuid := extensions.gen_random_uuid(); f4 uuid := extensions.gen_random_uuid(); f5 uuid := extensions.gen_random_uuid();
  u uuid; c uuid; result jsonb; row jsonb;
  nick text;
begin
  set local session_replication_role = replica;
  delete from public.creator_heart_ledger;
  delete from public.fan_heart_conversions;
  delete from public.home_ranking_daily;
  delete from public.home_ranking_builds;
  foreach c in array array[a, b, hidden, late_cel] loop
    insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (c, 'hwg-' || left(c::text, 8), 'published', '/fixture.webp', now(), '{creator}', 'creator');
    insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '주간 ' || left(c::text, 4), '소개', '사진');
  end loop;
  insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (a, 'en', 'Weekly A', 'About', 'Photo');
  insert into public.group_pages(kind, celebrity_id, name) values ('fan', a, 'A'), ('fan', b, 'B'), ('fan', late_cel, 'Late');
  insert into public.group_pages(kind, celebrity_id, name, listed) values ('fan', hidden, 'Hidden', false);
  foreach u in array array[f1, f2, f3, f4, f5] loop
    insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:privy:hwg-' || u, u || '@example.test');
    insert into public.user_profiles(app_user_id, nickname, nickname_normalized) values (u, 'hwg' || left(u::text, 8), 'hwg' || left(u::text, 8));
  end loop;
  -- Day 1. f1: a 3, b 1 -> a. f2: a 1, b 2 -> b. f3: hidden 5, a 1 -> a (the unlisted page never qualifies). f4: a 1 (earlier), b 1 (later) -> a.
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select x.cel, x.who, 1, 'passport_page_claim', extensions.gen_random_uuid(), d1 - interval '1 hour' * x.n from (values
    (a, f1, 1), (a, f1, 2), (a, f1, 3), (b, f1, 4), (a, f2, 5), (b, f2, 6), (b, f2, 7),
    (hidden, f3, 1), (hidden, f3, 2), (hidden, f3, 3), (hidden, f3, 4), (hidden, f3, 5), (a, f3, 6), (a, f4, 9), (b, f4, 2)) as x(cel, who, n);
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d1);

  -- First day: nothing to compare against.
  result := public.read_home_creator_ranking('ko', 20);
  if result -> 'weekGainDays' <> 'null'::jsonb or exists (select 1 from jsonb_array_elements(result -> 'rows') r where r -> 'weekGain' <> 'null'::jsonb)
    then raise exception 'Week gain on the first day: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['challenge', 'delta', 'hearts', 'imageUrl', 'name', 'rank', 'score', 'slug', 'weekGain'])
    then raise exception 'Creator row keys: %', result; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(result) k) <> array['builtDay', 'comparable', 'computedAt', 'day', 'rows', 'weekGainDays'] then raise exception 'Creator head keys: %', result; end if;

  -- Favorite: most hearts, tie to the earlier achieved_at; never the unlisted page.
  result := public.read_home_fan_ranking(null, 20);
  for row in select r from jsonb_array_elements(result -> 'rows') r loop
    nick := row ->> 'nickname';
    if nick = 'hwg' || left(f1::text, 8) and row -> 'favorite' ->> 'slug' <> 'hwg-' || left(a::text, 8) then raise exception 'f1 favorite: %', row; end if;
    if nick = 'hwg' || left(f2::text, 8) and row -> 'favorite' ->> 'slug' <> 'hwg-' || left(b::text, 8) then raise exception 'f2 favorite: %', row; end if;
    if nick = 'hwg' || left(f3::text, 8) and row -> 'favorite' ->> 'slug' <> 'hwg-' || left(a::text, 8) then raise exception 'f3 favorite (unlisted page chosen?): %', row; end if;
    if nick = 'hwg' || left(f4::text, 8) and row -> 'favorite' ->> 'slug' <> 'hwg-' || left(a::text, 8) then raise exception 'f4 tie: %', row; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(row) k) <> array['characterId', 'delta', 'favorite', 'isMe', 'nickname', 'rank', 'score', 'tier', 'weekGain']
      then raise exception 'Fan row keys: %', row; end if;
  end loop;
  if (select r -> 'favorite' -> 'names' from jsonb_array_elements(result -> 'rows') r where r ->> 'nickname' = 'hwg' || left(f1::text, 8))
     <> jsonb_build_object('ko', '주간 ' || left(a::text, 4), 'en', 'Weekly A') then raise exception 'Favorite names: %', result; end if;
  if result::text like '%hidden%' or result::text like '%hwg-' || left(hidden::text, 8) || '%' then raise exception 'Unlisted page named: %', result; end if;
  foreach u in array array[f1, f2, f3, f4, f5, a, b, hidden] loop
    if result::text like '%' || u::text || '%' then raise exception 'An id is in the fan answer: %', result; end if;
  end loop;

  -- Day 3: a gains f5; late_cel enters with f5.
  set local session_replication_role = replica;
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  values (a, f5, 1, 'passport_page_claim', extensions.gen_random_uuid(), d3 - interval '1 hour'), (late_cel, f5, 1, 'passport_page_claim', extensions.gen_random_uuid(), d3 - interval '2 hours');
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d3);
  result := public.read_home_creator_ranking('ko', 20);
  if (result ->> 'weekGainDays')::int <> 2 then raise exception 'Days in the first week: %', result; end if;
  if (select (r ->> 'weekGain')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'hwg-' || left(a::text, 8)) <> 1 then raise exception 'a gain: %', result; end if;
  if (select (r ->> 'weekGain')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'hwg-' || left(b::text, 8)) <> 0 then raise exception 'b gain 0: %', result; end if;
  if (select (r ->> 'weekGain')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'hwg-' || left(late_cel::text, 8)) <> 1 then raise exception 'New creator counts from 0: %', result; end if;

  -- Day 9: the window is 05-02..05-08, so the base is day 3 (day 1 fell out). Seven days span, gain measured from day 3.
  set local session_replication_role = replica;
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  values (b, f3, 1, 'passport_page_claim', extensions.gen_random_uuid(), d9 - interval '1 hour'), (b, f5, 1, 'passport_page_claim', extensions.gen_random_uuid(), d9 - interval '2 hours');
  set local session_replication_role = origin;
  perform public.refresh_home_rankings(d9);
  result := public.read_home_creator_ranking('ko', 20);
  if (result ->> 'weekGainDays')::int <> 6 then raise exception 'Rolling window base: %', result; end if;
  if (select (r ->> 'weekGain')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'hwg-' || left(b::text, 8)) <> 2 then raise exception 'b gain over the window: %', result; end if;
  if (select (r ->> 'weekGain')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'hwg-' || left(a::text, 8)) <> 0 then raise exception 'a gain over the window: %', result; end if;
  -- 찐팬 stays the creator_jjinfan_count definition.
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r join public.celebrities c on c.slug = r ->> 'slug' where (r ->> 'score')::bigint <> public.creator_jjinfan_count(c.id))
    then raise exception '찐팬 definition changed: %', result; end if;

  -- The favorite's page goes unlisted after the write: the reader no longer names it.
  update public.group_pages set listed = false where celebrity_id = a;
  result := public.read_home_fan_ranking(null, 20);
  if result::text like '%hwg-' || left(a::text, 8) || '%' then raise exception 'Unlisted favorite still named: %', result; end if;
  if (select r -> 'favorite' from jsonb_array_elements(result -> 'rows') r where r ->> 'nickname' = 'hwg' || left(f1::text, 8)) <> 'null'::jsonb then raise exception 'Favorite not null: %', result; end if;
  update public.group_pages set listed = true where celebrity_id = a;

  -- Readers still never count hearts.
  if pg_get_functiondef('public.read_home_fan_ranking(uuid,integer)'::regprocedure) ~ 'heart_totals|creator_heart_ledger|get_fan_effective_tier'
     or pg_get_functiondef('public.read_home_creator_ranking(text,integer)'::regprocedure) ~ 'heart_totals|creator_heart_ledger' then raise exception 'A reader counts hearts'; end if;
  execute 'set local role service_role';
  perform public.read_home_fan_ranking(null, 20);
  perform public.read_home_creator_ranking('ko', 20);
  execute 'reset role';
  raise notice 'PASS home ranking week gain and favorite';
end $$;
rollback;
